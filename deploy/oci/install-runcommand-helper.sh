#!/usr/bin/env bash
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo 'Run this setup script with sudo.' >&2
  exit 2
fi

readonly source_file=/opt/watchnext/deploy/oci/watchnext-deploy
readonly helper=/usr/local/sbin/watchnext-deploy
readonly sudoers=/etc/sudoers.d/watchnext-runcommand
project=watchnext

if [[ $# -eq 2 && "$1" == "--project" ]]; then
  project="$2"
elif [[ $# -ne 0 ]]; then
  echo 'Usage: install-runcommand-helper.sh [--project <compose-project>]' >&2
  exit 2
fi
if [[ ! "$project" =~ ^[a-z0-9][a-z0-9_-]{0,62}$ ]]; then
  echo 'Compose project must use lowercase letters, digits, underscores or dashes.' >&2
  exit 2
fi

readonly compose_directory="/var/lib/${project}/compose"
readonly deploy_config=/etc/watchnext/deploy.conf

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
install -d -o root -g root -m 0755 /etc/watchnext
printf 'project=%s\ncompose_dir=%s\n' "$project" "$compose_directory" >"$deploy_config"
chown root:root "$deploy_config"
chmod 0600 "$deploy_config"
printf 'ocarun ALL=(root) NOPASSWD: %s\n' "$helper" >"$sudoers"
chown root:root "$sudoers"
chmod 0440 "$sudoers"
visudo -cf "$sudoers"
