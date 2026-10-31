#!/usr/bin/env bash
set -euo pipefail
set +x

: "${OCI_IDENTITY_DOMAIN_URL:?Set OCI_IDENTITY_DOMAIN_URL}"
: "${OCI_OAUTH_CLIENT_ID:?Set OCI_OAUTH_CLIENT_ID}"
: "${OCI_OAUTH_CLIENT_SECRET:?Set OCI_OAUTH_CLIENT_SECRET}"
: "${OCI_REGION:?Set OCI_REGION}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?GitHub OIDC is unavailable}"
: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?GitHub OIDC is unavailable}"
: "${GITHUB_ENV:?GitHub Actions environment file is unavailable}"

readonly audience="${OCI_OIDC_AUDIENCE:-watchnext-oci-github-actions}"
readonly temp_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/watchnext-oci-wif.XXXXXX")"
chmod 700 "$temp_dir"

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$temp_dir/private.pem" 2>/dev/null
openssl pkey -in "$temp_dir/private.pem" -pubout -out "$temp_dir/public.pem" 2>/dev/null
chmod 600 "$temp_dir/private.pem"

oidc_response="$(curl --fail --silent --show-error \
  --header "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
  --get --data-urlencode "audience=${audience}" \
  "${ACTIONS_ID_TOKEN_REQUEST_URL}")"
oidc_token="$(jq --exit-status --raw-output '.value | strings | select(length > 0)' <<<"$oidc_response")"
unset oidc_response

domain_url="${OCI_IDENTITY_DOMAIN_URL%/}"
curl --fail --silent --show-error \
  --user "${OCI_OAUTH_CLIENT_ID}:${OCI_OAUTH_CLIENT_SECRET}" \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange' \
  --data-urlencode 'requested_token_type=urn:oci:token-type:oci-rpst' \
  --data-urlencode "public_key@${temp_dir}/public.pem" \
  --data-urlencode "subject_token=${oidc_token}" \
  --data-urlencode 'subject_token_type=jwt' \
  --data-urlencode 'res_type=githubactions' \
  --data-urlencode 'rpst_exp=60' \
  "${domain_url}/oauth2/v1/token" >"$temp_dir/response.json"
unset oidc_token
jq --exit-status --raw-output '.token | strings | select(length > 0)' \
  "$temp_dir/response.json" >"$temp_dir/rpst.token"
chmod 600 "$temp_dir/rpst.token"

# Keep only short-lived, per-job credentials in the runner temp area.
printf 'OCI_RESOURCE_PRINCIPAL_VERSION=2.2\n' >>"$GITHUB_ENV"
printf 'OCI_RESOURCE_PRINCIPAL_REGION=%s\n' "$OCI_REGION" >>"$GITHUB_ENV"
printf 'OCI_RESOURCE_PRINCIPAL_PRIVATE_PEM=%s\n' "$temp_dir/private.pem" >>"$GITHUB_ENV"
printf 'OCI_RESOURCE_PRINCIPAL_RPST=%s\n' "$temp_dir/rpst.token" >>"$GITHUB_ENV"
printf 'WIF_TEMP_DIR=%s\n' "$temp_dir" >>"$GITHUB_ENV"
