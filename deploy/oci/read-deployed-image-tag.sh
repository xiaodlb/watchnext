#!/usr/bin/env bash
set -euo pipefail
set +x

: "${DEV_OCI_REGION:?Set DEV_OCI_REGION}"
: "${DEV_OCI_COMPARTMENT_OCID:?Set DEV_OCI_COMPARTMENT_OCID}"
: "${DEV_OCI_INSTANCE_OCID:?Set DEV_OCI_INSTANCE_OCID}"
: "${GITHUB_ENV:?GitHub Actions environment file is unavailable}"

temp_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/watchnext-dev-image.XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT
chmod 700 "$temp_dir"

cat >"$temp_dir/read-tag.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
tag="$(cat /var/lib/watchnext/compose/deployed-image-tag)"
[[ "$tag" =~ ^[0-9]{8}-[0-9]{6}-[0-9a-f]{7}$ ]]
printf '%s\n' "$tag"
SCRIPT
chmod 600 "$temp_dir/read-tag.sh"

jq -n --rawfile text "$temp_dir/read-tag.sh" \
  '{source:{sourceType:"TEXT",text:$text},output:{outputType:"TEXT"}}' \
  >"$temp_dir/content.json"
jq -n --arg instanceId "$DEV_OCI_INSTANCE_OCID" '{instanceId:$instanceId}' \
  >"$temp_dir/target.json"

command_id="$(oci --auth resource_principal --region "$DEV_OCI_REGION" \
  instance-agent command create \
  --compartment-id "$DEV_OCI_COMPARTMENT_OCID" \
  --content "file://${temp_dir}/content.json" \
  --target "file://${temp_dir}/target.json" \
  --timeout-in-seconds 120 \
  --display-name 'WatchNext read deployed dev image' \
  --query data.id --raw-output)"
if [[ -z "$command_id" || "$command_id" == "null" ]]; then
  echo 'OCI did not return a dev image read command ID.' >&2
  exit 1
fi

for attempt in $(seq 1 30); do
  result="$(oci --auth resource_principal --region "$DEV_OCI_REGION" \
    instance-agent command-execution get \
    --command-id "$command_id" --instance-id "$DEV_OCI_INSTANCE_OCID" \
    --output json 2>/dev/null || true)"
  state="$(jq --raw-output '.data["lifecycle-state"] // empty' <<<"$result" 2>/dev/null || true)"
  case "$state" in
    SUCCEEDED)
      exit_code="$(jq --raw-output '.data.content["exit-code"] // empty' <<<"$result")"
      if [[ "$exit_code" != 0 ]]; then
        echo "Dev image read command returned an invalid or nonzero exit code." >&2
        exit 1
      fi
      tag="$(jq --raw-output '.data.content.text // empty' <<<"$result" | tr -d '\r' | grep -E '^[0-9]{8}-[0-9]{6}-[0-9a-f]{7}$' | tail -n 1 || true)"
      if [[ ! "$tag" =~ ^[0-9]{8}-[0-9]{6}-[0-9a-f]{7}$ ]]; then
        echo 'Dev Run Command did not return a valid deployed image tag.' >&2
        exit 1
      fi
      printf 'WATCHNEXT_IMAGE_TAG=%s\n' "$tag" >>"$GITHUB_ENV"
      printf 'WATCHNEXT_DEV_IMAGE_TAG=%s\n' "$tag" >>"$GITHUB_ENV"
      echo "Read currently deployed dev image ${tag}."
      exit 0
      ;;
    FAILED|TIMED_OUT|CANCELED)
      echo "Dev image read command finished with state ${state}." >&2
      exit 1
      ;;
    *) sleep 4 ;;
  esac
done

echo 'Dev image read command did not finish within two minutes.' >&2
exit 1
