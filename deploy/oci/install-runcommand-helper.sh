#!/usr/bin/env bash
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo 'Run this setup script with sudo.' >&2
  exit 2
fi

readonly source_file=/opt/watchnext/deploy/oci/watchnext-deploy
readonly helper=/usr/local/sbin/watchnext-deploy
readonly sudoers=/etc/sudoers.d/watchnext-runcommand
readonly compose_directory=/var/lib/watchnext/compose

if [[ ! -f "$source_file" || -L "$source_file" ]]; then
  echo "Expected the repository deployment helper at ${source_file}." >&2
  exit 1
fi
if ! id ocarun >/dev/null 2>&1; then
  echo 'The OCI Run Command user ocarun was not found.' >&2
  exit 1
fi

install -o root -g root -m 0755 "$source_file" "$helper"
install -d -o root -g root -m 0755 "$compose_directory/deploy/oracle" "$compose_directory/deploy/oci"
printf 'ocarun ALL=(root) NOPASSWD: %s\n' "$helper" >"$sudoers"
chown root:root "$sudoers"
chmod 0440 "$sudoers"
visudo -cf "$sudoers"
