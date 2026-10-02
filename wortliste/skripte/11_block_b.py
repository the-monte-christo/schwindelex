import json, sys
n = int(sys.argv[1])
rows = [json.loads(l) for l in open('arbeit/kandidaten_poolb.jsonl', encoding='utf-8')]
blk = rows[(n - 1) * 300: n * 300]
for r in blk:
    t = ('|' + ','.join(r['tags'])) if r['tags'] else ''
    print(f"{r['word']} {r['pos'][0]}{t}: {r['glosses'][0][:62]}")
