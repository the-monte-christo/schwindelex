# Bild-Prompts für Schwindelex

So werden die Bilder verwendet: Ich zerschneide die Raster automatisch und mache aus jeder schwarzen Linie
eine **Maske**. Die Farbe kommt danach per CSS – tintenblau auf Papier, kreideweiß auf der Tafel
(Dark Mode). Deshalb wichtig:

- **nur schwarze Tinte auf reinweißem Hintergrund**, keine Farbe, keine Grauflächen, keine Schatten
- **exakt das Raster** (4×4 bzw. 3×3), jedes Motiv mittig in seiner Zelle mit viel Rand,
  nichts ragt in die Nachbarzelle, **keine Rasterlinien**, **keine Schrift**
- quadratisch, möglichst groß (2048×2048, mindestens 1024×1024), PNG

Ablage: fertige Bilder nach `design/roh/` legen (wird nicht committet), mit den Dateinamen unten.
Wenn ein einzelnes Motiv misslingt, reicht ein Einzelbild davon nach (`design/roh/einzeln-<name>.png`).

---

## 1. Icons – `icons.png` (4×4, wichtigste Datei)

> A 4×4 grid of 16 hand-drawn doodle icons, black fineliner ink on a pure white background (#FFFFFF).
> Each icon sits centered in its own invisible square cell with generous empty margin around it
> (at least 20% of the cell on every side); no icon touches or crosses into a neighboring cell.
> Consistent line weight like a 0.5 mm fineliner, slightly wobbly, imperfect hand-drawn lines,
> simple and friendly, open line art. Only outlines and a few strokes, no filled areas, no gray,
> no shading, no hatching, no color, no shadows, no grid lines, no frames, no text, no letters,
> no numbers. Flat, front view, white paper look but completely uniform white background.
> Row 1: a crown, a check mark, a stopwatch, an hourglass.
> Row 2: a trophy cup, a round medal with ribbon, a pencil, an eraser.
> Row 3: a question mark drawn as a symbol, a light bulb, a magnifying glass, a crumpled paper ball.
> Row 4: a curved share arrow leaving a box, three simple stick-figure heads side by side,
> an open door with an arrow pointing out, an unplugged power plug with a cable.

Verwendung: Host (Krone), fertig/bereit (Haken), Countdown (Stoppuhr), Sortieren (Sanduhr),
Sieger/Platz 2–3 (Pokal, Medaille), Schreiben/Löschen (Stift, Radiergummi), Tippen (Fragezeichen),
richtig (Glühbirne), Einladen/Teilen, Mitspieler, Verlassen, offline (Stecker).

## 2. Kritzeleien – `doodles.png` (3×3)

> A 3×3 grid of 9 hand-drawn decorative doodles, black fineliner ink on a pure white background (#FFFFFF).
> Each doodle centered in its own invisible square cell with generous empty margin; nothing crosses
> into a neighboring cell. Slightly wobbly, energetic hand-drawn lines, consistent line weight,
> open line art, no filled areas, no gray, no shading, no color, no shadows, no grid lines, no text.
> Row 1: a curved arrow swooping down to the right, a wavy underline stroke, a loose scribbled circle
> (like circling something on paper).
> Row 2: a five-pointed star, a comic burst / explosion outline, a spiral.
> Row 3: three small sparkles, a zigzag scribble crossing something out, a big exclamation mark.

Verwendung: Verzierungen an Überschriften, Unterstreichungen, Einkreisen der richtigen Antwort,
Effekte bei Punkten und Siegerehrung.

## 3. Logo (optional) – `logo.png`

Nur falls dir die jetzige Schrift-Variante nicht reicht. Bildgeneratoren verhauen gern Buchstaben –
bitte genau prüfen, dass „Schwindelex“ richtig geschrieben ist.

> The single word "Schwindelex" hand-lettered with a black fineliner on a pure white background,
> playful but very legible handwriting, slightly bouncy baseline, the final letter "x" drawn bigger and
> slightly rotated as if scribbled on top. Black ink only, no color, no gray, no shadows, no other
> text or decoration, centered with wide empty margin, landscape format 2048×1024.

## 4. Texturen (optional) – `papier.png`, `tafel.png`

Aktuell erzeuge ich die Körnung per CSS (0 KB). Echte Texturen sehen etwas lebendiger aus, kosten aber
pro Bild ca. 30–60 KB. Nur wenn es dir gefällt:

> Seamless tileable texture of off-white recycled drawing paper with subtle fibers and very soft
> grain, evenly lit, no folds, no stains, no objects, no vignette, flat top-down scan, 1024×1024.

> Seamless tileable texture of a dark green-gray school chalkboard with faint, smudged chalk dust
> and old wiped-away traces, evenly lit, no writing, no frame, no objects, no vignette, flat top-down,
> 1024×1024.
