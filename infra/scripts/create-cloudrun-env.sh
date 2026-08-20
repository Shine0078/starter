#!/usr/bin/env bash
set -euo pipefail

# Creates the private Cloud Run env file without echoing database credentials.
# Run this in Cloud Shell after rotating any credential that was pasted into
# chat. The generated app password is hex-only and is safe in a URL.

OUT_FILE="${1:-$HOME/finverse-cloudrun.env.yaml}"
read -r -s -p "Paste the rotated Neon owner direct URL (hidden): " OWNER_URL
echo
if [[ -z "${OWNER_URL}" ]]; then
  echo "A Neon owner URL is required." >&2
  exit 1
fi

read -r -p "SMTP host [smtp.gmail.com]: " SMTP_HOST
SMTP_HOST="${SMTP_HOST:-smtp.gmail.com}"
read -r -p "SMTP port [587]: " SMTP_PORT
SMTP_PORT="${SMTP_PORT:-587}"
read -r -p "SMTP secure (true/false) [false]: " SMTP_SECURE
SMTP_SECURE="${SMTP_SECURE:-false}"
read -r -p "SMTP username/email: " SMTP_USER
if [[ -z "${SMTP_USER}" ]]; then
  echo "An SMTP username/email is required." >&2
  exit 1
fi
read -r -s -p "SMTP app password (hidden): " SMTP_PASSWORD
echo
if [[ -z "${SMTP_PASSWORD}" ]]; then
  echo "An SMTP app password is required." >&2
  exit 1
fi
read -r -p "From address [FINVERSE <${SMTP_USER}>]: " EMAIL_FROM
EMAIL_FROM="${EMAIL_FROM:-FINVERSE <${SMTP_USER}>}"

export FINVERSE_OWNER_URL="${OWNER_URL}"
export FINVERSE_APP_PASSWORD="$(openssl rand -hex 24)"
export FINVERSE_JWT_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))")"
export FINVERSE_MFA_KEY="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")"
export FINVERSE_BANK_KEY="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")"
export FINVERSE_SMTP_HOST="${SMTP_HOST}"
export FINVERSE_SMTP_PORT="${SMTP_PORT}"
export FINVERSE_SMTP_SECURE="${SMTP_SECURE}"
export FINVERSE_SMTP_USER="${SMTP_USER}"
export FINVERSE_SMTP_PASSWORD="${SMTP_PASSWORD}"
export FINVERSE_EMAIL_FROM="${EMAIL_FROM}"
unset OWNER_URL

mkdir -p "$(dirname "${OUT_FILE}")"
umask 077
node <<'NODE' > "${OUT_FILE}"
let owner;
try {
  owner = new URL(process.env.FINVERSE_OWNER_URL);
} catch {
  throw new Error('The Neon value is not a valid URL. Copy the complete connection string.');
}
if (!['postgres:', 'postgresql:'].includes(owner.protocol)) {
  throw new Error('The Neon value must be a PostgreSQL connection string.');
}
if (!owner.hostname.endsWith('.neon.tech')) {
  throw new Error(
    'The Neon hostname is incomplete. It must end with .neon.tech; use Copy snippet in Neon.',
  );
}
if (!owner.username || !owner.password || owner.password.includes('*')) {
  throw new Error(
    'The Neon connection string must include the real password. Click Show password, then Copy snippet.',
  );
}
const app = new URL(owner);
app.username = 'finverse_app';
app.password = process.env.FINVERSE_APP_PASSWORD;

const values = {
  NODE_ENV: 'production',
  STORE: 'postgres',
  MIGRATE_ON_BOOT: 'false',
  TRUST_PROXY_HOPS: '1',
  CORS_ORIGINS: 'https://placeholder.invalid',
  DATABASE_URL: owner.toString(),
  DATABASE_APP_URL: app.toString(),
  JWT_SECRET: process.env.FINVERSE_JWT_SECRET,
  MFA_ENCRYPTION_KEY: process.env.FINVERSE_MFA_KEY,
  BANK_TOKEN_ENCRYPTION_KEY: process.env.FINVERSE_BANK_KEY,
  HIBP_PASSWORD_CHECK: 'required',
  SMTP_HOST: process.env.FINVERSE_SMTP_HOST,
  SMTP_PORT: process.env.FINVERSE_SMTP_PORT,
  SMTP_SECURE: process.env.FINVERSE_SMTP_SECURE,
  SMTP_USER: process.env.FINVERSE_SMTP_USER,
  SMTP_PASSWORD: process.env.FINVERSE_SMTP_PASSWORD,
  EMAIL_FROM: process.env.FINVERSE_EMAIL_FROM,
};
for (const [key, value] of Object.entries(values)) {
  if (value === undefined) throw new Error(`Missing generated value for ${key}`);
  console.log(`${key}: ${JSON.stringify(value)}`);
}
NODE

unset FINVERSE_OWNER_URL FINVERSE_APP_PASSWORD FINVERSE_JWT_SECRET FINVERSE_MFA_KEY FINVERSE_BANK_KEY
unset FINVERSE_SMTP_HOST FINVERSE_SMTP_PORT FINVERSE_SMTP_SECURE FINVERSE_SMTP_USER FINVERSE_SMTP_PASSWORD FINVERSE_EMAIL_FROM
echo "Created ${OUT_FILE} with mode 600. It contains secrets; never commit or paste it."
echo "Set LEGAL_TERMS_VERSION, LEGAL_TERMS_URL, LEGAL_PRIVACY_VERSION, and LEGAL_PRIVACY_URL to reviewed HTTPS documents before collecting real-user data. Placeholder example.com hosts are refused."
