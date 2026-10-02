import json, sys
rows = {}
for f in ['arbeit/kandidaten_selten.jsonl', 'arbeit/kandidaten_poolb.jsonl']:
    for l in open(f, encoding='utf-8'):
        d = json.loads(l); rows[d['word']] = d
E = json.load(open('arbeit/auswahl_roh.json', encoding='utf-8'))
a, b = int(sys.argv[1]), int(sys.argv[2])
for e in E[a:b]:
    g = rows[e['word']]['glosses'][0][:110]
    print(f"{e['word']}\n   MEINE: {e['definition']}\n   WIKT : {g}")
