"""Macht aus den Rohtexturen (design/roh/paper.jpg, board.jpg) nahtlos kachelbare WebP-Kacheln.

    python design/texturen.py

Schritte je Textur:
1. großflächige Helligkeitsunterschiede teilweise herausrechnen (sonst erkennt man das Kachelmuster)
2. nahtlos machen: Bild mit seiner um die halbe Breite/Höhe verschobenen Kopie überblenden –
   am Rand zählt die verschobene Kopie (deren Ränder passen zusammen), in der Mitte das Original
3. auf einen Zielton einfärben/abdunkeln, Kontrast der Struktur einstellen
4. verkleinern und als WebP speichern (client/src/assets/)
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "roh"
OUT = ROOT.parent / "client" / "src" / "assets"

TILE = 1024  # Kachelgröße in px; im CSS mit halber Größe angezeigt (≈ 2× Dichte)

# Zielton (mittlere Farbe) und Stärke der Struktur relativ zum Original
TEXTURES = {
    "paper": {"target": (236, 228, 210), "contrast": 1.0, "flatten": 0.8, "quality": 72},
    "board": {"target": (41, 51, 46), "contrast": 1.0, "flatten": 0.6, "quality": 70, "dark_limit": 14},
}


def seamless(a: np.ndarray) -> np.ndarray:
    h, w = a.shape[:2]
    b = np.roll(a, (h // 2, w // 2), axis=(0, 1))
    # Gewicht: 0 am Rand (→ verschobene Kopie, kachelt), 1 in der Mitte (→ Original, verdeckt deren Naht)
    ramp = lambda n: np.sin(np.linspace(0, np.pi, n)) ** 0.8
    weight = np.outer(ramp(h), ramp(w))[..., None]
    return a * weight + b * (1 - weight)


def build(name: str, target: tuple[int, int, int], contrast: float, flatten: float, quality: int, dark_limit: float = 255) -> None:
    src = next((p for p in (RAW / f"{name}.jpg", RAW / f"{name}.png") if p.exists()), None)
    if not src:
        print(f"- {name}: Rohbild fehlt")
        return
    img = Image.open(src).convert("RGB")
    a = np.asarray(img, dtype=np.float64)

    low = np.asarray(img.filter(ImageFilter.GaussianBlur(img.width / 12)), dtype=np.float64)
    a = a - flatten * (low - low.mean(axis=(0, 1)))

    a = seamless(a)

    mean = a.mean(axis=(0, 1))
    a = (a - mean) * contrast
    # sehr dunkle Flecken stechen beim Kacheln als Muster heraus → Ausreißer nach unten dämpfen
    floor = -dark_limit
    a = np.where(a < floor, floor + (a - floor) * 0.3, a)
    a = a + np.array(target, dtype=np.float64)

    tile = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((TILE, TILE), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    target_path = OUT / f"{name}.webp"
    tile.save(target_path, "WEBP", quality=quality, method=6)
    avg = tuple(int(v) for v in np.asarray(tile).reshape(-1, 3).mean(axis=0))
    print(f"{name}: {target_path.stat().st_size // 1024} KB, Mittelwert rgb{avg}")


if __name__ == "__main__":
    for texture, options in TEXTURES.items():
        build(texture, **options)
