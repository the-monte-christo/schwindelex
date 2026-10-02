"""Schritt 8: Streichungen anwenden.
Behält in ergebnis/words.json nur Wörter, die noch in ergebnis/streichliste.txt stehen,
vergibt IDs neu und meldet nur Anzahlen (vorher/nachher)."""
import json

with open('ergebnis/streichliste.txt', encoding='utf-8') as f:
    keep = {line.strip() for line in f if line.strip()}
with open('ergebnis/words.json', encoding='utf-8') as f:
    data = json.load(f)

vorher = len(data['words'])
words = [w for w in data['words'] if w['word'] in keep]
for i, w in enumerate(words, 1):
    w['id'] = f'w{i:03d}'
data['words'] = words
with open('ergebnis/words.json', 'w', encoding='utf-8', newline='\n') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(f'vorher: {vorher}, nachher: {len(words)}')
