import gzip, json, re
from collections import Counter

POS = {'Substantiv': 'noun', 'Adjektiv': 'adj', 'Verb': 'verb'}
BAD_TAGS = {'vulgar', 'derogatory', 'impolite', 'offensive', 'jargon', 'slang', 'regional', 'dialectal',
            'Austrian German', 'Swiss Standard German', 'North German', 'South-German', 'Bavarian',
            'Germany', 'Low German', 'dialect', 'ethnic-slur', 'pejorative', 'form-of', 'alt-of',
            'abbreviation', 'abbrev', 'initialism', 'acronym', 'proper-noun'}
BAD_RAW = ('Schimpfwort', 'derb', 'vulgär', 'abwertend', 'beleidigend', 'Jargon', 'Slang', 'Dialekt',
           'regional', 'österreichisch', 'schweizerisch', 'süddeutsch', 'norddeutsch', 'mundartlich',
           'ostmitteldeutsch', 'westmitteldeutsch', 'oberdeutsch', 'bairisch', 'schweiz', 'österr',
           'nordostdeutsch', 'ostösterreichisch', 'landschaftlich', 'Kurzform', 'Abkürzung', 'Kurzwort',
           'Jugendsprache', 'Soldatensprache', 'verhüllend', 'Gaunersprache', 'Kindersprache',
           'Studentensprache', 'Schülersprache', 'salopp', 'unhöflich')
KEEP_MARK = {'outdated': 'veraltet', 'archaic': 'veraltet', 'historical': 'veraltet', 'literary': 'gehoben',
             'gehoben': 'gehoben', 'poetic': 'gehoben', 'humorous': 'scherzhaft', 'jocular': 'scherzhaft',
             'formal': 'gehoben', 'colloquial': 'umgangssprachlich', 'rare': 'selten'}
KEEP_RAW = {'veraltet': 'veraltet', 'veraltend': 'veraltend', 'archaisch': 'veraltet', 'gehoben': 'gehoben',
            'scherzhaft': 'scherzhaft', 'bildungsspr.': 'bildungssprachlich', 'bildungssprachlich': 'bildungssprachlich'}
BAD_GLOSS = re.compile(r'^(siehe|vgl|Synonym|Nebenform|Variante|alternative|veraltete? Schreib|Kurzform|kurz für|'
                       r'Abkürzung|Staatsbürger|Angehörige|Einwohner|Bewohner|weibliche|männliche Form|Femininum|'
                       r'Plural|Partizip|Konjunktiv|Imperativ|Diminutiv|Verkleinerung|Verb zu|Gegenwort|Gegenteil von|'
                       r'Oberbegriff|Bezeichnung für den Vornamen|Familienname|Vorname|Ortsteil|Ort in|Stadt in|'
                       r'Gemeinde|Dorf|Fluss|Berg)', re.I)
WORD_OK = re.compile(r'^[A-Za-zÄÖÜäöüß]{4,}$')

stats = Counter()
out = open('arbeit/kandidaten_roh.jsonl', 'w', encoding='utf-8')
seen = set()
with gzip.open('raw/raw-wiktextract-data.jsonl.gz', 'rt', encoding='utf-8') as f:
    for line in f:
        d = json.loads(line)
        if d.get('lang_code') != 'de': continue
        pos = POS.get(d.get('pos_title'))
        if not pos: continue
        stats['de_pos'] += 1
        w = d['word']
        if not WORD_OK.match(w): stats['wort_zeichen'] += 1; continue
        etags = set(d.get('tags', []))
        if etags & {'phrase', 'abbrev', 'abbreviation', 'form-of', 'alt-of', 'name', 'no-gloss'}: stats['etag'] += 1; continue
        if pos == 'noun' and not w[0].isupper(): stats['klein_nomen'] += 1; continue
        if pos != 'noun' and w[0].isupper(): stats['gross_nichtnomen'] += 1; continue
        cats = d.get('categories', [])
        if any('Eigenname' in c or 'Vorname' in c or 'Nachname' in c or 'Toponym' in c for c in cats if isinstance(c, str)):
            stats['eigenname'] += 1; continue
        senses = []
        for s in d.get('senses', []):
            if 'form_of' in s or 'alt_of' in s or not s.get('glosses'): continue
            senses.append(s)
        if not senses: stats['keine_glosse'] += 1; continue
        s0 = senses[0]
        g0 = s0['glosses'][0].strip()
        if len(g0) < 8 or BAD_GLOSS.match(g0): stats['bad_gloss'] += 1; continue
        stags = set(s0.get('tags', [])); raw = s0.get('raw_tags', [])
        if stags & BAD_TAGS: stats['bad_tag'] += 1; continue
        if any(any(b.lower() in r.lower() for b in BAD_RAW) for r in raw): stats['bad_raw'] += 1; continue
        # Wenn mehrere Bedeutungen: erste muss Hauptbedeutung sein -> max 4 Bedeutungen insgesamt
        if len(senses) > 4: stats['zu_viele_senses'] += 1; continue
        marks = sorted({KEEP_MARK[t] for t in stags if t in KEEP_MARK} | {KEEP_RAW[r] for r in raw if r in KEEP_RAW})
        key = (w, pos)
        if key in seen: stats['dublette_pos'] += 1; continue
        seen.add(key)
        forms = sorted({x['form'] for x in d.get('forms', []) if isinstance(x, dict) and WORD_OK.match(x.get('form', ''))} - {w})
        rec = {'word': w, 'pos': pos, 'glosses': s0['glosses'][:2], 'n_senses': len(senses),
               'other_glosses': [s['glosses'][0] for s in senses[1:3]],
               'tags': marks, 'raw_tags': raw, 'topics': s0.get('topics', []),
               'cats': [c for c in cats if isinstance(c, str) and c not in ('Deutsch',) and 'Wörterliste' not in c
                        and 'Anagramm' not in c and 'Audio' not in c and 'Endreim' not in c][:6],
               'forms': forms[:30]}
        out.write(json.dumps(rec, ensure_ascii=False) + '\n')
        stats['behalten'] += 1
out.close()
print(dict(stats))
