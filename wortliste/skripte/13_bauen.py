import json, re, sys
from collections import Counter

rows = {}
for f in ['arbeit/kandidaten_selten.jsonl', 'arbeit/kandidaten_poolb.jsonl']:
    for l in open(f, encoding='utf-8'):
        d = json.loads(l); rows[d['word']] = d
test = json.load(open('../data/words.test.json', encoding='utf-8'))
testwords = {w['word'].lower() for w in test['words']}

DOM = {w: 'Familie' for w in ['beschwägern', 'beweiben', 'bevettern', 'Freite', 'Ehegespons', 'unbeweibt']}
DOM.update({'antichambrieren': 'Verwaltung', 'hochmögend': 'Verwaltung'})
KEEP_TAGS = {'veraltet', 'veraltend', 'gehoben', 'scherzhaft'}
entries = []
seen = set()
problems = []
for fn in ['arbeit/auswahl_a.txt', 'arbeit/auswahl_b.txt', 'arbeit/auswahl_c.txt']:
    for ln, line in enumerate(open(fn, encoding='utf-8'), 1):
        line = line.rstrip('\n')
        if not line.strip(): continue
        parts = line.split('|')
        if len(parts) != 3: problems.append(f'{fn}:{ln} Format'); continue
        w, d, dom = [p.strip() for p in parts]
        if w in seen: problems.append(f'Dublette {w}'); continue
        seen.add(w)
        if w not in rows: problems.append(f'unbekannt {w}'); continue
        if w.lower() in testwords: problems.append(f'Testwort {w}'); continue
        r = rows[w]
        entries.append({'word': w, 'pos': r['pos'], 'definition': d,
                        'tags': [t for t in r['tags'] if t in KEEP_TAGS], 'domain': DOM.get(w, dom)})
print('Anzahl', len(entries))
print(Counter(e['pos'] for e in entries))
alt = sum(1 for e in entries if any(t in ('veraltet', 'veraltend') for t in e['tags']))
print('veraltet', alt, round(alt / len(entries) * 100, 1), '%')
dc = Counter(e['domain'] for e in entries)
print('Domänen >12:', {k: v for k, v in dc.items() if v > 12})
print('Probleme:', problems)
for e in entries:
    if len(e['definition']) > 100: print('ZU LANG', e['word'], len(e['definition']))
json.dump(entries, open('arbeit/auswahl_roh.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
