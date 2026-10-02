import gzip, json
from collections import Counter

etags = Counter(); cats = Counter(); topics = Counter(); gl = Counter()
n = 0
with gzip.open('raw/raw-wiktextract-data.jsonl.gz', 'rt', encoding='utf-8') as f:
    for line in f:
        d = json.loads(line)
        if d.get('lang_code') != 'de' or d.get('pos_title') not in ('Substantiv', 'Adjektiv', 'Verb'):
            continue
        n += 1
        if n > 60000: break
        for t in d.get('tags', []): etags[t] += 1
        for s in d['senses']:
            for t in s.get('topics', []): topics[t] += 1
            for g in s.get('glosses', [])[:1]:
                gl[' '.join(g.split()[:2])] += 1
        for c in d.get('categories', []):
            cats[c if isinstance(c, str) else c.get('name', '?')] += 1
out = ['ENTRY TAGS ' + str(etags.most_common(60)), 'TOPICS ' + str(topics.most_common(40)),
       'CATS ' + str(cats.most_common(40)), 'GLOSS STARTS ' + str(gl.most_common(40))]
open('arbeit/struktur.txt', 'w', encoding='utf-8').write('\n'.join(out))
