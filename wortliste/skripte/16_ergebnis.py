import json, re
from collections import Counter

E = json.load(open('arbeit/auswahl_roh.json', encoding='utf-8'))
test = json.load(open('../data/words.test.json', encoding='utf-8'))
testwords = {w['word'].lower() for w in test['words']}
E.sort(key=lambda e: e['word'].lower())

words = []
for i, e in enumerate(E, 1):
    words.append({'id': f'w{i:03d}', 'word': e['word'], 'pos': e['pos'], 'definition': e['definition'],
                  'tags': e['tags'], 'domain': e['domain']})
data = {'version': 1,
        'source': 'Wiktionary (CC BY-SA 4.0), Seltenheit: Leipzig Corpora Collection (CC BY 4.0)',
        'words': words}
with open('ergebnis/words.json', 'w', encoding='utf-8', newline='\n') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write('\n')

with open('ergebnis/streichliste.txt', 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(w['word'] for w in words) + '\n')

# Prüfung (nur Zahlen)
n = len(words)
pos = Counter(w['pos'] for w in words)
alt = sum(1 for w in words if any(t in ('veraltet', 'veraltend') for t in w['tags']))
maxlen = max(len(w['definition']) for w in words)
dom = Counter(w['domain'] for w in words)
fam = []
lw = sorted(w['word'].lower() for w in words)
for i in range(len(lw)):
    for j in range(i + 1, len(lw)):
        a, b = lw[i], lw[j]
        if len(a) >= 5 and len(b) >= 5 and (a[:5] == b[:5] or a in b or b in a): fam.append((a, b))
issues = []
for w in words:
    d = w['definition']
    if len(d) > 100: issues.append(f"{w['id']}: zu lang")
    if re.search(r'[;()\[\]]', d): issues.append(f"{w['id']}: Sonderzeichen")
    if w['word'].lower() in testwords: issues.append(f"{w['id']}: Testwort")
dups = [k for k, v in Counter(w['word'] for w in words).items() if v > 1]
lines = ['# Prüfung (Zahlen)', '',
         f'- Wörter: {n}', f'- Wortarten: noun {pos["noun"]} ({pos["noun"]*100//n} %), verb {pos["verb"]}, adj {pos["adj"]}',
         f'- veraltet/veraltend: {alt} ({alt*100//n} %)', f'- längste Definition: {maxlen} Zeichen (Limit 100)',
         f'- größtes Themengebiet: {max(dom.values())} Wörter (Limit 15)',
         f'- Dubletten: {len(dups)}', f'- Testwörter enthalten: {sum(1 for i in issues if "Testwort" in i)}',
         f'- Formale Auffälligkeiten (Länge/Sonderzeichen): {len([i for i in issues if "Testwort" not in i])}',
         f'- Mögliche Wortfamilien-Paare (Heuristik, manuell geprüft): {len(fam)}']
open('arbeit/pruefung.md', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
print(fam)
print(issues, dups)
