#!/usr/bin/env bash
set -euo pipefail

# OCI root compartment is identified by its tenancy OCID. Nested
# compartments have their own compartment OCIDs.
if [[ $# -ne 1 || ! "$1" =~ ^ocid1\.(compartment|tenancy)\.[a-zA-Z0-9._-]+$ ]]; then
  echo 'Expected an OCI compartment OCID or a root tenancy OCID.' >&2
  exit 2
fi
