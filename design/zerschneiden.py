"""Zerschneidet die Raster aus design/roh/ in Masken für den Client.

    python design/zerschneiden.py

Aus schwarzer Tinte auf Weiß wird eine Alpha-Maske (schwarz = deckend, weiß = durchsichtig).
Alle Masken landen in EINEM Sprite (client/src/assets/icons.webp, ein Request, ~35 KB) plus
client/src/icons.gen.ts + icons.gen.css mit Namen und Positionen. Die Farbe kommt per CSS (mask-image + currentColor).
"""

import json
import math
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "roh"
CLIENT = ROOT.parent / "client" / "src"
SPRITE = CLIENT / "assets" / "icons.webp"
NAMES = CLIENT / "icons.gen.ts"
CSS = CLIENT / "icons.gen.css"

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

SIZE = 72          # Kantenlänge pro Motiv im Sprite (scharf bis ~28 CSS-px auf Retina)
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


def find(stem: str) -> Path | None:
    return next((p for p in (RAW / f"{stem}.png", RAW / f"{stem}.jpg") if p.exists()), None)


def cut(name: str) -> dict[str, Image.Image]:
    rows, cols, names = GRIDS[name]
    src = find(name)
    if not src:
        print(f"- {name}.png/.jpg fehlt, uebersprungen")
        return {}
    img = Image.open(src).convert("RGB")
    cw, ch = img.width / cols, img.height / rows
    masks = {}
    for i, label in enumerate(names):
        r, c = divmod(i, cols)
        # Einzelbild hat Vorrang, falls ein Motiv im Raster misslungen ist
        single = find(f"einzeln-{label}")
        cell = Image.open(single).convert("RGB") if single else img.crop(
            (round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
        mask = to_mask(cell)
        if mask is None:
            print(f"  ! {label}: leer")
            continue
        masks[label] = mask
    print(f"{name}: {len(masks)} Motive")
    return masks


def write_sprite(masks: dict[str, Image.Image]) -> None:
    names = list(masks)
    cols = math.ceil(math.sqrt(len(names)))
    rows = math.ceil(len(names) / cols)
    sheet = Image.new("RGBA", (cols * SIZE, rows * SIZE), (0, 0, 0, 0))
    for i, label in enumerate(names):
        cell = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        cell.putalpha(masks[label].getchannel("A"))
        sheet.paste(cell, ((i % cols) * SIZE, (i // cols) * SIZE))
    SPRITE.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(SPRITE, "WEBP", lossless=True, quality=100, method=6)
    NAMES.write_text(
        "// Generiert von design/zerschneiden.py – nicht von Hand ändern.\n"
        f"export const ICON_NAMES = {json.dumps(names)} as const;\n"
        "export type IconName = (typeof ICON_NAMES)[number];\n",
        encoding="utf-8",
        newline="\n",
    )
    # Position jedes Motivs im Sprite als CSS-Variable: .icon-<name> für Elemente,
    # --icon-<name> direkt nutzbar in Pseudo-Elementen (z. B. Unterstreichungen).
    pct = lambda i, n: f"{i * 100 / (n - 1):g}%" if n > 1 else "0%"
    lines = ["/* Generiert von design/zerschneiden.py – nicht von Hand ändern. */", ":root {",
             f"  --icon-sprite: url('./assets/icons.webp');",
             f"  --icon-sprite-size: {cols * 100}% {rows * 100}%;"]
    lines += [f"  --icon-{n}: {pct(i % cols, cols)} {pct(i // cols, rows)};" for i, n in enumerate(names)]
    lines += ["}", ""]
    lines += [f".icon-{n} {{ --icon-pos: var(--icon-{n}); }}" for n in names]
    CSS.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"Sprite {cols}x{rows}: {SPRITE.stat().st_size // 1024} KB -> {SPRITE.relative_to(ROOT.parent)}")


def write_favicons(mask: Image.Image) -> None:
    """Fragezeichen in Tinte auf einem schiefen gelben Post-it – Favicon und Homescreen-Icon."""
    public = ROOT.parent / "client" / "public"
    public.mkdir(parents=True, exist_ok=True)
    for size, name, square in ((64, "favicon.png", False), (180, "apple-touch-icon.png", True)):
        big = size * 4  # groß zeichnen, dann sauber verkleinern
        canvas = Image.new("RGBA", (big, big), (235, 227, 209, 255) if square else (0, 0, 0, 0))
        note = Image.new("RGBA", (int(big * 0.82), int(big * 0.82)), (255, 240, 122, 255))
        glyph = mask.getchannel("A").resize((int(note.width * 0.8), int(note.height * 0.8)), Image.LANCZOS)
        ink = Image.new("RGBA", glyph.size, (31, 42, 68, 255))
        note.paste(ink, ((note.width - glyph.width) // 2, (note.height - glyph.height) // 2), glyph)
        note = note.rotate(-6, resample=Image.BICUBIC, expand=True)
        canvas.alpha_composite(note, ((big - note.width) // 2, (big - note.height) // 2))
        canvas.resize((size, size), Image.LANCZOS).save(public / name, optimize=True)
    print("Favicons -> client/public/")


if __name__ == "__main__":
    all_masks: dict[str, Image.Image] = {}
    for grid in GRIDS:
        all_masks.update(cut(grid))
    if all_masks:
        write_sprite(all_masks)
    if "question" in all_masks:
        write_favicons(all_masks["question"])
