import json, glob, sys
# Gibt Bewertungen (Score/veraltet/POS-Filter) mit Glosse aus -> nur zur eigenen Durchsicht
score = int(sys.argv[1]); alt = sys.argv[2] == 'alt'; pos = sys.argv[3]  # noun|verb|adj|all
rows = {}
for f in ['arbeit/kandidaten_selten.jsonl', 'arbeit/kandidaten_poolb.jsonl']:
    for l in open(f, encoding='utf-8'):
        d = json.loads(l); rows[d['word']] = d
out = []
for p in sorted(glob.glob('arbeit/bewertung/*.jsonl')):
    for l in open(p, encoding='utf-8'):
        d = json.loads(l)
        if d['score'] != score: continue
        r = rows[d['word']]
        isalt = any(t in ('veraltet', 'veraltend') for t in r['tags'])
        if isalt != alt: continue
        if pos != 'all' and r['pos'] != pos: continue
        g = r['glosses'][0][:int(sys.argv[4]) if len(sys.argv) > 4 else 90]
        out.append(f"{r['word']} {r['pos'][0]}: {g}")
print(len(out))
print('\n'.join(out))
