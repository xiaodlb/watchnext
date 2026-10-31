# Deploy WatchNext to Oracle Cloud Always Free

This deployment runs the existing Next.js application and PostgreSQL with Docker Compose on an Ubuntu ARM64 VM. Caddy provides HTTPS. PostgreSQL is not published to the public network; its named Docker volume persists across container replacements.

## Before creating the VM

1. Create an Oracle Cloud account and choose the home region carefully. Always Free compute is only available in that region. Account verification commonly asks for a phone number and payment card; OCI says the card is not charged unless you upgrade.
2. Create an Ubuntu ARM64 `VM.Standard.A1.Flex` instance within the Always Free quota (up to 2 OCPUs and 12 GB memory).
3. Assign a public IPv4 address and create a network security rule that permits TCP 22 only from your own IP, and TCP 80/443 from the internet. Do not open 5432 or 8100.
4. Point a DNS `A` record for a domain you control to the VM's public IP. Caddy uses that domain to obtain and renew HTTPS certificates.

Always Free capacity can be unavailable in a region, and Oracle may reclaim qualifying idle instances. Keep a separate database backup; a Docker volume is persistence across container restarts, not a backup.

## Prepare the VM

Connect over SSH using the key selected when creating the VM. Install Docker Engine and the Docker Compose plugin using Docker's official Ubuntu instructions, then add your login user to the `docker` group and reconnect.

Clone this repository to `/opt/watchnext`, then from that directory copy `deploy/oracle/env.example` to `.env`. Edit `.env` with:

- `WATCHNEXT_DOMAIN`: the DNS name from step 4, without `https://`.
- `WATCHNEXT_APP_ORIGIN`: `https://` followed by the same DNS name, with no trailing slash.
- `WATCHNEXT_COMPOSE_DB_PASSWORD`: a unique, long random password. Do not reuse the local example password.

Keep `.env` on the VM only. It is ignored by Git. The Compose configuration binds the app's diagnostic port to loopback; Caddy is the only public web entry point. PostgreSQL has no public port mapping.

## Start the application

From `/opt/watchnext`, run:

```sh
docker compose -p watchnext \
  -f docker-compose.yaml \
  -f deploy/oracle/docker-compose.yaml \
  up -d --build
```

Check the service status and logs:

```sh
docker compose -p watchnext \
  -f docker-compose.yaml \
  -f deploy/oracle/docker-compose.yaml \
  ps

docker compose -p watchnext \
  -f docker-compose.yaml \
  -f deploy/oracle/docker-compose.yaml \
  logs --tail=100 app caddy postgres
```

Open `https://<your-domain>`. The first Caddy start needs inbound ports 80 and 443 and working DNS to issue a certificate.

## Update and back up

To deploy a later commit, run `git pull --ff-only`, then repeat the same `docker compose ... up -d --build` command. Do not run `down -v` or `volume prune`; they can delete the PostgreSQL data volume.

Create an off-VM SQL backup before upgrades and periodically:

```sh
docker compose -p watchnext \
  -f docker-compose.yaml \
  -f deploy/oracle/docker-compose.yaml \
  exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "$HOME/watchnext-$(date +%F-%H%M%S).sql"
```

Copy backups away from the VM and verify that they are non-empty. Never store a backup in the repository.

## Cost and architecture notes

The Compose stack builds on the VM, so Docker selects ARM64 images for the Oracle ARM VM. Prisma supports ARM64 Linux targets; the deployed image must be generated for the VM's OS/libc combination. This project uses Debian-based Node images.

OCI Always Free resources do not make every optional cloud resource free. Stay within the console's Always Free limits, avoid paid load balancers, and check the account's cost and usage pages. New OCI accounts commonly require a phone number and payment card for verification.
