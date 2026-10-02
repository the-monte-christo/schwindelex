# Schwindelex – Implementierungsplan

Stand: 2026-10-02. Grundlage: [project.md](project.md) + Entscheidungen aus der Abstimmung.

## Spielregeln (verbindlich)

**Lobby**
- Host erstellt die Lobby mit **Host-PIN** (aus `.env`), bekommt Einladungscode, Link und QR-Code.
- Spieler geben einen Namen ein (eindeutig pro Lobby, nichts wird dauerhaft gespeichert).
- Wenn alle bereit sind, startet der Host. Mindestens 2 Spieler, maximal 20.
- Verlässt der Host die Vor-Lobby, wird der nächste Spieler Host. Nach dem Start hat der Host keine Sonderrechte mehr.

**Runde**
1. **Schreiben** – Wort wird gezeigt. 90 s oder bis alle aktiven Spieler „OK“ gedrückt haben.
   „Löschen“ leert die Antwort. Bei Timeout zählt der aktuelle Entwurf. Max. 100 Zeichen.
   Leere Antwort ist erlaubt, man tippt trotzdem mit.
2. **Gruppieren** – Haiku prüft, welche Antworten inhaltlich richtig sind, und gruppiert sehr ähnliche
   falsche Antworten zu Stapeln.
   - Gibt es richtige Spielerantworten, bilden sie den **wahren Stapel**, angezeigt mit dem Text einer
     Spielerantwort. Die vordefinierte Definition wird nur gezeigt, wenn niemand richtig lag.
3. **Tippen** – jeder tippt per Tap/Klick genau einen Stapel, **auch den eigenen**.
   Zeit: 30 s bei bis zu 5 aktiven Spielern, ab 6 Spielern +5 s je Spieler
   (`30 + 5 · max(0, n − 5)`). Vorbei, sobald alle getippt haben.
4. **Werten**
   - +1 für eine richtige Antwort geschrieben
   - +1 für den wahren Stapel getippt
   - +1 pro Mitspieler, der auf den eigenen (falschen) Stapel hereinfällt. Bei mehreren Autoren
     bekommt jeder Autor den Punkt.
   - Autoren des wahren Stapels bekommen keine Bluff-Punkte.
   - Wer den eigenen falschen Stapel tippt, bekommt nichts und gibt niemandem einen Bluff-Punkt.
   - Danach werden die Autoren enthüllt.
5. **Weiter oder Passen** – jeder entscheidet für die nächste Runde. Wer passt, setzt die Runde aus
   (keine Punkte) und entscheidet nach der Runde neu. Am Rand gibt es „Mitspieler einladen“
   (Overlay mit QR-Code und Link).
   - Neue Spieler steigen in der nächsten Runde mit 0 Punkten ein, alle anderen behalten ihre Punkte.
   - Haben **alle oder alle bis auf einen** gepasst, ist das Spiel vorbei. Passen ist zugleich
     „Beenden“, es gibt keinen extra Knopf.
6. **Siegerehrung** → danach wird die Lobby auf dem Server gelöscht.

**Annahmen (bei Bedarf korrigieren)**
- Wörter wiederholen sich innerhalb einer Lobby nicht. Jede Lobby bekommt einen eigenen gemischten
  Stapel, über Lobbys hinweg sind Wiederholungen egal.
- Getrennte Spieler blockieren nichts: Schreiben und Tippen enden mit dem Timer, und bei
  „Weiter/Passen“ zählt ein getrennter Spieler als „passt“. Nach dem Wiederverbinden ist man wieder auf
  seinem Platz.
- Untätige Lobbys werden automatisch aufgeräumt (z. B. nach 30 min ohne verbundene Spieler).
- Beamer-/TV-Ansicht kommt später (nicht Teil dieses Plans).

## Technik

| Bereich | Entscheidung | Grund |
|---|---|---|
| Laufzeit | Node 24 LTS, TypeScript per nativem Type-Stripping (Server ohne Build-Schritt) | wenig Tooling |
| Echtzeit | WebSocket mit [`ws`](https://github.com/websockets/ws) auf dem Server, native `WebSocket` im Client, eigenes kleines Reconnect/Heartbeat | spart ca. 15 KB gz gegenüber socket.io, minimaler Overhead |
| Protokoll | JSON-Nachrichten. Der Server schickt jedem Spieler bei jeder Änderung einen eigenen gefilterten **Snapshot** seiner Sicht. | robust bei Reconnect, Zustand ist winzig |
| Client | Vite + Preact (ca. 4 KB), eigenes CSS | leicht, React-Know-how bleibt nutzbar |
| QR-Code | serverseitig als SVG erzeugt (Paket `qrcode`) | keine QR-Bibliothek im Client |
| KI | `claude-haiku-4-5` über `@anthropic-ai/sdk`, strukturierte JSON-Antwort, Timeout und Fallback (Gruppierung nur bei normalisiert gleichem Text) | |
| Speicher | nur im RAM, keine DB | alles temporär |
| Tests | Vitest (Unit und Integration), Playwright mit dem vorhandenen **Edge** (`channel: 'msedge'`), kein Browser-Download | |
| Betrieb | ein Node-Prozess (statische Dateien + WebSocket) hinter nginx, systemd, Let's Encrypt | |

Struktur:

```
server/src/game/    reine Spiellogik (Zustandsautomat, Wertung) – ohne I/O
server/src/net/     HTTP + WebSocket, Lobby-Verwaltung, Sessions
server/src/ai/      Haiku-Anbindung + Fake für Tests
shared/             Protokoll-Typen (Client ↔ Server)
client/             Preact-App
data/               words.json (echt, CC BY-SA), words.test.json (Testwörter, verbrennbar)
wortliste/          Pipeline für die Wortliste (eigener Agent, siehe wortliste/CLAUDE.md)
deploy/             Skripte für den V-Server
```

## Milestones

Jeder Milestone endet mit grünen Tests. Häufige Commits, Push nur nach Absprache.

| # | Milestone | Inhalt | Abgeschlossen, wenn |
|---|---|---|---|
| **M0** | Setup | git, Struktur, TypeScript, Vitest, `.env.example`, Quellenhinweis, Arbeitsverzeichnis Wortliste, Testwörter | `npm test` und `npm run typecheck` laufen |
| **M1** | Spiellogik | Zustandsautomat aller Phasen, Timer (injizierte Uhr), OK/Löschen/Entwurf, Wertung inkl. Sonderfälle, Weiter/Passen, Spätbeitritt, Spielende, Wortstapel pro Lobby | Unit-Tests für alle Regeln oben |
| **M2** | Server + Echtzeit | HTTP-Server, WebSocket-Protokoll, Lobby anlegen (Host-PIN), Beitritt per Code, Snapshots pro Spieler, Reconnect per Token, Host-Wechsel, Lobby-Aufräumen, QR-SVG, einfache Rate-Limits | Integrationstests mit 3–20 simulierten Clients spielen komplette Partien inkl. Abbrüchen und Spätbeitritt |
| **M3** | Haiku | Prompt + JSON-Schema, Validierung, Timeout, Fallback, Kosten-Log, Eval-Set (ca. 30 Fälle, nur Testwörter) | Evals gegen die echte API bestanden. Unit-Tests laufen ohne API. |
| **M4** | Funktionaler Client (ungestylt) | alle Screens funktional, Einladungs-Overlay, Mobile-Viewport | Playwright: 4 Spieler spielen eine ganze Partie. Testrunde im lokalen WLAN mit echten Handys. |
| **M5** | Wortliste | Sonnet-Agent in `wortliste/` → 300 Wörter → deine Streichliste → `data/words.json` | du hast gestrichen, Liste ist integriert |
| **M6** | Härtung | Eingabeprüfung, Lasttest (z. B. 10 Lobbys × 8 Spieler), Speicher nach Spielende sauber, Logging | Lasttest und alle Tests grün |
| **M7** | Tech-Preview online | Server erst nur lesend prüfen (Node/npm, nginx-Sites, freie Ports). Root-Skripte für dich (nginx-vhost, certbot, systemd-Unit), Deploy-Skript ohne root (git pull, npm ci, build, restart). | Partie über Mobilfunk auf schwindelex.blanke.nrw klappt |
| **M8** | Design | Tokens (Papier, Post-it, Tinte, Tafel, Kreide), hell/dunkel automatisch, Schrift mit leichtem Handschrift-Touch, unordentliche Zettel und Stapel, Aufdeck-Animationen. Bild-Prompts für Tilesets von mir, Ausschneiden durch mich. | E2E-Tests weiter grün, Screenshot-Tests Mobil/Desktop |
| **M9** | Release | finales Deployment, kurzes Runbook | Freigabe durch dich |

M5 läuft parallel zu M1–M4. Lokal wird mit `data/words.test.json` getestet, damit du dir die echten
Wörter nicht verdirbst.
