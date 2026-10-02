# Arbeitsverzeichnis Wortliste – Anleitung für den Agenten

Du baust die Wortliste für **Schwindelex**, ein Browser-Partyspiel im Stil von „Nobody's Perfect“:
Allen Spielern wird ein seltenes deutsches Wort gezeigt, alle erfinden eine plausible Kurzdefinition
(max. 100 Zeichen), dann wird die echte Definition zwischen die erfundenen gemischt und getippt.

Dein Ergebnis: **300 gute Spielwörter mit je einer Kurzdefinition** plus eine **Streichliste** für den Menschen.

## Harte Regeln

1. **Spoilerschutz – wichtigste Regel.** Der Mensch, der dich gestartet hat, spielt selbst mit.
   - Zeige ihm **niemals** Definitionen, Glossen oder Erklärungen zu Kandidatenwörtern – nicht im Chat,
     nicht in Zusammenfassungen, nicht als Beispiel. Auch keine Wortlisten im Chat.
   - Berichte Fortschritt nur als **Zahlen** („Schritt 3 fertig, 4.120 Kandidaten übrig“).
   - Einzige Ausnahme: die Datei `ergebnis/streichliste.txt` (nur nackte Wörter, siehe unten).
   - Wenn du eine Rückfrage hast, formuliere sie ohne konkrete Wörter/Definitionen.
2. **Nur in diesem Verzeichnis (`wortliste/`) arbeiten.** Nichts außerhalb anlegen oder ändern.
3. **Keine git-Operationen** (kein add/commit/checkout …). Ein anderer Agent arbeitet parallel im
   selben Repo und committet. Du schreibst nur Dateien.
4. **Nichts installieren** (kein `pip install`, kein `npm install -g`, kein winget). Verfügbar sind
   Python 3.13 (nur Standardbibliothek: `gzip`, `json`, `csv` …) und Node 24. Netzwerk ist erlaubt.
5. **Keine Heredocs** zum Schreiben von Dateien (zerschießt auf diesem Windows-Rechner Umlaute/Inhalte).
   Skripte und Dokumente immer mit dem Write/Edit-Tool anlegen, dann ausführen.
6. **Nie die ganze JSONL in den RAM laden.** Die Rohdatei entpackt ~2,8 GB → zeilenweise streamen
   (`gzip.open(..., 'rt', encoding='utf-8')`).
7. **Fortsetzbar arbeiten.** Jeder Schritt schreibt sein Ergebnis in `arbeit/` und ist idempotent.
   Halte den Stand in `NOTIZEN.md` fest (welcher Schritt erledigt, Zahlen, Entscheidungen, verifizierte
   Feldnamen), damit du nach einer Kontext-Zusammenfassung oder Neustart weitermachen kannst.
   **Lies `NOTIZEN.md` zu Beginn jeder Sitzung.**

## Verzeichnisstruktur

```
wortliste/
  CLAUDE.md          diese Anleitung (nicht ändern)
  NOTIZEN.md         dein Arbeitsprotokoll (anlegen/pflegen)
  skripte/           deine Skripte (werden committet)
  raw/               Rohdaten, gitignored (schon heruntergeladen, siehe unten)
  arbeit/            Zwischenergebnisse, gitignored
  ergebnis/          words.json + streichliste.txt
```

## Rohdaten (liegen bereits in `raw/`)

- `raw/raw-wiktextract-data.jsonl.gz` – deutsches Wiktionary als wiktextract-Rohexport (kaikki.org,
  Stand Dump 2026-09-01). Eine JSON-Zeile pro Eintrag. Erste Zeile sieht so aus:
  `{"word": "Hallo", "pos": "noun", "pos_title": "Substantiv", "lang_code": "de", "lang": "Deutsch", "senses": [{"glosses": [...], ...}]}`
  Weitere Feldnamen (`tags`, `form_of`, `raw_tags`, `categories`, …) **selbst am echten File
  verifizieren** (z. B. erste 50.000 Zeilen auswerten, welche Keys/Tags vorkommen) und in `NOTIZEN.md`
  dokumentieren. Nicht aus Doku raten.
- `raw/deu_news_2024_1M/…-words.txt`, `raw/deu_mixed-typical_2011_1M/…-words.txt`,
  `raw/deu_wikipedia_2021_1M/…-words.txt` – Häufigkeitslisten der Leipzig Corpora Collection
  (CC BY). Format: `id<TAB>wortform<TAB>häufigkeit`, case-sensitive, Wortformen (keine Lemmata).
  Weitere Korpora (auch 10M-Varianten) gibt es unter
  `https://downloads.wortschatz-leipzig.de/corpora/<name>.tar.gz` – nur falls die 1M-Listen für das
  Seltenheitsband zu dünn sind. Aus dem Tarball nur `*-words.txt` behalten.

## Schritte

### 1. Erkunden
Struktur verifizieren: Verteilung von `pos`, `lang_code`, vorkommende `tags`/`raw_tags` in Senses,
wie Flexionsformen und Verweise markiert sind (`form_of`, Glossen wie „Nominativ Plural des
Substantivs …“, „siehe …“). Ergebnis in `NOTIZEN.md`.

### 2. Extrahieren + hart filtern → `arbeit/kandidaten_roh.jsonl`
Behalten nur:
- `lang_code == "de"`, Wortart Substantiv, Adjektiv oder Verb
- keine Flexionsformen/Verweiseinträge, keine Eigennamen, Abkürzungen, Affixe, Phrasen/Mehrwortausdrücke,
  keine Wörter mit Ziffern/Sonderzeichen
- Glosse vorhanden und inhaltlich (nicht „siehe …“, kein reiner Verweis)
- **eine** klare Bedeutung, oder die erste Bedeutung ist eindeutig die Hauptbedeutung
- Tags: **ausschließen** vulgär, derb, abwertend, beleidigend, stark regional/dialektal, Jargon/Slang.
  **Behalten, aber markieren**: veraltet, veraltend, gehoben, scherzhaft, fachsprachlich
  (Fachsprache nur, wenn Laien die Erklärung verstehen).
Pro Kandidat speichern: Wort, Wortart, erste Glosse(n), Tags, ggf. Kategorien/Themengebiet.

### 3. Seltenheit → `arbeit/kandidaten_selten.jsonl`
- Häufigkeiten der drei Leipzig-Listen zusammenführen (pro Korpus auf Gesamttokens normieren, dann
  kombinieren). Für das Lemma auch naheliegende Formen mitzählen, wenn einfach machbar
  (Wiktionary-Einträge haben teils `forms`).
- Zielband: **selten, aber real belegt.** Nicht zu bekannt (grob: außerhalb der häufigsten ~20.000),
  aber nicht völlig unbelegt (das ist oft Müll oder Expertenjargon). Ausnahme: Wörter ohne Beleg dürfen
  bleiben, wenn Wiktionary sie als veraltet/gehoben führt und die Glosse gut ist.
- **Band kalibrieren**: Stichproben aus verschiedenen Rängen ansehen (nur für dich, nicht dem Menschen
  zeigen) und Grenzen so setzen, dass ca. **3.000–6.000** Kandidaten übrig bleiben. Entscheidung in
  `NOTIZEN.md` begründen.

### 4. Vorauswahl (du selbst bewertest) → `arbeit/bewertung/*.jsonl`
Kandidaten in Blöcken von ~200 durchgehen und jedes Wort bewerten, Ergebnis pro Block in eine Datei
(so ist es fortsetzbar). Kriterien:
- klingt kompliziert/spannend, hat **Ratepotenzial** (man kann plausiblen Unsinn erfinden)
- Bedeutung **nicht** trivial aus Bestandteilen ableitbar (kein „Blumenvase“, kein „Lesebrille“)
- eine eindeutige Erklärung in ≤100 Zeichen ist möglich
- nicht anstößig, nicht stark regional, kein Expertenjargon
- Normaler Erwachsener kennt es vermutlich **nicht** (Rang allein reicht nicht – z. B. sind manche
  seltene Wörter trotzdem allgemein bekannt)
Score 0–3 vergeben, kurze Notiz nur für dich. Ziel: ~600–800 mit Score 3.

### 5. Endauswahl + Kurzdefinition → `ergebnis/words.json`
300 Wörter auswählen. Dabei auf **Streuung** achten: Mischung aus Substantiven, Verben, Adjektiven
(Substantive dürfen überwiegen, aber nicht >70 %); nicht mehrere Wörter aus derselben Wortfamilie;
nicht >15 Wörter aus demselben Themengebiet; veraltete Wörter max. ~30 %.

Pro Wort eine **Kurzdefinition** schreiben:
- inhaltlich korrekt laut Wiktionary-Glosse, **max. 100 Zeichen**
- **im Register der Mitspieler**: so, wie ein Mensch am Handy schnell eine Erklärung tippen würde –
  locker, schlicht, ohne Lexikonstil („gehoben für …“, „bildungssprachlich“, Klammern, Semikolons,
  Abkürzungen wie „jmd.“/„etw.“). Sonst erkennt man die echte Antwort sofort am Stil.
- enthält weder das Wort selbst noch seinen auffälligen Wortstamm
- kein Punkt am Ende nötig; Groß-/Kleinschreibung normal
**Ausschluss:** Kein Wort aus `../data/words.test.json` aufnehmen (das sind gespoilerte Testwörter;
lesen ist erlaubt, ändern nicht).

Beispiel für den Stil (Testwort, nicht in die Liste aufnehmen): *Kladderadatsch* →
„ein großes Durcheinander oder ein peinlicher Zusammenbruch“ statt
„(umgangssprachlich) Durcheinander; Skandal; Zusammenbruch“.

Format `ergebnis/words.json` (UTF-8, ohne BOM, 2 Leerzeichen Einrückung):
```json
{
  "version": 1,
  "source": "Wiktionary (CC BY-SA 4.0), Seltenheit: Leipzig Corpora Collection (CC BY 4.0)",
  "words": [
    { "id": "w001", "word": "…", "pos": "noun|verb|adj", "definition": "…", "tags": ["veraltet"], "domain": "…" }
  ]
}
```

### 6. Selbstprüfung → `arbeit/pruefung.md`
Zweiter Durchgang über alle 300 mit Skript + eigenem Blick: Länge ≤100, Definition stimmt mit Glosse
überein, kein Wortstamm in der Definition, keine Dubletten/Wortfamilien, Stil locker, Streuung erfüllt.
Fehler korrigieren. Zahlen in `NOTIZEN.md` festhalten.

### 7. Streichliste → `ergebnis/streichliste.txt`
**Nur die 300 nackten Wörter**, eins pro Zeile, alphabetisch, keine Überschrift, keine Nummern,
keine Wortart, keine Definition, keine Anmerkungen. Der Mensch löscht darin Zeilen von Wörtern, die er
zu bekannt/doof findet, und sagt dir Bescheid.

### 8. Streichungen anwenden (erst wenn der Mensch Bescheid gibt)
Skript `skripte/anwenden.py`: behält in `words.json` nur Wörter, die noch in `streichliste.txt`
stehen, vergibt IDs neu, meldet nur die Anzahlen (vorher/nachher). Dem Menschen nichts weiter zeigen.

## Fertig
Am Ende dem Menschen nur melden: Anzahl Wörter, Verteilung nach Wortart (Zahlen), Pfad zur
Streichliste. Fertig ist es, wenn beide Dateien in `ergebnis/` liegen und `NOTIZEN.md` aktuell ist.
