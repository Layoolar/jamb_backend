# Deploying SabiPass

One Linux box. Postgres and the app co-located — no network hop between them,
which matters because a single duel is ~21 short round-trips. No Docker: one
Node process plus one database does not need an orchestration layer.

## First-time setup

```bash
# 1. Postgres from the PGDG repo (not the distro's, so the major version is pinned)
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update && sudo apt install -y postgresql-18

sudo -u postgres createuser --pwprompt sabipass
sudo -u postgres createdb --owner=sabipass sabipass

# 2. Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 3. App user and directory
sudo useradd --system --home /srv/sabipass --shell /usr/sbin/nologin sabipass
sudo install -d -o sabipass -g sabipass /srv/sabipass/api

# 4. Secrets — root-owned, 600. NEVER in the systemd unit, which is world-readable.
sudo install -d -m 700 /etc/sabipass
sudo tee /etc/sabipass/api.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=4000
LOG_LEVEL=info
DATABASE_URL=postgres://sabipass:CHANGE_ME@localhost:5432/sabipass
JWT_SECRET=CHANGE_ME
GOOGLE_CLIENT_IDS=...,...,...
APPLE_BUNDLE_ID=com.sabipass.app
RESEND_API_KEY=...
MAIL_FROM=SabiPass <no-reply@sabipass.com>
SENTRY_DSN=...
EOF
sudo chmod 600 /etc/sabipass/api.env

# Generate the JWT secret — do not invent one
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 5. Service
sudo cp deploy/sabipass-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now sabipass-api

# 6. TLS
sudo apt install -y caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # edit the domain first
sudo systemctl reload caddy

# 7. Backups
sudo install -d -o sabipass /var/backups/sabipass
sudo -u sabipass crontab -e
#   17 2 * * *  /srv/sabipass/api/deploy/backup.sh >> /var/log/sabipass-backup.log 2>&1
```

## Deploying a change

```bash
cd /srv/sabipass/api
git pull
npm ci --omit=dev
npm run build
npm run db:migrate
sudo systemctl restart sabipass-api
curl -fsS https://api.sabipass.com/health
```

`systemctl restart` drops in-flight requests. For a match in progress that means
one failed answer, and the client retries — but the idempotent question serve
means the player does not lose their place or gain extra time. Deploy off-peak
anyway; evening study hours are the load peak.

## Backups

`backup.sh` dumps nightly to `/var/backups/sabipass` and pushes to B2 when
`B2_BUCKET` is set. Leave it unset and a disk failure takes the backups with the
database.

**`restore-check.sh` is the part people skip.** It restores the newest dump into
a scratch database and counts rows. Run it before launch and after any schema
change. The failure it exists to catch is nightly dumps running happily for
months and turning out to be unrestorable on the day you need them.

## Where to host

The plan is deliberately provider-agnostic — Postgres is Postgres and a Node
process behind Caddy is the same everywhere, so this is a deploy-time decision,
not an architectural one. Two things that do matter:

- **Latency.** Lagos to London is roughly 90–120ms; Frankfurt adds ~60ms on top,
  and Johannesburg is often *worse* than London because African traffic still
  frequently routes via Europe. With a 15-second timer on top of 300–800ms
  mobile round-trips, put the box in London and measure from a real Lagos phone
  before committing.
- **Egress billing.** AWS charges $0.09/GB past the free allowance — the same
  rate that made Supabase unattractive. DigitalOcean bundles ~1TB per droplet;
  Hetzner includes 20TB. At this app's traffic that is the difference between a
  metered line item and none.
