import json, sys
n = int(sys.argv[1])
rows = [json.loads(l) for l in open('arbeit/kandidaten_selten.jsonl', encoding='utf-8')]
rows.sort(key=lambda r: r['word'].lower())
blk = rows[(n - 1) * 200: n * 200]
for r in blk:
    g = r['glosses'][0][:85]
    t = ('|' + ','.join(r['tags'])) if r['tags'] else ''
    print(f"{r['word']} {r['pos'][0]}{t}: {g}")
