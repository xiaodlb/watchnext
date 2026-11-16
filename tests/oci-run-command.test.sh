#!/usr/bin/env bash
# Exercises the scripts with representative OCI CLI output; never contacts OCI.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
bash "$root/deploy/oci/validate-compartment-id.sh" 'ocid1.compartment.oc1..example'
bash "$root/deploy/oci/validate-compartment-id.sh" 'ocid1.tenancy.oc1..example'
if bash "$root/deploy/oci/validate-compartment-id.sh" 'ocid1.instance.oc1..example'; then echo 'Expected instance OCID rejection.' >&2; exit 1; fi
if bash "$root/deploy/oci/validate-compartment-id.sh" 'ocid1.tenancy.'; then echo 'Expected incomplete OCID rejection.' >&2; exit 1; fi
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/watchnext-oci-test.XXXXXX")"
trap 'rm -rf -- "$test_dir"' EXIT
mkdir "$test_dir/bin"
cat >"$test_dir/bin/oci" <<'MOCK'
#!/usr/bin/env bash
if [[ " $* " == *' command create '* ]]; then
  echo 'ocid1.instanceagentcommand.test'
else
  printf '%s\n' "$MOCK_OCI_RESULT"
fi
MOCK
chmod +x "$test_dir/bin/oci"
export PATH="$test_dir/bin:$PATH" RUNNER_TEMP="$test_dir"
export OCI_REGION=test OCI_COMPARTMENT_OCID=test OCI_INSTANCE_OCID=test
export DEV_OCI_REGION=test DEV_OCI_COMPARTMENT_OCID=test DEV_OCI_INSTANCE_OCID=test
export WATCHNEXT_IMAGE_TAG=20260818-163457-83242da GITHUB_ENV="$test_dir/github-env"

export MOCK_OCI_RESULT='{"data":{"lifecycle-state":"SUCCEEDED","content":{"exit-code":0,"text":"20260818-163457-83242da\n"}}}'
bash "$root/deploy/oci/submit-run-command.sh"
bash "$root/deploy/oci/read-deployed-image-tag.sh"
grep -qx 'WATCHNEXT_IMAGE_TAG=20260818-163457-83242da' "$GITHUB_ENV"

export MOCK_OCI_RESULT='{"data":{"lifecycle-state":"SUCCEEDED","content":{"exit-code":3,"text":"20260818-163457-83242da\n"}}}'
if bash "$root/deploy/oci/submit-run-command.sh"; then echo 'Expected deployment failure.' >&2; exit 1; fi
if bash "$root/deploy/oci/read-deployed-image-tag.sh"; then echo 'Expected tag read failure.' >&2; exit 1; fi

export MOCK_OCI_RESULT='{"data":{"lifecycle-state":"SUCCEEDED","content":{"text":"20260818-163457-83242da\n"}}}'
if bash "$root/deploy/oci/submit-run-command.sh"; then echo 'Expected missing exit-code failure.' >&2; exit 1; fi
if bash "$root/deploy/oci/read-deployed-image-tag.sh"; then echo 'Expected missing exit-code failure.' >&2; exit 1; fi

export MOCK_OCI_RESULT='{"data":{"lifecycle-state":"FAILED","content":{"message":"failure"}}}'
if bash "$root/deploy/oci/submit-run-command.sh"; then echo 'Expected failed-state failure.' >&2; exit 1; fi
if bash "$root/deploy/oci/read-deployed-image-tag.sh"; then echo 'Expected failed-state failure.' >&2; exit 1; fi
echo 'OCI Run Command parsing tests passed.'
