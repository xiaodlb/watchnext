# Promote a tested dev image to production

The workflow [`.github/workflows/promote-production.yaml`](../.github/workflows/promote-production.yaml) is the only production promotion path. It runs only when manually started from `main`. It never builds, tests, publishes or deploys the dev VM. Instead, it accepts an immutable image tag already published by the successful `WatchNext CI/CD` run on `main`:

```text
<40-character-source-SHA>-<CI-run-ID>-<attempt>
```

The workflow uses the GitHub API to verify the tag's SHA, run ID, attempt, `main` branch, `push` event, CI workflow path and successful conclusion before it requests any OCI credential. It then deploys that exact existing GHCR image to the production instance and checks its database-backed `/health/readyz` endpoint.

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

Create a Dynamic Group that includes only the production VM. Give the trusted GitHub workload permission to create Instance Agent Run Commands in the production compartment and give only that Dynamic Group permission to execute commands on its own instance. Use the same policy shapes as [_docs/deploy-oci-cicd.md](deploy-oci-cicd.md), replacing the workflow claim and instance group with production values.

## Promote

1. Open **Actions** in GitHub and choose **Promote dev image to production**.
2. Select the `main` branch.
3. Copy the image tag shown by a successful `WatchNext CI/CD` workflow run and enter it as `image_tag`.
4. Run the workflow. If the `production` environment has a reviewer, approve it there.
5. Open the production origin's `/health/readyz` URL after the workflow reports success.

To roll back, manually run the workflow again using the tag from an earlier successful CI run. The production PostgreSQL and Caddy volumes stay in place during image replacement.
