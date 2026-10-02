#!/bin/bash
# Spielt den aktuellen Stand von main auf dem vServer ein. Läuft als Deploy-Benutzer (Besitzer des Checkouts), ohne root.
#
#   ./deploy/deploy.sh            # bricht ab, wenn gerade Spiele laufen
#   ./deploy/deploy.sh --force    # trotzdem (laufende Partien gehen verloren)
#
# Ablauf: laufende Spiele prüfen → git pull → Bild bauen → Neustart → Health-Check.
# Lobbys liegen nur im Arbeitsspeicher, ein Neustart beendet alle Partien.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f deploy/docker-compose.prod.yml"
HEALTH="http://127.0.0.1:3020/healthz"

if [ ! -f .env ]; then
  echo "FEHLER: $(pwd)/.env fehlt (Vorlage: .env.example, Werte siehe deploy/README.md)." >&2
  exit 1
fi

echo "== 1. Laufende Spiele =="
if STAND="$(curl -fsS "$HEALTH" 2>/dev/null)"; then
  AKTIV="$(printf '%s' "$STAND" | sed -n 's/.*"activeGames":\([0-9]*\).*/\1/p')"
  echo "   $STAND"
  if [ "${AKTIV:-0}" -gt 0 ] && [ "${1:-}" != "--force" ]; then
    echo "ABBRUCH: Es laufen gerade $AKTIV Spiele. Später nochmal oder mit --force." >&2
    exit 1
  fi
else
  echo "   Server läuft nicht – erster Start."
fi

echo "== 2. Code holen =="
VORHER="$(git rev-parse --short HEAD)"
git pull --ff-only
JETZT="$(git rev-parse --short HEAD)"
echo "   $VORHER → $JETZT"

echo "== 3. Bild bauen =="
$COMPOSE build --pull

echo "== 4. Neustart =="
$COMPOSE up -d

echo "== 5. Health-Check =="
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH" 2>/dev/null | grep -q '"ok":true'; then
    echo "   Version $JETZT läuft."
    docker image prune -f > /dev/null 2>&1 || true
    exit 0
  fi
  sleep 2
done

echo "FEHLER: Der Server meldet sich nicht als gesund." >&2
$COMPOSE logs --tail 40 app >&2
echo >&2
echo "Rückweg: git checkout $VORHER && $COMPOSE up -d --build" >&2
exit 1
