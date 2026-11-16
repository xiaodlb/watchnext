# CI/CD to Oracle Cloud Always Free

The GitHub Actions workflow runs the backend/shared and frontend suites in parallel. When both pass, its **Build, test and publish ARM64 and AMD64 images** job builds each architecture from the same commit and runs the PostgreSQL migration, Compose readiness and Playwright two-session checks against each image. On a successful `main` push it publishes both tested images to GHCR and creates one shared multi-architecture tag only after both pass. ARM64 dev and AMD64 production pull their matching image using that same tag. The tag uses UTC `YYYYMMDD-HHMMSS-shortsha`, for example `20260818-163457-83242da`; `latest` is never used. The separate **Deploy dev image from GHCR** job pulls the published tag and starts it with `--no-build`.

Deployment runs only on a successful push to `main`, only after all Compose checks pass, and only when the repository variable `OCI_DEPLOY_ENABLED` is exactly `true`. Pull requests never publish the image or deploy. Deployment uses GitHub's short-lived OIDC token, exchanges it for a short-lived OCI Resource Principal Session Token (RPST), and asks the OCI Instance Agent Run Command plugin to start a narrowly scoped deployment helper on the existing VM. The final step checks the public HTTPS `/health/readyz` endpoint. That route runs a database query and returns success only while the app can reach its configured database; `/v1/context` can return an anonymous response after a database error and is not a readiness check.

## Existing VM and data

The VM must have the existing WatchNext checkout at `/opt/watchnext`, owned by the Ubuntu SSH user `ubuntu`, and its local `.env` file must be present as a regular file. It must already be running the Oracle Compose stack as project `watchnext`, using the same `.env`, public DNS name and Caddy configuration described in [`deploy-oracle.md`](deploy-oracle.md). The deployment archives Compose files from the requested Git commit into a temporary directory, then stages them in the stable root-owned `/var/lib/watchnext/compose` directory. It does not reset the live checkout or overwrite `.env`.

Compose always uses project name `watchnext`, so its PostgreSQL, Caddy data and Caddy configuration named volumes retain their existing names. It pulls and replaces only the `app` image. The PostgreSQL service is not recreated with a data-volume deletion command; do not run `docker compose down -v` as part of deployment.

The image `ghcr.io/xiaodlb/watchnext:<timestamp>-<shortsha>` must be public because the VM pulls it without a registry credential. After the workflow publishes the first image, open the GitHub repository's Packages page and set the `watchnext` container package visibility to **Public**. The workflow uses the repository's `GITHUB_TOKEN` for publishing and stores no GHCR credential on the VM.

## One-time VM setup

The Oracle Cloud Agent and Compute Instance Run Command plugin must be enabled and running. Oracle's current generic support list for Run Command does not list Canonical Ubuntu images, even though the project's Ubuntu 24.04 Minimal ARM VM has the plugin installed and enabled. This deployment therefore depends on that plugin continuing to operate on this specific image. Confirm that Run Command reports successful executions on the VM before enabling automatic deployment.

Install a root-owned helper and grant the `ocarun` service user permission to invoke only that helper. From an SSH session on the VM, with the repository at `/opt/watchnext`, run:

```sh
sudo bash /opt/watchnext/deploy/oci/install-runcommand-helper.sh
```

The helper accepts only a UTC `YYYYMMDD-HHMMSS-shortsha` image tag on standard input, fetches `main`, resolves the short SHA to its commit, and deploys the matching GHCR image. It retains the existing `.env`, never prints its values, uses a deployment lock, checks Compose configuration, waits for the services to start, and records the deployed non-secret image tag only after success. The Compose files and Caddy file come from the resolved Git commit, not the possibly modified live checkout. Re-run the installer after this helper changes so the root-owned copy on the VM is refreshed.

This script grants `ocarun` passwordless sudo for one root-owned executable at `/usr/local/sbin/watchnext-deploy`. It does not grant general sudo access. If the deployment helper's behavior changes in a later commit, reinstall the root-owned copy from SSH before relying on that change.

## OCI identity and IAM setup

Create an Identity Domain confidential OAuth application for token exchange. Give it no Identity Domain Administrator role. Its client ID is a repository variable; store its client secret as a GitHub Actions secret. The Identity Propagation Trust itself must be created by an Identity Domain Administrator; if you create or update it through the REST API, use a separate administrator application for that administration. The token-exchange application must remain non-administrator. The workflow generates a fresh RSA key pair per deployment, exchanges the GitHub OIDC JWT for a 60-minute RPST, and deletes the key and token files at the end of the job. No OCI API key or long-lived OCI user credential is stored in GitHub.

Create an Identity Propagation Trust for GitHub Actions with these settings:

- Issuer: `https://token.actions.githubusercontent.com`
- Type: `JWT`; subject type: `Resource`
- OAuth client: the confidential app's client ID
- `allowImpersonation`: `true`; `impersonatingResource`: `githubactions`
- Claim validations (all must match exactly):
  - `aud` = `watchnext-oci-github-actions`
  - `repository` = `xiaodlb/watchnext`
  - `ref` = `refs/heads/main`
  - `workflow_ref` = `xiaodlb/watchnext/.github/workflows/ci-cd.yaml@refs/heads/main`
  - `event_name` = `push`
- Claim propagations: `ext_repository`, `ext_workflow_ref`, and `ext_event_name`

The exact claim values are important. The Trust prevents tokens from another repository, workflow, branch, event, or audience from receiving an RPST.

Create a Dynamic Group whose matching rule includes only the application's one VM:

```text
ALL { instance.id = '<OCI_INSTANCE_OCID>' }
```

Add these IAM policy statements, replacing the compartment name and instance OCID. Use the compartment that currently contains the VM:

```text
Allow any-user to use instance-agent-command-family in compartment <COMPARTMENT_NAME> where all {
  request.principal.type = 'identityfederateddomainapp',
  request.principal.ext_repository = 'xiaodlb/watchnext',
  request.principal.ext_workflow_ref = 'xiaodlb/watchnext/.github/workflows/ci-cd.yaml@refs/heads/main',
  request.principal.ext_event_name = 'push'
}

Allow dynamic-group <WATCHNEXT_RUN_COMMAND_VM_GROUP> to use instance-agent-command-execution-family in compartment <COMPARTMENT_NAME> where request.instance.id = target.instance.id
```

The first permission lets the trusted GitHub workload create a Run Command in that compartment. OCI's current policy reference does not provide a target-instance condition for command creation, so this permission is compartment-wide. On the VM's side, the second statement and Dynamic Group limit command execution to the one listed instance. The caller receives no Compute instance-management or unrelated OCI resource permissions. Keep the command-creation compartment as small as practical; the current VM is in the root compartment, so that compartment-wide creation boundary includes any other Run Command-enabled instances in root.

OCI's GitHub token exchange flow and Run Command use are documented in [Workload Identity Federation and Token Exchange](https://docs.oracle.com/en-us/iaas/Content/Identity/api-getstarted/token_exchange_grant_type_workload_id-federation.htm), [Running Commands on an Instance](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/runningcommands.htm), and [Core Services IAM Policy Reference](https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/corepolicyreference.htm).

## GitHub repository settings

Add these **Actions variables** to the repository:

| Variable | Value |
| --- | --- |
| `OCI_DEPLOY_ENABLED` | `true` only after completing every setup step; unset or any other value keeps deploy disabled |
| `OCI_REGION` | The VM's OCI region identifier, such as `me-dubai-1` |
| `OCI_IDENTITY_DOMAIN_URL` | The Identity Domain base URL, for example `https://idcs-<region>.identity.oraclecloud.com` (no path) |
| `OCI_OAUTH_CLIENT_ID` | OAuth client ID added to the Identity Propagation Trust |
| `OCI_COMPARTMENT_OCID` | OCID of the compartment containing the VM and Run Command; for the root compartment use its `ocid1.tenancy...` OCID |
| `OCI_INSTANCE_OCID` | OCID of the WatchNext VM |
| `WATCHNEXT_APP_ORIGIN` | Public HTTPS origin with no trailing slash, e.g. `https://watchnext.example.com` |

Add this **Actions secret**:

| Secret | Value |
| --- | --- |
| `OCI_OAUTH_CLIENT_SECRET` | Secret for the non-administrator OAuth application |

The token-exchange OAuth client secret is a long-lived secret even though the resulting RPST and signing key are short-lived. Store it only in GitHub Actions Secrets, restrict repository administration, and rotate it through the OCI application and GitHub secret settings when needed. OCI also supports signed token-exchange requests, but this workflow uses the documented OAuth client method.

To disable deployment at any time, unset `OCI_DEPLOY_ENABLED` or change it to a value other than `true`. CI, Compose integration and browser tests continue to run; no OCI identity token is requested by pull requests or when deployment is disabled.

## What the workflow verifies

1. Backend/shared tests and frontend tests run in separate parallel jobs.
2. Compose builds ARM64 and AMD64 app images for the two OCI VM architectures.
3. The isolated PostgreSQL migration, readiness and Playwright multi-session scenarios run against each built image and clean up only their own resources. ARM64 uses QEMU emulation on the GitHub runner.
4. Only a passing `main` push publishes the unique image tag `ghcr.io/xiaodlb/watchnext:<timestamp>-<shortsha>`.
5. When deployment is enabled, OCI Run Command deploys the same tested timestamp-and-short-SHA image tag while preserving the existing `.env` and Compose named volumes.
6. GitHub Actions retries `https://<configured-origin>/health/readyz` and fails the workflow if the app cannot reach its database.
