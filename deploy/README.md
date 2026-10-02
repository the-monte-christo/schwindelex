# Deployment auf dem vServer

Ziel: `https://schwindelex.blanke.nrw`. Ein Docker-Container (Node 24) hört auf `127.0.0.1:3020`,
nginx macht TLS und leitet weiter. Lobbys liegen nur im Arbeitsspeicher.

Alle Schritte außer Schritt 2 laufen als Deploy-Benutzer (in der docker-Gruppe, ohne sudo).

## Einmalig einrichten

1. `git clone https://github.com/the-monte-christo/schwindelex.git ~/schwindelex`
2. Als root: `sudo bash ~<deploy-benutzer>/schwindelex/deploy/einrichten-root.sh`
   (nginx-Vhost + Snippet, Let's-Encrypt-Zertifikat, Seite freischalten)
3. `~/schwindelex/.env` anlegen, `chmod 600`:

   ```
   ANTHROPIC_API_KEY=…
   HOST_PIN=…
   PUBLIC_URL=https://schwindelex.blanke.nrw
   WORDS_FILE=data/words.json
   ```

   `PORT` und `TRUST_PROXY` setzt `docker-compose.prod.yml` selbst.
4. `~/schwindelex/deploy/deploy.sh`

## Update einspielen

```
~/schwindelex/deploy/deploy.sh
```

Bricht ab, solange Spiele laufen (`/healthz` → `activeGames`). Mit `--force` trotzdem.

## Nützliches

- Zustand: `curl -s http://127.0.0.1:3020/healthz`
- Logs: `docker compose -f ~/schwindelex/deploy/docker-compose.prod.yml logs -f --tail 100`
  (enthält pro Runde Haiku-Latenz und Tokens)
- Stoppen: `docker compose -f ~/schwindelex/deploy/docker-compose.prod.yml down`
- Zertifikat: erneuert certbot automatisch (Webroot `/var/www/acme`, HTTP-Block bleibt dafür offen).
