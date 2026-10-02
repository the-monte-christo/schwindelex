import json, random, sys
random.seed(1)
rows = [json.loads(l) for l in open('arbeit/kandidaten_mit_freq.jsonl', encoding='utf-8')]
lo, hi, n = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
sel = [r for r in rows if lo < r['grank'] <= hi and r['n_korpora'] >= 2]
print(len(sel))
print(', '.join(r['word'] for r in random.sample(sel, min(n, len(sel)))))
