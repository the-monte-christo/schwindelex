"""Zerschneidet die Raster aus design/roh/ in einzelne Masken-PNGs für den Client.

    python design/zerschneiden.py            # alle bekannten Raster
    python design/zerschneiden.py icons      # nur eines

Aus schwarzer Tinte auf Weiß wird eine Alpha-Maske (schwarz = deckend, weiß = durchsichtig).
Die Farbe kommt später per CSS (mask-image + currentColor). Kleine PNGs (< 4 KB) bettet Vite
direkt ein, es entstehen also keine zusätzlichen Requests.
"""

import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "roh"
OUT = ROOT.parent / "client" / "src" / "icons"

GRIDS = {
    "icons": (4, 4, [
        "crown", "check", "stopwatch", "hourglass",
        "trophy", "medal", "pencil", "eraser",
        "question", "bulb", "magnifier", "paperball",
        "share", "people", "exit", "plug",
    ]),
    "doodles": (3, 3, [
        "arrow", "underline", "circle",
        "star", "burst", "spiral",
        "sparkles", "scribble", "exclamation",
    ]),
}

SIZE = 96          # Kantenlänge der Ausgabe in px (reicht für 2× Retina bei 48 px)
PADDING = 0.06     # Rand um das Motiv, relativ zur Kantenlänge
PAPER = 40         # Helligkeit unter 255-PAPER gilt als Tinte (filtert Papierrauschen)
INK = 150          # ab hier voll deckend


def to_mask(cell: Image.Image) -> Image.Image | None:
    """Graustufen → Alpha: helles Papier durchsichtig, Tinte deckend, weiche Kanten bleiben."""
    gray = ImageOps.grayscale(cell)
    darkness = ImageOps.invert(gray)
    alpha = darkness.point(lambda d: 0 if d < PAPER else min(255, int((d - PAPER) * 255 / (INK - PAPER))))
    box = alpha.point(lambda a: 255 if a > 60 else 0).getbbox()
    if not box:
        return None
    alpha = alpha.crop(box)
    w, h = alpha.size
    inner = int(SIZE * (1 - 2 * PADDING))
    scale = inner / max(w, h)
    alpha = alpha.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("L", (SIZE, SIZE), 0)
    canvas.paste(alpha, ((SIZE - alpha.width) // 2, (SIZE - alpha.height) // 2))
    out = Image.new("LA", (SIZE, SIZE), 0)
    out.putalpha(canvas)
    return out


def cut(name: str) -> None:
    rows, cols, names = GRIDS[name]
    src = RAW / f"{name}.png"
    if not src.exists():
        print(f"– {src.name} fehlt, übersprungen")
        return
    img = Image.open(src).convert("RGB")
    cw, ch = img.width / cols, img.height / rows
    OUT.mkdir(parents=True, exist_ok=True)
    for i, label in enumerate(names):
        r, c = divmod(i, cols)
        # Einzelbild hat Vorrang, falls ein Motiv im Raster misslungen ist
        single = RAW / f"einzeln-{label}.png"
        cell = Image.open(single).convert("RGB") if single.exists() else img.crop(
            (round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
        mask = to_mask(cell)
        if mask is None:
            print(f"  ! {label}: leer")
            continue
        target = OUT / f"{label}.png"
        mask.save(target, optimize=True)
        print(f"  {label}: {target.stat().st_size} B")


if __name__ == "__main__":
    for grid in sys.argv[1:] or GRIDS:
        print(grid)
        cut(grid)
