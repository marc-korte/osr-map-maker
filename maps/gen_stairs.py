#!/usr/bin/env python3
"""
gen_stairs.py  -  a tapered straight-flight stair glyph in the old-school style.

Treads run perpendicular to travel. The "up" end (where you stand on this level)
has long, heavy treads; they shorten as the flight descends and fade to dots at
the "down" end, giving the classic receding-into-the-floor look. Default travel
is along +X with the long (up) end on the LEFT.  -> icons/dungeon/StairsFlight1x1.png
"""
import os
from PIL import Image, ImageDraw

SS = 4
N = 300                                   # 1x1 cell, design px
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "icons", "dungeon", "StairsFlight1x1.png")
BLK = (12, 12, 16, 255)


def main():
    img = Image.new("RGBA", (N * SS, N * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = lambda v: v * SS

    def line(x0, y0, x1, y1, w):
        d.line([s(x0), s(y0), s(x1), s(y1)], fill=BLK, width=max(1, int(round(w * SS))))

    def dot(x, y, r):
        d.ellipse([s(x - r), s(y - r), s(x + r), s(y + r)], fill=BLK)

    cy = N / 2
    x0 = 46                                # flight runs left(up) -> right(down)
    nbar = 9                               # bold solid treads, perspective taper (no faint dots)
    gap = 24
    for i in range(nbar):
        t = i / (nbar - 1)                 # 0 at up end, 1 at down end
        x = x0 + i * gap
        half = 112 * (1 - 0.58 * t)        # still substantial at the down end (~47%)
        w = 16.0 * (1 - 0.40 * t)          # bold: ~16 px (up) -> ~10 px (down), matches the other glyphs
        line(x, cy - half, x, cy + half, w)

    out = img.resize((N, N), Image.LANCZOS)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out.save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
