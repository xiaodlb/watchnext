#!/usr/bin/env bash
set -euo pipefail
set +x

: "${OCI_REGION:?Set OCI_REGION}"
: "${OCI_COMPARTMENT_OCID:?Set OCI_COMPARTMENT_OCID}"
: "${OCI_INSTANCE_OCID:?Set OCI_INSTANCE_OCID}"
: "${WATCHNEXT_IMAGE_TAG:?Set WATCHNEXT_IMAGE_TAG}"

if [[ ! "$WATCHNEXT_IMAGE_TAG" =~ ^([0-9a-f]{40})-[0-9]+-[0-9]+$ ]]; then
  echo 'WATCHNEXT_IMAGE_TAG must contain a 40-character source SHA, GitHub run ID and attempt.' >&2
  exit 2
fi
source_sha="${BASH_REMATCH[1]}"
if [[ -n "${WATCHNEXT_SOURCE_SHA:-}" && "$WATCHNEXT_SOURCE_SHA" != "$source_sha" ]]; then
  echo 'WATCHNEXT_SOURCE_SHA must match the SHA embedded in WATCHNEXT_IMAGE_TAG.' >&2
  exit 2
fi

temp_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/watchnext-oci-command.XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT
chmod 700 "$temp_dir"

cat >"$temp_dir/deploy.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' '${WATCHNEXT_IMAGE_TAG}' | sudo -n /usr/local/sbin/watchnext-deploy
EOF
chmod 600 "$temp_dir/deploy.sh"
jq -n --rawfile text "$temp_dir/deploy.sh" \
  '{source:{sourceType:"TEXT",text:$text},output:{outputType:"TEXT"}}' \
  >"$temp_dir/content.json"
jq -n --arg instanceId "$OCI_INSTANCE_OCID" '{instanceId:$instanceId}' \
  >"$temp_dir/target.json"

command_id="$(oci --auth resource_principal --region "$OCI_REGION" \
  instance-agent command create \
  --compartment-id "$OCI_COMPARTMENT_OCID" \
  --content "file://${temp_dir}/content.json" \
  --target "file://${temp_dir}/target.json" \
  --timeout-in-seconds 1800 \
  --display-name "WatchNext ${source_sha}" \
  --query data.id --raw-output)"
if [[ -z "$command_id" || "$command_id" == "null" ]]; then
  echo 'OCI did not return a Run Command ID.' >&2
  exit 1
fi

echo 'Waiting for OCI Run Command to finish.'
for attempt in $(seq 1 180); do
  result="$(oci --auth resource_principal --region "$OCI_REGION" \
    instance-agent command-execution get \
    --command-id "$command_id" --instance-id "$OCI_INSTANCE_OCID" \
    --output json 2>/dev/null || true)"
  state="$(jq --raw-output '.data.lifecycleState // empty' <<<"$result" 2>/dev/null || true)"
  case "$state" in
    SUCCEEDED)
      exit_code="$(jq --raw-output '.data.content.exitCode // empty' <<<"$result")"
      if [[ ! "$exit_code" =~ ^[0-9]+$ || "$exit_code" != 0 ]]; then
        echo "OCI Run Command reported exit code ${exit_code}." >&2
        exit 1
      fi
      echo 'OCI Run Command completed.'
      exit 0
      ;;
    FAILED|TIMED_OUT|CANCELED)
      echo "OCI Run Command finished with state ${state}." >&2
      jq -r '(.data.content.text // .data.content.message // "No command output returned.")' \
        <<<"$result" >&2 || true
      exit 1
      ;;
    *) sleep 10 ;;
  esac
done

echo 'OCI Run Command did not finish within 30 minutes.' >&2
exit 1
