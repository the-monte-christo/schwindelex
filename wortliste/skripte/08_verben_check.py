import json
from collections import Counter
rows = [json.loads(l) for l in open('arbeit/kandidaten_mit_freq.jsonl', encoding='utf-8')]
v = [r for r in rows if r['pos'] == 'verb']
print(len(v), 'mit forms', sum(1 for r in v if r['forms']), 'belegt', sum(1 for r in v if r['f_lemma'] > 0))
print(Counter(min(r['grank'] // 20000, 10) for r in v))
print(Counter(r['n_korpora'] for r in v))
print(sum(1 for r in v if 15000 < r['grank'] < 150000), sum(1 for r in v if r['f_word'] > 0))
