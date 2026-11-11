#!/usr/bin/env bash
# One-click installer for Restaurant POS & Billing Management System.
#
# Run this from the repo root after cloning:
#   ./install.sh
#
# Generates a .env with random secrets (only if one doesn't already exist),
# builds the backend + web Docker images, starts the stack, and waits for the
# backend to come up (migrations run automatically on container start). Safe
# to re-run any time (after `git pull`, to rebuild).
#
# Pass --demo to also load seed data (a sample restaurant, menu, and a
# owner@demo.local login) for trying the app out. Without it, sign up your
# own restaurant at /signup — no demo data is created.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

load_demo=false
for arg in "$@"; do
  case "$arg" in
    --demo) load_demo=true ;;
  esac
done

# --- 1. Check prerequisites -------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is not installed." >&2
  echo "See 'Installing Docker' in README.md, or https://docs.docker.com/get-docker/ — then re-run this script." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Error: the 'docker compose' plugin was not found." >&2
  echo "Update Docker Desktop/Engine to a version that bundles Compose v2." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker is installed but not running, or your user can't talk to it." >&2
  echo "Start Docker, and on Linux add your user to the 'docker' group (or re-run with sudo)." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required (used to wait for the app to come online). Install it and re-run." >&2
  exit 1
fi

# --- 2. Generate .env if one doesn't exist already --------------------------
if [ ! -f .env ]; then
  echo "No .env found — generating one from .env.example..."
  if [ -f .env.example ]; then
    cp .env.example .env
  else
    if command -v openssl >/dev/null 2>&1; then
      jwt_secret="$(openssl rand -hex 32)"
      pg_password="$(openssl rand -hex 16)"
    else
      jwt_secret="$(head -c48 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c64)"
      pg_password="$(head -c24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c32)"
    fi
    cat > .env <<EOF
POSTGRES_USER=nodedr
POSTGRES_PASSWORD=${pg_password}
POSTGRES_DB=nodedr_restaurant
JWT_SECRET=${jwt_secret}
FRONTEND_ORIGIN=http://localhost:8080
HOST_PORT=8080
COOKIE_SECURE=false
EOF
  fi
  echo ".env created successfully."
fi

# --- 3. Build the images and start the stack --------------------------------
echo "Building Restaurant POS images and starting the stack..."
docker compose up -d --build

# --- 4. Wait for the app to report healthy ----------------------------------
HOST_PORT="$(grep -m1 '^HOST_PORT=' .env 2>/dev/null | cut -d= -f2-)"
HOST_PORT="${HOST_PORT:-8080}"

echo "Waiting for the app to come online..."
ready=false
for _ in $(seq 1 90); do
  if curl -sf "http://localhost:${HOST_PORT}/api/health" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

if [ "$ready" != "true" ]; then
  echo "Warning: the app didn't respond within 90s. Check the logs with:" >&2
  echo "  docker compose logs" >&2
  exit 1
fi

# --- 5. Load demo data (only if --demo was passed) --------------------------
if [ "$load_demo" = true ]; then
  echo "Loading demo data (restaurant, menu, staff logins)..."
  docker exec restaurant-pos-backend npx ts-node prisma/seed.ts
fi

# --- 6. Done -----------------------------------------------------------------
echo ""
echo "UrbanBite Restaurant — Web-Based POS & Billing Management System is up and running!"
echo "Open http://localhost:${HOST_PORT}"
if [ "$load_demo" = true ]; then
  echo ""
  echo "Default Demo Staff Logins (Password: abc123):"
  echo "  - Admin:         admin   / admin@gmail.com"
  echo "  - Manager:       manager / manager@gmail.com"
  echo "  - Cashier:       cashier / cashier@gmail.com"
  echo "  - Waiter:        waiter  / waiter@gmail.com"
  echo "  - Kitchen Staff: kitchen / kitchen@gmail.com"
else
  echo "Create your restaurant administrator account at http://localhost:${HOST_PORT}/signup"
fi
