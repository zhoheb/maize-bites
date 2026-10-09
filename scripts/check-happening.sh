#!/usr/bin/env bash
# Checks whether events.umich.edu serves its official feeds to our identified client.
#
# Makes exactly three GET requests, 2 seconds apart, with the same User-Agent the worker sends.
# It only observes: no retries, no cookies, and no headers beyond the User-Agent and, when it is
# configured, the integration header the site's owners issued. Nothing tries to get past a bot
# challenge. curl does not follow redirects here, so the header cannot travel to another host. Run it from different networks (home, campus wifi, UMich VPN) and compare.
#
# Usage: scripts/check-happening.sh
#   INGEST_CONTACT_EMAIL comes from the environment, or from the repo-root .env.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${INGEST_CONTACT_EMAIL:-}" && -f "$ROOT/.env" ]]; then
  INGEST_CONTACT_EMAIL="$(grep -E '^INGEST_CONTACT_EMAIL=' "$ROOT/.env" | tail -n 1 | cut -d= -f2- | tr -d '"'"'" || true)"
fi
if [[ -z "${INGEST_CONTACT_EMAIL:-}" ]]; then
  echo "INGEST_CONTACT_EMAIL is not set. Add it to .env or export it, then rerun." >&2
  exit 2
fi

# Optional: the integration header Student Life Technology Solutions issued. Read from the
# environment or .env like the contact address. Its value is never printed.
read_env() {
  local value="${!1:-}"
  if [[ -z "$value" && -f "$ROOT/.env" ]]; then
    value="$(grep -E "^$1=" "$ROOT/.env" | tail -n 1 | cut -d= -f2- | tr -d '"'"'" || true)"
  fi
  printf '%s' "$value"
}
INTEGRATION_TOKEN="$(read_env UMICH_INTEGRATION_TOKEN)"
SITE_URL="$(read_env PUBLIC_SITE_URL)"
INTEGRATION_ARGS=()
if [[ -n "$INTEGRATION_TOKEN" && -n "$SITE_URL" ]]; then
  INTEGRATION_ARGS=(--header "x-umich-integration: ${INTEGRATION_TOKEN} ${SITE_URL}")
fi

# Must match buildUserAgent in the worker's Happening client.
USER_AGENT="MaizeBites/0.1 (UMich free-food tracker; contact: ${INGEST_CONTACT_EMAIL})"
# An occurrence id from apps/worker/fixtures/happening-sample.json.
EVENT_ID="150244-21908461"

BODY="$(mktemp)"
HEADERS="$(mktemp)"
trap 'rm -f "$BODY" "$HEADERS"' EXIT

header() {
  # Last value of a response header, lowercased name match, CR stripped.
  grep -i "^$1:" "$HEADERS" | tail -n 1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//' || true
}

check() {
  local label="$1" url="$2" accept="$3"
  local status
  status="$(curl --silent --show-error --max-time 15 \
    --user-agent "$USER_AGENT" --header "Accept: $accept" \
    ${INTEGRATION_ARGS[@]+"${INTEGRATION_ARGS[@]}"} \
    --dump-header "$HEADERS" --output "$BODY" --write-out '%{http_code}' "$url" || true)"

  local challenge="no"
  if grep -qE 'Just a moment|_cf_chl_opt|challenge-platform' "$BODY" 2>/dev/null; then
    challenge="yes"
  fi

  echo "== $label"
  echo "   url:           $url"
  echo "   status:        ${status:-request failed}"
  echo "   server:        $(header server)"
  echo "   cf-ray:        $(header cf-ray)"
  echo "   cf-mitigated:  $(header cf-mitigated)"
  echo "   content-type:  $(header content-type)"
  echo "   body bytes:    $(wc -c <"$BODY" | tr -d ' ')"
  echo "   challenge page: $challenge"
  if [[ "$status" == "200" && "$challenge" == "no" ]]; then
    echo "   first bytes:   $(head -c 80 "$BODY" | tr '\n\r' '  ')"
  fi
  echo
}

echo "Happening @ Michigan access check, $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "User-Agent: MaizeBites/0.1 (UMich free-food tracker; contact: <INGEST_CONTACT_EMAIL>)"
if [[ ${#INTEGRATION_ARGS[@]} -gt 0 ]]; then
  echo "x-umich-integration: <UMICH_INTEGRATION_TOKEN> <PUBLIC_SITE_URL> (sent)"
else
  echo "x-umich-integration: not sent (UMICH_INTEGRATION_TOKEN or PUBLIC_SITE_URL is not set)"
fi
echo

check "JSON list feed" "https://events.umich.edu/list/json?v=2&max-results=1" "application/json"
sleep 2
check "Per-event iCal feed" "https://events.umich.edu/event/${EVENT_ID}/feed/ical" "text/calendar"
sleep 2
check "Feeds documentation page" "https://events.umich.edu/feeds" "text/html"
