import json, glob
from collections import defaultdict

lists = glob.glob('raw/*/*-words.txt')
rel = []  # list of dict form->relfreq
for p in lists:
    d = {}; tot = 0
    with open(p, encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) < 3: continue
            try: n = int(parts[2])
            except ValueError: continue
            d[parts[1]] = d.get(parts[1], 0) + n; tot += n
    rel.append({k: v / tot for k, v in d.items()})
    print(p, len(d), tot)

def comb(form):
    return sum(r.get(form, 0.0) for r in rel) / len(rel)

test = json.load(open('../data/words.test.json', encoding='utf-8'))
testwords = {w['word'].lower() for w in test['words']}

rows = []
for line in open('arbeit/kandidaten_roh.jsonl', encoding='utf-8'):
    c = json.loads(line)
    if c['word'].lower() in testwords: continue
    f_word = comb(c['word'])
    # nur Formen, die wie echte Flexionsformen aussehen (gleicher Anfangsbuchstabe, >=4 Zeichen),
    # sonst zählen Partikeln/Hilfsverben ("an", "ist") fälschlich mit
    f_lemma = f_word + sum(comb(x) for x in c['forms']
                           if len(x) >= 4 and x[0].lower() == c['word'][0].lower() and x != c['word'])
    # Belegt in wie vielen Korpora (Grundform)
    c['f_word'] = f_word; c['f_lemma'] = f_lemma
    c['n_korpora'] = sum(1 for r in rel if r.get(c['word'], 0) > 0)
    rows.append(c)

# Rang des Lemmas unter allen Kandidaten nach f_lemma (absteigend)
order = sorted(range(len(rows)), key=lambda i: -rows[i]['f_lemma'])
for rank, i in enumerate(order): rows[i]['rang'] = rank + 1
with open('arbeit/kandidaten_mit_freq.jsonl', 'w', encoding='utf-8') as out:
    for r in rows: out.write(json.dumps(r, ensure_ascii=False) + '\n')
print('gesamt', len(rows), 'testwoerter ausgeschlossen', len(testwords))
for lo, hi in [(0, 5000), (5000, 10000), (10000, 20000), (20000, 30000), (30000, 50000), (50000, 80000), (80000, 200000)]:
    print(lo, hi, sum(1 for r in rows if lo < r['rang'] <= hi))
print('unbelegt', sum(1 for r in rows if r['f_lemma'] == 0))
print('belegt in 1 Korpus', sum(1 for r in rows if r['f_lemma'] > 0 and r['n_korpora'] <= 1))
