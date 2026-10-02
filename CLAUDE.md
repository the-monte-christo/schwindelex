# Schwindelex

Browser-Multiplayer-Ratespiel im Stil von „Nobody's Perfect“ für Freunde und Familie.
Spec: [project.md](project.md) · Regeln, Architektur, Milestones: [PLAN.md](PLAN.md) · Quellen: [SOURCES.md](SOURCES.md)

> **Arbeitest du in `wortliste/`?** Dann gilt ausschließlich [wortliste/CLAUDE.md](wortliste/CLAUDE.md).
> Der Rest dieser Datei betrifft dich nicht.

## Stand
- M0 Setup: ✅
- M1 Spiellogik: ✅ `server/src/game/` (Game-Klasse + rules)
- M2 Server + Echtzeit: ✅ `server/src/net/` (LobbyManager, WebSocket, QR, Host-PIN, Reconnect, Rate-Limits),
  Protokoll in `shared/protocol.ts`, Integrationstests mit echten WebSocket-Clients (`testClient.ts`)
- M3 Haiku: ✅ `server/src/ai/haiku.ts` (`claude-haiku-4-5`, Structured Output: pro Antwort
  `correct` + `same_as`, Stapel per Union-Find). Ohne API-Key → `exactJudge`. Bei Fehler/Timeout → Fallback.
  Eval: `npm run eval:judge` (30 Fälle, nur Testwörter, ~3 Cent). Stand: 29/30, Richtig/Falsch 30/30;
  bekannter Grenzfall: zwei Tänze verschiedener Herkunft werden zusammengelegt.
  Prompt-Beispiele nie aus den Eval-Fällen nehmen (Überanpassung).
- M4 Client: ✅ technisch (`client/`, Preact 11 + Vite, ~10 KB JS gz), E2E grün (`e2e/`, System-Edge).
  Offen: Testrunde im WLAN mit echten Handys (macht der Nutzer).
- M5 Wortliste: ✅ `data/words.json` (264 Wörter, vom Nutzer gestrichen). **Nie ansehen/ausgeben** (Spoiler).
- M6 Härtung: ✅ Verbindungslimits (60/IP, 2000 gesamt), Security-Header/CSP, `/healthz` als JSON
  (`activeGames` für Deploy-Checks), Lasttest `npm run loadtest` (20×10×3, Heap stabil ~11 MB).
- M7 Tech-Preview: ✅ online unter https://schwindelex.blanke.nrw (2026-10-02). Smoke-Test über wss mit
  Haiku ok (~1 s pro Runde). Updates: `~/schwindelex-setup/deploy.sh` auf dem Server (nach Absprache).
- M8 Design: ✅ online seit 2026-10-02 (`client/src/style.css`: Tokens hell=Papier/Tinte,
  dunkel=Tafel/Kreide, Post-its, Stapel, Stempel, Kritzeleien, Animationen mit reduced-motion).
  - Bild-Assets: Rohbilder in `design/roh/` (gitignored, Prompts in `design/bild-prompts.md`).
    `python design/zerschneiden.py` → Icon-Sprite `client/src/assets/icons.webp` + `icons.gen.ts/.css`
    + Favicons in `client/public/`. `python design/texturen.py` → nahtlose Kacheln `paper.webp`/`board.webp`
    (Zieltöne/Kontrast oben im Skript). Generierte Dateien nicht von Hand ändern.
  - Icons: `<Icon name="…" />` (Maske, Farbe = currentColor) oder im CSS `var(--icon-<name>)` mit
    `var(--icon-sprite)`/`var(--icon-sprite-size)` (z. B. `h2.scribbled::after`).
  - Screenshots zur Sichtprüfung: `npx playwright test e2e/screens.spec.ts` → `test-results/screens/`
    (mobil hell/dunkel, desktop). Der Test prüft auch auf horizontalen Overflow.
- M9 Release: ✅ Betriebshandbuch [BETRIEB.md](BETRIEB.md) (Betrieb, Updates, Rollback, Fehlersuche,
  Limits, Kosten, Datenschutz, Inhalte ändern), [README.md](README.md). Bei Änderungen an Limits,
  Log-Texten oder Abläufen BETRIEB.md mitpflegen.
- Wortliste: fertig, Pipeline in `wortliste/`. Bei Neuauflage Dateien dort committen, **ohne Inhalte anzusehen**.

## Regeln für die Zusammenarbeit
- **Spoilerschutz:** Der Nutzer spielt selbst mit. Niemals echte Spielwörter mit Definitionen zeigen
  (`data/words.json`, `wortliste/ergebnis/`). Entwicklung und Tests nutzen `data/words.test.json`.
- **Dateien nie per Heredoc schreiben** (zerschießt Inhalte auf diesem Windows-Rechner) → Write/Edit-Tool.
- **Nichts global installieren.** Projektlokale npm-Pakete sind ok. Für alles andere dem Nutzer den Befehl geben.
- **Git:** häufige kleine Commits auf `main`, **Push/Deployment nur nach Absprache**.
- Secrets nur in `.env` (gitignored), Vorlage `.env.example`. Das Repo ist **öffentlich**.
- Nach jedem Milestone: Abschnitt „Stand“ oben aktualisieren.

## Umgebung
- Lokal: Windows 11, Node 24 LTS, npm 11, Python 3.13, Shells: PowerShell und Git-Bash.
- Server: Debian-V-Server, Domain `schwindelex.blanke.nrw`. SSH-Zugang steht in `CLAUDE.local.md`
  (gitignored, Repo ist öffentlich). Der SSH-Benutzer hat **kein sudo**. Alles, was root braucht (nginx, certbot, systemd), als Skript unter
  `deploy/` vorbereiten, der Nutzer führt es aus. Auf dem Server laufen viele andere Projekte, also
  bestehende nginx-Konfigurationen nur lesen und nie anfassen.
- Remote: https://github.com/the-monte-christo/schwindelex (public)
- Produktion: Docker-Container aus Git-Checkout `~/schwindelex` des Deploy-Benutzers, `127.0.0.1:3020`,
  nur über nginx veröffentlicht (`schwindelex.blanke.nrw`). Das `Dockerfile` ist im Repo; Deploy-Skripte,
  Compose und nginx-Dateien gehören **nicht ins Git**: lokal in `deploy/` (gitignored, Runbook
  `deploy/README.md`), auf dem Server in `~/schwindelex-setup/` (dort auch die `.env`).
  Globales gzip in nginx.conf nutzt eine andere Seite – nginx.conf nie anfassen.
  SSH-Zugang, Benutzer und andere Projekte auf dem Server: nur in `CLAUDE.local.md`.
- **Öffentliches Repo:** Hostname, SSH-Alias und Benutzername des Servers nie in getrackte Dateien.

## Befehle
- `npm start`: Server (liest `.env`, Port aus `PORT`), `npm run dev:server` mit Watch
- `npm test`: Vitest (Unit und Integration)
- `npm run typecheck`: `tsc --noEmit`
- `npm run eval:judge`: Haiku-Evals gegen die echte API (kostet Geld, nur bei Prompt-Änderungen)
- `npm run loadtest`: Last- und Leck-Test (Parameter per Env: LOBBIES, PLAYERS, ROUNDS, BATCHES)
- `npm run build`: Client nach `client/dist` (der Node-Server liefert ihn aus)
- `npm run dev:client`: Vite-Devserver mit Proxy auf den Node-Server (Port 3000)
- `npm run test:e2e`: Playwright gegen System-Edge (`channel: 'msedge'`, **keine** Browser-Downloads).
  Startet eigenen Server auf Port 3100 mit `SKIP_ENV_FILE=1` (kein API-Key, keine Kosten).

## Architektur (Kurzfassung)
- `Game` (rein) ← `LobbyManager` (Sessions, Timer, Effekte, Broadcast) ← `startServer` (HTTP, `ws`, Heartbeat)
- Nach jeder Aktion: `afterChange()` → Effekte ausführen (Judge async, Spielende), Timer neu setzen,
  jedem Spieler seinen `viewFor()`-Snapshot senden (nur bei Änderung).
- Geheimnisse bleiben serverseitig: Schreiben → keine fremden Antworten, Tippen → keine Autoren/`isTrue`.
  Tests in `server.test.ts` prüfen das. Bei neuen View-Feldern dort mittesten.
- Rate-Limits: Lobby erstellen 10/10 min pro IP, fehlgeschlagene Beitritte 20/min pro IP
  (erfolgreiche zählen nicht, eine Party teilt sich eine IP), 20 Nachrichten/s pro Verbindung.

## Konventionen
- TypeScript im Server läuft per nativem Type-Stripping von Node: nur „erasable syntax“
  (keine `enum`s, keine Parameter-Properties, kein `namespace`), relative Importe mit `.ts`-Endung.
- Spiellogik in `server/src/game/` ist rein (kein I/O, keine echten Timer, kein `Math.random` direkt).
  Uhr und Zufall werden injiziert.
- Code und Bezeichner auf Englisch, UI-Texte auf Deutsch.
- Client: Preact 11. Werden Elemente gleichen Typs bedingt ausgetauscht (z. B. zwei Formulare),
  `key` setzen – sonst verwendet Preact Inputs wieder und Handler/State geraten durcheinander.
- E2E-Selektoren über Rollen/Labels (`getByRole`, `getByLabel`), damit sie das Redesign in M8 überleben.
