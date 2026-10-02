import json, re, sys, random
mode = sys.argv[1] if len(sys.argv) > 1 else 'build'
sys.argv = [sys.argv[0]]
# Wiederverwendung der Hilfsfunktionen aus Skript 07 (known-Menge, decomposable, verb_transparent ...)
src = open('skripte/07_filter_komposita.py', encoding='utf-8').read().split("rows = [json.loads")[0]
exec(src)

first = {json.loads(l)['word'] for l in open('arbeit/kandidaten_selten.jsonl', encoding='utf-8')}
rows = [json.loads(l) for l in open('arbeit/kandidaten_mit_freq.jsonl', encoding='utf-8')]
EXPERT_HARD = {'linguistics', 'grammar', 'taxonomy', 'chemistry', 'mathematics', 'electrical-engineering',
               'computing', 'physics', 'geometry', 'statistics', 'finance', 'law', 'economics', 'technology',
               'football', 'sports', 'medicine', 'anatomy', 'biology'}
LO, HI = 75000, 300000
keep = []
for r in rows:
    w = r['word']
    if w in first: continue
    if r['f_lemma'] <= 0 or r['n_korpora'] < 2: continue
    if not (LO < r['grank'] <= HI): continue
    g = r['glosses'][0]
    if re.match(r'^(Person|Mensch|Frau|Mann|Einwohner|Bewohner|Angehörige|Anhänger|Mitglied|Bürger|jemand|Vertreter)\b', g): continue
    if re.search(r'(Sprache|Stadt |Fluss|Gemeinde|Region|Insel|Volk|Bundesland|Hunderasse|Pferderasse|Adelsgeschlecht|Ortsteil|Berg in|Gattung|Familie der|Art der|Unterart|Pilz|Käfer|Schmetterling|Vogel|Fisch)', g[:90]): continue
    if re.match(r'^(Gesamtheit|Zeitraum|Zeitpunkt|Handlung|Vorgang|Zustand|Tätigkeit|Eigenschaft)\b', g) and r['pos'] == 'noun': continue
    if r['pos'] == 'noun' and SUFFIX_NOUN.search(w): continue
    if r['pos'] == 'adj' and SUFFIX_ADJ.search(w): continue
    if r['pos'] != 'verb' and decomposable(w): continue
    if r['pos'] == 'verb' and verb_transparent(w): continue
    if set(r['topics']) & EXPERT_HARD: continue
    if any(t in ('veraltet', 'veraltend') for t in r['tags']): continue
    keep.append(r)
print('pool B', len(keep))
from collections import Counter
print(Counter(r['pos'] for r in keep))
if mode == 'sample':
    random.seed(5)
    for r in random.sample(keep, 80): print(r['word'], r['pos'][0], r['glosses'][0][:45])
else:
    with open('arbeit/kandidaten_poolb.jsonl', 'w', encoding='utf-8') as out:
        for r in sorted(keep, key=lambda r: r['word'].lower()): out.write(json.dumps(r, ensure_ascii=False) + '\n')
