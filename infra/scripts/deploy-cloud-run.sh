#!/usr/bin/env bash
set -euo pipefail

# Deploy FINVERSE to Cloud Run using a checked-out repository and a local
# env-vars YAML file. Secrets stay in the operator's Cloud Shell; this script
# never writes them to git or prints their values.
#
# Usage:
#   ./infra/scripts/deploy-cloud-run.sh ./infra/cloudrun.env.yaml
#
# The env file must contain the production variables documented in
# docs/17-public-hosting-google-cloud-run.md. Set DATABASE_URL and
# DATABASE_APP_URL to the Neon direct connection URLs. Keep the file private.

ENV_FILE="${1:-infra/cloudrun.env.yaml}"
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
REPOSITORY="${ARTIFACT_REPOSITORY:-finverse}"
SERVICE="${CLOUD_RUN_SERVICE:-finverse}"
IMAGE="${FINVERSE_IMAGE:-${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:$(git rev-parse --short HEAD)}"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "No Google Cloud project is selected. Run: gcloud config set project PROJECT_ID" >&2
  exit 1
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Environment file not found: ${ENV_FILE}" >&2
  echo "Copy infra/cloudrun.env.example to a private YAML file and fill it in." >&2
  exit 1
fi

# The migration job needs the schema-owner URL; the serving process must not
# receive it. Build a private, short-lived runtime env file containing only the
# least-privileged application URL and the ordinary service settings.
umask 077
RUNTIME_ENV_FILE="$(mktemp /tmp/finverse-runtime-env.XXXXXX)"
case "${RUNTIME_ENV_FILE}" in
  /tmp/finverse-runtime-env.*) ;;
  *) echo "Unexpected temporary env path: ${RUNTIME_ENV_FILE}" >&2; exit 1 ;;
esac
cleanup_runtime_env() {
  if [[ -n "${RUNTIME_ENV_FILE:-}" && -f "${RUNTIME_ENV_FILE}" && "${RUNTIME_ENV_FILE}" == /tmp/finverse-runtime-env.* ]]; then
    rm -f -- "${RUNTIME_ENV_FILE}"
  fi
}
trap cleanup_runtime_env EXIT
grep -v '^DATABASE_URL:' "${ENV_FILE}" > "${RUNTIME_ENV_FILE}"
if ! grep -q '^DATABASE_APP_URL:' "${RUNTIME_ENV_FILE}"; then
  echo "DATABASE_APP_URL is required in ${ENV_FILE}." >&2
  exit 1
fi

SHA="$(git rev-parse HEAD)"
if ! grep -q '^GIT_SHA:' "${RUNTIME_ENV_FILE}"; then
  printf 'GIT_SHA: "%s"\n' "${SHA}" >> "${RUNTIME_ENV_FILE}"
fi

gcloud artifacts repositories describe "${REPOSITORY}" \
  --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "${REPOSITORY}" \
    --repository-format=docker --location="${REGION}" \
    --description="FINVERSE container images" --project="${PROJECT_ID}"

if gcloud artifacts docker images describe "${IMAGE}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Reusing existing image ${IMAGE}."
else
  gcloud builds submit . \
    --project="${PROJECT_ID}" \
    --config=cloudbuild.yaml \
    --substitutions="_IMAGE=${IMAGE},_GIT_SHA=$(git rev-parse HEAD)"
fi

# Migrations run once as a Cloud Run Job with the schema-owner URL. The
# application service receives the same env file but never runs migrations on
# boot. The job is idempotent and provisions the restricted RLS role.
gcloud run jobs deploy "${SERVICE}-migrate" \
  --image="${IMAGE}" --region="${REGION}" --project="${PROJECT_ID}" \
  --command=node --args=dist/infra/postgres/migrate.js \
  --env-vars-file="${ENV_FILE}" --max-retries=1
gcloud run jobs execute "${SERVICE}-migrate" \
  --region="${REGION}" --project="${PROJECT_ID}" --wait

gcloud run deploy "${SERVICE}" \
  --image="${IMAGE}" --region="${REGION}" --project="${PROJECT_ID}" \
  --allow-unauthenticated --port=3000 --memory=1Gi --max-instances=1 \
  --env-vars-file="${RUNTIME_ENV_FILE}"

URL="$(gcloud run services describe "${SERVICE}" --region="${REGION}" \
  --project="${PROJECT_ID}" --format='value(status.url)')"
echo
echo "FINVERSE is live at: ${URL}/app/"
echo "Health check:        ${URL}/api/readiness"
echo "Identity:            ${URL}/api/version"
READINESS="$(curl --fail --silent --show-error --max-time 20 "${URL}/api/readiness")"
echo "${READINESS}" | grep -F '"service":"finverse-api"' >/dev/null
VERSION="$(curl --fail --silent --show-error --max-time 20 "${URL}/api/version")"
echo "${VERSION}" | grep -F '"service":"finverse-api"' >/dev/null
echo "${VERSION}" | grep -F "\"sha\":\"${SHA}\"" >/dev/null || echo "${VERSION}" | grep -F "\"sha\":\"${SHA:0:7}\"" >/dev/null
LEGAL="$(curl --fail --silent --show-error --max-time 20 "${URL}/api/legal")"
echo "${LEGAL}" | grep -F 'example.com' >/dev/null && {
  echo "Legal URLs still point at example.com. Replace LEGAL_* before collecting real-user data." >&2
  exit 1
}
curl --fail --silent --show-error --max-time 20 "${URL}/api/categories" >/dev/null
curl --fail --silent --show-error --max-time 20 "${URL}/api/webauthn/status" >/dev/null
APP="$(curl --fail --silent --show-error --max-time 20 "${URL}/app/")"
echo "${APP}" | grep -F '<base href="/app/">' >/dev/null
echo
echo "Set CORS_ORIGINS to ${URL} in ${ENV_FILE}, then rerun this script once"
echo "to replace the temporary CORS origin with the final Cloud Run origin."
