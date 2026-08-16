# Public hosting on Oracle Always Free

This is the lowest-cost persistent deployment path for FINVERSE. It runs the
API, Flutter PWA, PostgreSQL, and Caddy HTTPS edge on one Oracle Always Free
Linux VM. The stack is ARM-compatible and uses a named Docker volume for the
database, so it does not depend on this Windows workstation.

Oracle describes Always Free compute as free for the life of the account, but
it can reclaim a VM that stays below its CPU, network, and (for ARM) memory
activity thresholds for seven days. It is therefore a beta/early-user hosting
path, not a production SLA. Keep a second copy of database backups outside the
VM. See the current Oracle terms before accepting real customer data.

## 1. Create the VM

In Oracle Cloud, create an Ubuntu image marked **Always Free Eligible** in the
tenancy's home region. Use `VM.Standard.A1.Flex` with 2 OCPUs and 8–12 GB RAM
if capacity is available. A smaller A1 instance also works. Add a public IPv4
address and open TCP ports 22, 80, and 443 in both the subnet security list and
the VM firewall. Do not create paid resources during the trial.

Install Docker:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker
docker compose version
```

## 2. Point a hostname at the VM

For a temporary free hostname, use a DNS service such as DuckDNS, or the
`<public-ip>.sslip.io` hostname. For anything sold to customers, use a domain
you control and create an A record pointing to the VM's reserved public IP.

Set `PUBLIC_API_DOMAIN` to that exact hostname. Caddy will obtain and renew the
HTTPS certificate automatically after DNS and ports 80/443 are working.

## 3. Deploy FINVERSE

Clone the repository on the VM and create the production environment file:

```sh
git clone <your-private-repository-url> finverse
cd finverse
cp infra/.env.oracle.example infra/.env.oracle
nano infra/.env.oracle
```

Generate secrets without putting them in shell history:

```sh
openssl rand -base64 48                 # JWT_SECRET
openssl rand -base64 32                 # MFA_ENCRYPTION_KEY
openssl rand -base64 32                 # BANK_TOKEN_ENCRYPTION_KEY
openssl rand -base64 24                 # database passwords/metrics token
```

Ensure `DATABASE_URL` uses the owner password and `DATABASE_APP_URL` uses a
different password. The migration container creates the restricted
`finverse_app` role before the API starts; the API container is explicitly
blocked from receiving `DATABASE_URL`.

Start the stack:

```sh
docker compose --env-file infra/.env.oracle \
  -f infra/docker-compose.oracle.yml up -d --build
docker compose --env-file infra/.env.oracle \
  -f infra/docker-compose.oracle.yml ps
curl -fsS "https://${PUBLIC_API_DOMAIN}/healthz"
```

Open `https://YOUR_PUBLIC_HOSTNAME/app/` in a browser. Do not set
`STORE=memory`; the compose file forces PostgreSQL and runs migrations before
the API becomes healthy.

## 4. Backups and updates

The database volume survives container restarts, but a volume is not a backup.
Create a host backup directory and schedule the included script from root's
crontab (for example, every night at 02:30 UTC):

```sh
sudo mkdir -p /var/backups/finverse
sudo crontab -e
30 2 * * * cd /home/ubuntu/finverse && FINVERSE_BACKUP_DIR=/var/backups/finverse /home/ubuntu/finverse/infra/scripts/backup-postgres.sh >> /var/log/finverse-backup.log 2>&1
```

Copy backups to a second location. Updating the app is a rolling-safe rebuild:

```sh
git pull --ff-only
docker compose --env-file infra/.env.oracle \
  -f infra/docker-compose.oracle.yml up -d --build
```

Check status and logs with `docker compose ... ps` and `docker compose ...
logs --tail=100 api migrate edge`. Never print or paste `infra/.env.oracle` in
an issue, chat, or support ticket.

## Remaining owner gates

This deployment does not grant Plaid production access, legal approval, store
signing, email delivery, push credentials, a custom domain, or a support/SLA
promise. Keep Plaid in Sandbox until the provider approves production, and do
not market the free VM as a guaranteed six-month production service.
