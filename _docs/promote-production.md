# Promote a tested dev image to production

The workflow [`.github/workflows/promote-production.yaml`](../.github/workflows/promote-production.yaml) is the only production promotion path. It runs only when manually started from `main`. It never builds, tests, tags or publishes an image. It first asks the dev VM for the exact image tag it is currently serving, then deploys that same image to production.

```text
YYYYMMDD-HHMMSS-shortsha
```

The tag is created once in UTC by the dev **Build and publish** job, for example `20260818-163457-83242da`. Dev deploy pulls it from public GHCR, records only this non-secret tag in its root-owned Compose directory after a successful deployment, and leaves the record unchanged on failure. Promotion reads that record with a read-only OCI Run Command and then pulls that exact existing GHCR image to the production instance. This makes production promotion an image promotion, not a rebuild.

## One-time production VM setup

After Terraform creates the production VM and cloud-init has finished the first application build, connect with the Terraform `production_ssh_command` output and install the narrowly scoped OCI Run Command helper for its separate Compose project:

```sh
sudo bash /opt/watchnext/deploy/oci/install-runcommand-helper.sh --project watchnext-production
```

This writes a root-owned deployment configuration under `/etc/watchnext/` and stages production Compose files under `/var/lib/watchnext-production/compose`. It does not use or modify dev's `watchnext` Compose project, its `.env`, or any dev volumes.

## GitHub production environment

Create a GitHub repository environment called `production`. Add a required reviewer if you want every promotion to pause for approval. Store these **environment variables** there:

| Variable | Value |
| --- | --- |
| `PRODUCTION_OCI_REGION` | Production VM region, for example `me-dubai-1` |
| `PRODUCTION_OCI_IDENTITY_DOMAIN_URL` | Production Identity Domain base URL without a path |
| `PRODUCTION_OCI_OAUTH_CLIENT_ID` | OAuth client ID for the production promotion trust |
| `PRODUCTION_OCI_COMPARTMENT_OCID` | Compartment containing production Run Commands and VM |
| `PRODUCTION_OCI_INSTANCE_OCID` | Terraform output `production_instance_ocid` |
| `PRODUCTION_WATCHNEXT_APP_ORIGIN` | Terraform output `production_https_origin` without a trailing slash |
| `DEV_OCI_REGION` | Dev VM OCI region |
| `DEV_OCI_COMPARTMENT_OCID` | Dev VM compartment OCID |
| `DEV_OCI_INSTANCE_OCID` | Dev VM instance OCID |

Store this **environment secret** only in `production`:

| Secret | Value |
| --- | --- |
| `PRODUCTION_OCI_OAUTH_CLIENT_SECRET` | OAuth secret for the non-administrator production promotion app |

## OCI identity and access

Create a separate OCI Identity Propagation Trust and OAuth app for production. Its claim values must be:

- `aud`: `watchnext-production-promotion`
- `repository`: `xiaodlb/watchnext`
- `ref`: `refs/heads/main`
- `workflow_ref`: `xiaodlb/watchnext/.github/workflows/promote-production.yaml@refs/heads/main`
- `event_name`: `workflow_dispatch`

Create separate Dynamic Groups for production and dev. Give the trusted promotion workflow permission to create Instance Agent Run Commands in both required compartments. Give the production Dynamic Group permission to execute commands only on the production VM, and the dev Dynamic Group permission to execute commands only on the dev VM. The dev command reads only `/var/lib/watchnext/compose/deployed-image-tag`; it cannot deploy or alter dev. Use the same policy shapes as [_docs/deploy-oci-cicd.md](deploy-oci-cicd.md), replacing the workflow claim and instance groups with these production-promotion values.

## Promote

1. Open **Actions** in GitHub and choose **Promote dev image to production**.
2. Select the `main` branch.
3. Run the workflow. It reads the image currently deployed on dev and uses it unchanged.
4. If the `production` environment has a reviewer, approve it there.
5. Open the production origin's `/health/readyz` URL after the workflow reports success.

To roll back, first roll dev back to a previously published tag, then run promotion. The production PostgreSQL and Caddy volumes stay in place during image replacement.
