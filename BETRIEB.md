# Schwindelex – Betriebshandbuch

Kurzreferenz für Betrieb, Updates und Fehlersuche. Spielregeln und Architektur: [PLAN.md](PLAN.md).

## Überblick

| Was | Wo |
|---|---|
| Spiel | https://schwindelex.blanke.nrw |
| App | ein Docker-Container (Node 24), nur auf `127.0.0.1:3020`, veröffentlicht ausschließlich über nginx |
| Code auf dem Server | `~/schwindelex` (Git-Checkout von `main`) |
| Setup auf dem Server | `~/schwindelex-setup/`: `deploy.sh`, `einrichten-root.sh`, `docker-compose.prod.yml`, nginx-Dateien, `.env` (chmod 600) – **nicht in Git** |
| nginx | `/etc/nginx/sites-available/schwindelex.blanke.nrw`, Snippet `/etc/nginx/snippets/schwindelex-headers.conf` |
| Zertifikat | Let's Encrypt, erneuert sich automatisch (Webroot `/var/www/acme`) |
| KI | Claude Haiku (`claude-haiku-4-5`) prüft und gruppiert Antworten |
| Daten | keine Datenbank. Lobbys liegen nur im Arbeitsspeicher und verschwinden nach der Siegerehrung, nach 30 min ohne Verbindung oder spätestens nach 12 h |

## Ein Spiel leiten

1. Seite öffnen → „Neues Spiel erstellen“ → Name und **Host-PIN** eingeben.
2. Mitspieler scannen den QR-Code oder öffnen den Link und geben einen Namen ein.
3. Wenn alle „Bereit“ sind, startet der Host. Ab da hat der Host keine Sonderrechte mehr.
4. Nach jeder Runde: „Weiter“ oder „Passen“. Haben alle oder alle bis auf einen gepasst → Siegerehrung.
   Über „Mitspieler einladen“ können Neue jederzeit dazukommen (ab der nächsten Runde, 0 Punkte).

Tipp: Bildschirmsperre ist kein Problem. Nach dem Entsperren verbindet sich das Handy von selbst wieder
und landet auf seinem Platz. Während der Sperre tickt der Timer aber weiter.

## Alltag auf dem Server (ohne sudo)

```bash
# Zustand: Lobbys, laufende Spiele, offene Verbindungen
curl -s http://127.0.0.1:3020/healthz

# Update einspielen (git pull → Image bauen → Neustart → Health-Check)
~/schwindelex-setup/deploy.sh            # bricht ab, solange Spiele laufen
~/schwindelex-setup/deploy.sh --force    # trotzdem – laufende Partien gehen verloren

# Logs (pro Runde: Haiku-Latenz und Tokens; Lobby erstellt/beendet; Fehler)
docker compose -f ~/schwindelex-setup/docker-compose.prod.yml logs -f --tail 100

# Neustart / Stoppen / Starten
docker compose -f ~/schwindelex-setup/docker-compose.prod.yml restart
docker compose -f ~/schwindelex-setup/docker-compose.prod.yml down
docker compose -f ~/schwindelex-setup/docker-compose.prod.yml up -d
```

**Jeder Neustart beendet alle laufenden Partien** (Lobbys liegen nur im Speicher). Deshalb prüft
`deploy.sh` vorher `activeGames`.

### Host-PIN oder API-Key ändern

1. `~/schwindelex-setup/.env` bearbeiten (`HOST_PIN=…`, `ANTHROPIC_API_KEY=…`).
2. Container **neu erzeugen** – `restart` liest die `.env` nicht neu ein:
   `docker compose -f ~/schwindelex-setup/docker-compose.prod.yml up -d --force-recreate`

### Auf eine ältere Version zurück

```bash
git -C ~/schwindelex log --oneline -10                  # Version aussuchen
git -C ~/schwindelex checkout <hash>
docker compose -f ~/schwindelex-setup/docker-compose.prod.yml up -d --build
```

Zurück zum normalen Betrieb: `git -C ~/schwindelex checkout main`, danach `deploy.sh`.
(Solange ein alter Stand ausgecheckt ist, scheitert `deploy.sh` beim `git pull`.)

## Fehlersuche

| Symptom | Ursache / Lösung |
|---|---|
| Seite lädt nicht | `curl -s http://127.0.0.1:3020/healthz`. Keine Antwort → Logs ansehen, `up -d`. Antwort ok → nginx: `sudo nginx -t`, `sudo systemctl status nginx` |
| Gelbe Leiste „Verbindung weg“ | Handy hat das Netz verloren oder der Server startet neu. Verbindet sich von selbst wieder. Bleibt sie, Server prüfen |
| „Dieses Spiel gibt es nicht mehr“ | Lobby wurde nach Spielende oder Inaktivität gelöscht, oder der Server wurde neu gestartet. Neues Spiel erstellen |
| „Die Zettel werden sortiert…“ dauert lange | Haiku antwortet langsam oder gar nicht. Nach spätestens 20 s geht es mit einem Ersatzverfahren weiter (nur wortgleiche Antworten werden zusammengelegt). In den Logs steht dann `judge failed … using fallback` |
| Antworten werden nie als richtig erkannt | API-Key fehlt oder ist ungültig: Beim Start loggt der Server `ANTHROPIC_API_KEY fehlt – nur exakter Textvergleich`. Key prüfen, Container neu erzeugen |
| „Falsche PIN“ / „Zu viele Versuche“ | Host-PIN steht in `~/schwindelex-setup/.env`. Nach 10 Erstell-Versuchen pro IP ist 10 min Pause |
| „Diesen Code gibt es nicht“ | Tippfehler im Code, oder die Lobby ist schon weg. Nach 20 Fehlversuchen pro IP ist 1 min Pause |
| Zertifikat abgelaufen | `sudo certbot renew --dry-run` testet die Erneuerung. Port 80 und der acme-Block im vhost müssen erreichbar sein |

## Grenzen und Schutz

| Was | Wert |
|---|---|
| Spieler pro Lobby | 2–20 |
| Gleichzeitige Lobbys | 200 |
| WebSocket-Verbindungen | 60 pro IP (eine Party teilt sich meist eine IP), 2000 insgesamt |
| Nachrichten | 20 pro Sekunde und Verbindung, max. 4 KB |
| Lobby erstellen | Host-PIN nötig, 10 Versuche pro IP in 10 min |
| Container | 256 MB Speicherlimit; im Lasttest (200 Spieler gleichzeitig) stabil bei ca. 11 MB Heap |

## Kosten

Haiku kostet ungefähr **0,1 Cent pro Runde** (≈ 500–800 Eingabe-, 50–150 Ausgabetokens). Die Logs
zeigen pro Runde `in=` / `out=`. Den echten Verbrauch zeigt die Anthropic-Konsole.

## Datenschutz

- Dauerhaft gespeichert wird nichts: keine Konten, keine Datenbank, keine Cookies. Namen und Antworten
  hält der Server nur während des Spiels im Arbeitsspeicher. Name und Sitzungstoken liegen außerdem im
  `localStorage` des eigenen Browsers (für das Wiederverbinden).
- Die Antworttexte einer Runde gehen zur Bewertung an die Anthropic-API (ohne Namen, nur mit
  Kurz-IDs `a1`, `a2`, …).
- Die Logs enthalten Lobby-Codes, Rundenzahlen, Token-Verbrauch und Fehlermeldungen, keine Antworten
  und keine Namen. Docker behält höchstens 3 × 5 MB Logs.

## Inhalte ändern

**Wortliste** – `data/words.json` (264 Wörter). Achtung Spoiler: wer selbst mitspielt, sollte die Datei
nicht öffnen. Neu erzeugen mit der Pipeline in `wortliste/` (Anleitung für den Agenten:
`wortliste/CLAUDE.md`), Ergebnis nach `data/words.json` kopieren, committen, deployen.
Testwörter für die Entwicklung: `data/words.test.json`.

**Bilder** – Rohbilder nach `design/roh/` (nicht in Git, Prompts in `design/bild-prompts.md`), dann
`python design/zerschneiden.py` (Icons, Kritzeleien, Favicons) bzw. `python design/texturen.py`
(Papier/Tafel; Zieltöne oben im Skript). Ergebnis prüfen mit
`npx playwright test e2e/screens.spec.ts` → `test-results/screens/`.

## Entwicklung (lokal)

```bash
npm ci
cp .env.example .env          # API-Key und PIN eintragen
npm run build && npm start    # http://localhost:3000
npm run dev:client            # Vite mit Hot Reload (Server muss parallel laufen)

npm test                      # Unit + Integration (Vitest)
npm run typecheck
npm run test:e2e              # Playwright mit dem installierten Edge, startet eigenen Server
npm run loadtest              # Last- und Leck-Test
npm run eval:judge            # Haiku-Evals gegen die echte API (≈ 3 Cent, nur nach Prompt-Änderungen)
```

Im WLAN mit Handys testen: `PUBLIC_URL=http://<lokale IP>:3000` in der `.env`, damit der QR-Code passt.

## Ersteinrichtung (zur Erinnerung)

1. Als Deploy-Benutzer: `git clone https://github.com/the-monte-christo/schwindelex.git ~/schwindelex`
2. Setup-Dateien nach `~/schwindelex-setup/` kopieren (lokal im gitignorierten `deploy/`), `.env` anlegen
3. Als root einmalig: `sudo bash ~<deploy-benutzer>/schwindelex-setup/einrichten-root.sh`
   (nginx-vhost, Zertifikat; fasst `nginx.conf` und andere Seiten nicht an)
4. `~/schwindelex-setup/deploy.sh`
