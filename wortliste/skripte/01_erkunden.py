import gzip, json, sys
from collections import Counter

PATH = 'raw/raw-wiktextract-data.jsonl.gz'
N = 50000
top = Counter(); sense = Counter(); pos = Counter(); lang = Counter()
tags = Counter(); rawtags = Counter(); cats = Counter(); formof = Counter()
total = 0
with gzip.open(PATH, 'rt', encoding='utf-8') as f:
    for i, line in enumerate(f):
        total += 1
        d = json.loads(line)
        lang[d.get('lang_code')] += 1
        pos[(d.get('pos'), d.get('pos_title'))] += 1
        for k in d: top[k] += 1
        if i >= N: continue
        for s in d.get('senses', []):
            for k in s: sense[k] += 1
            for t in s.get('tags', []): tags[t] += 1
            for t in s.get('raw_tags', []): rawtags[t] += 1
            if 'form_of' in s: formof['form_of'] += 1
            if 'alt_of' in s: formof['alt_of'] += 1
out = []
out.append(f'total lines {total}')
out.append('LANG ' + str(lang.most_common(8)))
out.append('POS ' + str(pos.most_common(30)))
out.append('TOP KEYS ' + str(top.most_common(40)))
out.append('SENSE KEYS (first 50k) ' + str(sense.most_common(40)))
out.append('TAGS ' + str(tags.most_common(80)))
out.append('RAW_TAGS ' + str(rawtags.most_common(80)))
out.append('FORMOF ' + str(formof))
open('arbeit/erkunden.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('ok', total)
