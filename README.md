# Schwindelex

Ein Bluff-Spiel im Browser für Freunde und Familie, im Stil von „Nobody's Perfect“:
Alle sehen ein seltenes deutsches Wort, schreiben eine erfundene (oder richtige) Erklärung und tippen
dann, welcher Zettel stimmt. Punkte gibt es fürs Wissen, fürs richtige Tippen – und fürs Reinlegen.

**Spielen:** https://schwindelex.blanke.nrw (Spiel erstellen braucht eine Host-PIN, Mitspielen nicht)

- Handy zuerst, ein Spiel pro Lobby mit 2–20 Leuten, Einladung per QR-Code
- Claude Haiku erkennt richtige Antworten und legt sehr ähnliche Bluffs auf einen Stapel
- Kein Konto, keine Datenbank – Lobbys verschwinden nach der Siegerehrung

Technik: Node 24 (TypeScript ohne Build), WebSocket (`ws`), Preact + Vite, Playwright/Vitest.

- [PLAN.md](PLAN.md) – Regeln, Architektur, Meilensteine
- [BETRIEB.md](BETRIEB.md) – Betrieb, Updates, Fehlersuche, lokale Entwicklung
- [SOURCES.md](SOURCES.md) – Quellen und Lizenzen (Code: Unlicense, Wortliste: CC BY-SA 4.0)
