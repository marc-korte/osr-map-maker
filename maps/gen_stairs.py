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
    x0, x1 = 36, 264                       # flight runs left(up) -> right(down)
    nbar = 7                               # solid treads
    for i in range(nbar):
        t = i / (nbar - 1)                 # 0 at up end, 1 toward down end
        x = x0 + (x1 - x0) * 0.0 + i * 22
        half = 104 * (1 - 0.74 * t)        # tread half-length, tapers
        w = 7.0 * (1 - 0.55 * t)           # heavier at the up end
        line(x, cy - half, x, cy + half, w)
    # the down end fades to dots: three short columns, fewer dots each
    dx = x0 + nbar * 22 + 8
    for j, cnt in enumerate((3, 2, 1)):
        x = dx + j * 18
        sp = 14
        for k in range(cnt):
            yy = cy + (k - (cnt - 1) / 2) * sp
            dot(x, yy, 3.4 * (1 - 0.18 * j))

    out = img.resize((N, N), Image.LANCZOS)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out.save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
