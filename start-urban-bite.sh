#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v docker >/dev/null 2>&1; then
  echo "Install Docker Desktop or Docker Engine with Compose first."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required."
  exit 1
fi
docker compose up -d --build
echo "Urban Bite: http://localhost:9000"
echo "Use 'docker compose logs -f backend web' to inspect startup logs."
