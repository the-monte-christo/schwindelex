# NOTIZEN (Arbeitsprotokoll)

## Besonderheiten / Entscheidungen
- CLAUDE.md-Update: Kein Wort aus `../data/words.test.json` aufnehmen (nur lesen).
- Keine Wörter/Definitionen im Chat zeigen; auch Skriptausgaben nur als Zahlen.

## Verifizierte Feldnamen (Schritt 1, am echten File)
- 1.329.116 Zeilen; lang_code=de: 1.010.306. Wichtige pos_title: Substantiv (201.714), Adjektiv (33.155), Verb (27.801).
  Flexionsformen haben eigene pos_title ("Deklinierte Form", "Konjugierte Form", "Partizip I/II", ...) -> per pos_title ausschließbar.
- Entry-Keys: word, pos, pos_title, lang_code, senses, categories, tags (Genus: feminine/masculine/neuter, phrase, abbrev, ...), forms, etymology_texts, synonyms, ...
- Sense-Keys: glosses (Liste), sense_index, examples, tags, raw_tags, topics, form_of, alt_of, categories.
- Sense-Tags (englisch normalisiert): colloquial, figurative, outdated, archaic, derogatory, vulgar, jargon, regional, literary, humorous, jocular, formal, poetic, gehoben, rare, historical, impolite, Austrian German, Swiss Standard German, North German, South-German, Bavarian ...
- Sense-raw_tags (deutsch): Schimpfwort, familiär, bildungsspr., archaisch, Jargon, Jägersprache, Musik, ...
- Sense-topics: linguistics, medicine, botany, zoology, chemistry, ... (englisch)
- categories: Liste von Strings/Dicts (Name).

## Zahlen & Entscheidungen
- Schritt 2 (03_extrahieren.py): 134.354 Kandidaten roh (de, Substantiv/Adjektiv/Verb, keine Formen/Namen/Abk./Phrasen, nur Buchstaben >=4, Glosse ok, <=4 Bedeutungen, schlechte Tags raus).
- Schritt 3: 04_haeufigkeit.py (3 Leipzig-Listen, pro Korpus normiert, Mittel; Lemma = Grundform + Formen mit gleichem Anfangsbuchstaben, >=4 Zeichen; 12 Testwörter aus ../data/words.test.json ausgeschlossen), 05_band.py (globaler Rang), 07_filter_komposita.py.
  Band: globaler Rang 35.000–100.000 (ab Rang 50.000 in allen 3 Korpora belegt, sonst min. 2); Ausnahme veraltet/gehoben/veraltend auch unbelegt.
  Zusätzlich raus: Komposita (zerlegbar in 2 häufige Wörter), Ableitungs-Suffixe (-ung, -keit, -bar, -lich ...), Fachgebiete (EXPERT-Topics), transparente Präfixverben.
  Begründung: reine Rangbänder lieferten fast nur transparente Komposita; Ergebnis **6.239** Kandidaten (4.290 Nomen, 1.242 Verben, 707 Adj.) -> `arbeit/kandidaten_selten.jsonl`.
- Schritt 4: Bewertung per Hand in Blöcken à 200 (`arbeit/bewertung/block_NN.jsonl`, nur Wörter mit Score>=2 werden aufgeführt; nicht aufgeführte = 0/1).

- Schritt 4 Pool A fertig: 31 Blöcke (`09_block.py N`, alphabetisch sortiert aus kandidaten_selten.jsonl, 200/Block) -> arbeit/bewertung/block_01..31.jsonl; 720x Score 3, 642x Score 2. Problem: fast nur veraltete Wörter (Score 3 nicht-veraltet nur 41).
- Pool B (für nicht-veraltete, `10_pool_b.py build`): grank 75k–300k, >=2 Korpora, ohne Personen-/Orts-/Tier-Glossen, ohne Komposita/Suffixe/Fachgebiete, ohne veraltet -> `arbeit/kandidaten_poolb.jsonl` (5.093). Blöcke à 300 via `11_block_b.py N` -> arbeit/bewertung/b_block_NN.jsonl (gleiches Format).

- Pool B zusätzlich auf Wortlänge <=9 gekürzt (2.545 Kandidaten, 8 Blöcke à 300 via `11_block_b.py N`, Bewertungen in `b_block_01..08.jsonl`, Block 8 deckt Ausgabe 8+9 ab). Ergebnis gesamt: Score 3 = 807 (128 nicht veraltet, 679 veraltet), Score 2 = 875 (376 nicht veraltet).
- Schritt 5: Auswahl aus Score 3/2; Quoten: veraltet <=30 %, Nomen <=70 %, keine Wortfamilien, `../data/words.test.json`-Wörter ausgeschlossen.

- Schritt 5/6: Auswahl in `arbeit/auswahl_a|b|c.txt` (Format `wort|definition|domäne`), gebaut mit `13_bauen.py` -> `arbeit/auswahl_roh.json`; Prüfung `14_pruefen.py`, Glossen-Vergleich `15_vergleich.py`; Ausgabe `16_ergebnis.py` -> `ergebnis/words.json`, `ergebnis/streichliste.txt`, `arbeit/pruefung.md`.
  Zahlen: 300 Wörter; 193 Nomen (64 %), 77 Verben, 30 Adjektive; 90 veraltet (30 %); längste Definition 88 Zeichen; größtes Themengebiet 15; keine Dubletten, keine Testwörter.
- Schritt 8 vorbereitet: `skripte/anwenden.py` (erst ausführen, wenn der Mensch die Streichliste bearbeitet hat).

## Fortschritt
- [x] Schritt 1 Erkunden (skripte/01_erkunden.py, 02_struktur.py)
- [x] Schritte 2–7 fertig, `ergebnis/words.json` und `ergebnis/streichliste.txt` liegen vor
- [x] Schritt 8 angewendet: 300 -> 264 Wörter (181 Nomen, 58 Verben, 25 Adjektive), IDs neu vergeben
