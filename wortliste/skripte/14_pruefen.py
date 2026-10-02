import json, re, sys
from collections import Counter

E = json.load(open('arbeit/auswahl_roh.json', encoding='utf-8'))
out = []
def stems(w):
    lw = w.lower()
    s = {lw}
    for suf in ('en', 'n', 'e', 'ung', 'er', 'el'):
        if lw.endswith(suf) and len(lw) - len(suf) >= 4: s.add(lw[:-len(suf)])
    if len(lw) >= 6: s.add(lw[:5])
    if len(lw) >= 5: s.add(lw[:4])
    return s
issues = []
for e in E:
    d = e['definition']; ld = d.lower()
    if len(d) > 100: issues.append((e['word'], f'zu lang {len(d)}'))
    if re.search(r'[;()\[\]]', d): issues.append((e['word'], 'Sonderzeichen'))
    if re.search(r'\b(jmd|jmdn|etw|bzw|usw|z\. ?B|ugs|veraltet|gehoben|bildungssprachlich)\b\.?', ld): issues.append((e['word'], 'Lexikonstil'))
    if d.endswith('.'): issues.append((e['word'], 'Punkt am Ende'))
    for s in sorted(stems(e['word']), key=len, reverse=True):
        # nur längere Stämme (>=4) prüfen, Treffer = Stamm kommt in Definition vor
        if len(s) >= 4 and s in ld:
            issues.append((e['word'], f'Stamm "{s}" in Definition')); break
for w, m in issues: print(w, m)
print('Hinweise:', len(issues))
