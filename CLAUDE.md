# Schwindelex

Browser-Multiplayer-Ratespiel im Stil von „Nobody's Perfect“ für Freunde und Familie.
Spec: [project.md](project.md) · Regeln, Architektur, Milestones: [PLAN.md](PLAN.md) · Quellen: [SOURCES.md](SOURCES.md)

> **Arbeitest du in `wortliste/`?** Dann gilt ausschließlich [wortliste/CLAUDE.md](wortliste/CLAUDE.md).
> Der Rest dieser Datei betrifft dich nicht.

## Stand
- M0 Setup: in Arbeit
- Wortliste: Arbeitsverzeichnis bereit, Sonnet-Agent arbeitet separat darin

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

## Befehle
- `npm test`: Vitest (Unit und Integration)
- `npm run typecheck`: `tsc --noEmit`

## Konventionen
- TypeScript im Server läuft per nativem Type-Stripping von Node: nur „erasable syntax“
  (keine `enum`s, keine Parameter-Properties, kein `namespace`), relative Importe mit `.ts`-Endung.
- Spiellogik in `server/src/game/` ist rein (kein I/O, keine echten Timer, kein `Math.random` direkt).
  Uhr und Zufall werden injiziert.
- Code und Bezeichner auf Englisch, UI-Texte auf Deutsch.
