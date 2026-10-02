#!/bin/bash
# Einmalige Einrichtung auf dem vServer – braucht root.
#
#   sudo bash ~<deploy-benutzer>/schwindelex/deploy/einrichten-root.sh
#
# Voraussetzung: Das Repo ist als Deploy-Benutzer nach ~/schwindelex geklont.
# Hinterlegt nginx-Vhost und Header-Snippet, holt das Zertifikat und schaltet
# die Seite frei. Fasst keine anderen Seiten an. Mehrfach ausführbar.
set -euo pipefail

DOMAIN="schwindelex.blanke.nrw"
HIER="$(cd "$(dirname "$0")" && pwd)"

echo "== 1. nginx-Dateien =="
install -m 644 "$HIER/nginx-headers.conf" "/etc/nginx/snippets/schwindelex-headers.conf"
install -m 644 "$HIER/nginx-schwindelex.conf" "/etc/nginx/sites-available/$DOMAIN"

echo "== 2. Zertifikat =="
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "   Zertifikat vorhanden, nichts zu tun."
else
  # Vor dem ersten Zertifikat kann der HTTPS-Block nicht laden: nur HTTP freischalten.
  TEMP="/etc/nginx/sites-available/$DOMAIN.http"
  printf '%s\n' \
    'server {' \
    '    listen 80;' \
    "    server_name $DOMAIN;" \
    '    location ^~ /.well-known/acme-challenge/ {' \
    '        root /var/www/acme;' \
    '        default_type text/plain;' \
    '    }' \
    '    location / { return 404; }' \
    '}' > "$TEMP"
  ln -sf "$TEMP" "/etc/nginx/sites-enabled/$DOMAIN"
  mkdir -p /var/www/acme
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w /var/www/acme -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email --keep-until-expiring
  rm -f "$TEMP"
fi

echo "== 3. Seite freischalten =="
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t
systemctl reload nginx

REPO="$(dirname "$HIER")"
BESITZER="$(stat -c %U "$REPO")"
echo
echo "Fertig. Weiter als $BESITZER (ohne sudo):"
echo "  1. $REPO/.env anlegen (Vorlage: .env.example, Werte siehe deploy/README.md)"
echo "  2. $REPO/deploy/deploy.sh"
