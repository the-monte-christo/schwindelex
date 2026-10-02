import json, glob, re, random, sys

lists = glob.glob('raw/*/*-words.txt')
allf = {}
for p in lists:
    d = {}; tot = 0
    with open(p, encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) < 3: continue
            d[parts[1]] = d.get(parts[1], 0) + int(parts[2]); tot += int(parts[2])
    for k, v in d.items(): allf[k] = allf.get(k, 0) + v / tot / len(lists)
top = sorted(allf, key=lambda k: -allf[k])[:40000]
known = {w.lower() for w in top if len(w) >= 3 and w.isalpha()}

LINK = ['', 's', 'n', 'en', 'e', 'es', 'er', 'o', 'i']
SUFFIX_NOUN = re.compile(r'(ung|ungen|keit|heit|schaft|ling|nis|tum|ismus|ist|istin|ität|ation|ismen|erin|ner|ler|chen|lein)$')
SUFFIX_ADJ = re.compile(r'(bar|lich|ig|isch|los|frei|haft|sam|voll|artig|mäßig|reich|arm|weise|fähig|fertig)$')

def decomposable(w):
    lw = w.lower()
    for i in range(3, len(lw) - 2):
        a, b = lw[:i], lw[i:]
        if len(b) < 3: continue
        for l in LINK:
            if l and not a.endswith(l): continue
            aa = a[:len(a) - len(l)] if l else a
            if len(aa) >= 3 and aa in known and (b in known or b.rstrip('s') in known):
                return True
    return False

GMIN = 35000
EXPERT = {'linguistics', 'grammar', 'taxonomy', 'chemistry', 'mathematics', 'electrical-engineering', 'computing',
          'physics', 'medicine', 'biology', 'botany', 'zoology', 'ornithology', 'anatomy', 'geology', 'astronomy',
          'meteorology', 'law', 'economics', 'finance', 'technology', 'geometry', 'statistics', 'sports', 'football',
          'viticulture', 'military', 'politics', 'Christianity', 'religion', 'philosophy', 'psychology'}
PREF = ['be', 'ver', 'er', 'ent', 'zer', 'ge', 'ab', 'an', 'auf', 'aus', 'ein', 'mit', 'nach', 'vor', 'zu', 'um',
        'über', 'unter', 'durch', 'hinter', 'weg', 'her', 'hin', 'fort', 'zurück', 'los', 'ent', 'miss', 'wider']
known_verbs = {w for w in known if w.endswith('en') or w.endswith('ern') or w.endswith('eln')}
def verb_transparent(w):
    for p in PREF:
        if w.startswith(p) and w[len(p):] in known_verbs and len(w) - len(p) >= 4:
            return True
    return False

rows = [json.loads(l) for l in open('arbeit/kandidaten_mit_freq.jsonl', encoding='utf-8')]
keep = []
from collections import defaultdict
cnt = defaultdict(int)
for r in rows:
    w = r['word']
    belegt = r['f_lemma'] > 0
    gehoben_alt = any(t in ('veraltet', 'veraltend', 'gehoben') for t in r['tags'])
    if belegt and r['grank'] <= 15000: cnt['zu_haeufig'] += 1; continue
    if not belegt and not gehoben_alt: cnt['zu_selten'] += 1; continue
    if belegt and r['n_korpora'] < 2 and not gehoben_alt: cnt['zu_selten'] += 1; continue
    if belegt and r['grank'] > 100000 and not gehoben_alt: cnt['zu_selten'] += 1; continue
    if belegt and r['n_korpora'] < 3 and r['grank'] > 50000 and not gehoben_alt: cnt['zu_selten'] += 1; continue
    if r['pos'] == 'noun' and SUFFIX_NOUN.search(w): cnt['suffix'] += 1; continue
    if r['pos'] == 'adj' and SUFFIX_ADJ.search(w): cnt['suffix'] += 1; continue
    if belegt and r['grank'] <= GMIN and not gehoben_alt: cnt['zu_haeufig'] += 1; continue
    if set(r['topics']) & EXPERT: cnt['fachgebiet'] += 1; continue
    if r['pos'] != 'verb' and decomposable(w): cnt['kompositum'] += 1; continue
    if r['pos'] == 'verb' and verb_transparent(w): cnt['verb_praefix'] += 1; continue
    # trennbare/präfixverben mit häufigem Grundverb: grob
    keep.append(r)
print(cnt, 'uebrig', len(keep))
from collections import Counter
print(Counter(r['pos'] for r in keep))
with open('arbeit/kandidaten_selten_vorstufe.jsonl', 'w', encoding='utf-8') as out:
    for r in keep: out.write(json.dumps(r, ensure_ascii=False) + '\n')
random.seed(2)
if len(sys.argv) > 1:
    print(', '.join(r['word'] for r in random.sample(keep, 80)))
