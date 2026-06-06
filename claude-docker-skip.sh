#!/usr/bin/env bash
# Same as claude-docker.sh but launches with --dangerously-skip-permissions.
#
# Usage:
#   ./claude-docker-skip.sh                 # Claude Code, no permission prompts
#   ./claude-docker-skip.sh -p "do X"       # skip perms + pass a prompt
#
# See docker/README.md for details.
set -euo pipefail

cd "$(dirname "$0")"

HOST_UID="$(id -u)"
HOST_GID="$(id -g)"
export HOST_UID HOST_GID

if ! docker image inspect 3dmodels-claude:latest >/dev/null 2>&1; then
  echo ">> First run: building the container image (a few minutes)..."
  docker compose build
fi

exec docker compose run --rm claude claude --dangerously-skip-permissions "$@"
