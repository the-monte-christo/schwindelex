import json, glob, sys

lists = glob.glob('raw/*/*-words.txt')
rel = []
for p in lists:
    d = {}; tot = 0
    with open(p, encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) < 3: continue
            d[parts[1]] = d.get(parts[1], 0) + int(parts[2]); tot += int(parts[2])
    rel.append({k: v / tot for k, v in d.items()})
allf = {}
for r in rel:
    for k, v in r.items(): allf[k] = allf.get(k, 0) + v / len(rel)
fs = sorted(allf.values(), reverse=True)
def thr(rank): return fs[rank - 1]
rows = [json.loads(l) for l in open('arbeit/kandidaten_mit_freq.jsonl', encoding='utf-8')]
for r in rows:
    r['grank'] = sum(1 for _ in ()) or 0
import bisect
neg = [-x for x in fs]
for r in rows:
    r['grank'] = bisect.bisect_left(neg, -r['f_lemma']) + 1 if r['f_lemma'] > 0 else 10**9
cuts = [5000, 10000, 20000, 30000, 40000, 60000, 80000, 120000, 200000, 400000]
prev = 0
for c in cuts:
    n = sum(1 for r in rows if prev < r['grank'] <= c)
    n2 = sum(1 for r in rows if prev < r['grank'] <= c and r['n_korpora'] >= 2)
    print(prev, c, n, 'in>=2 korpora', n2)
    prev = c
print('unbelegt', sum(1 for r in rows if r['grank'] >= 10**9))
with open('arbeit/kandidaten_mit_freq.jsonl', 'w', encoding='utf-8') as out:
    for r in rows: out.write(json.dumps(r, ensure_ascii=False) + '\n')
