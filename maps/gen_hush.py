#!/usr/bin/env python3
"""
gen_hush.py  -  the Hush wilderness as a pointy-top hex map in the X1 tradition.

Forest dominates; mountains hold the Lampbearer; a ring of blighted hexes
surrounds the Wreath at the heart of the wood. Keyed sites H-1..H-6, Quelling
and the Wreath are marked, joined by the salvage road. Output: hush_map.png
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import osrmaps as T
from osrmaps import L, PL, POLY, ELL, RECT, text, text_halo, keynum, INK, PAPER, GRIDLINE, GREY

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hush_map.png")
WPX, HPX = 1500, 1980

COLS, ROWS = 9, 12
SIZE = 72.0
HEXW = math.sqrt(3) * SIZE
OX, OY = 165, 250


def hcenter(c, r):
    return OX + HEXW * (c + 0.5 * (r & 1)), OY + 1.5 * SIZE * r


def hcorners(cx, cy):
    return [(cx + SIZE * math.cos(math.radians(60 * i - 30)),
             cy + SIZE * math.sin(math.radians(60 * i - 30))) for i in range(6)]


SITES = {
    (1, 10): ("Q", "QUELLING"),
    (2, 9):  ("1", "Hush Road"),
    (3, 8):  ("2", "Empty Steading"),
    (5, 7):  ("3", "Goblin Warren"),
    (2, 5):  ("4", "The Lampbearer"),
    (5, 5):  ("5", "Coldwick's Tree"),
    (4, 2):  ("6", "Petrified Glade"),
    (4, 4):  ("*", "THE WREATH"),
}
WREATH = (4, 4)
MOUNTAIN = {(0, r) for r in range(2, 9)} | {(1, r) for r in range(3, 8)} | {(2, 5), (1, 8), (3, 3)}
ROAD = [(1, 10), (2, 9), (3, 8), (4, 6), (4, 4)]
PATHS = [[(3, 8), (3, 6), (2, 5)], [(5, 7), (5, 5), (4, 4)], [(4, 4), (4, 2)]]


def main():
    img, d = T.new_paper(WPX, HPX)
    T.frame(d, WPX, HPX)

    wx, wy = hcenter(*WREATH)
    cen = {(c, r): hcenter(c, r) for r in range(ROWS) for c in range(COLS)}
    blight = {k for k, (x, y) in cen.items()
              if math.hypot(x - wx, y - wy) < HEXW * 1.55 and k != WREATH}

    for k, (cx, cy) in cen.items():
        corners = hcorners(cx, cy)
        if k in blight:
            POLY(d, corners, fill=GREY, outline=None)
        POLY(d, corners, outline=GRIDLINE, w=0.8)

    for k, (cx, cy) in cen.items():
        if k in SITES:
            continue
        random.seed(k[0] * 97 + k[1] * 13)
        (blight_hex(d, cx, cy) if k in blight else
         mountain_hex(d, cx, cy) if k in MOUNTAIN else forest_hex(d, cx, cy))

    route(d, [cen[h] for h in ROAD], (15, 9), 2.6)
    for p in PATHS:
        route(d, [cen[h] for h in p], (5, 8), 1.5)

    for k, (key, name) in SITES.items():
        cx, cy = cen[k]
        if key == "Q":
            town(d, cx, cy); text_halo(d, cx, cy + 50, name, "num", 14)
        elif key == "*":
            wreath_icon(d, cx, cy); text_halo(d, cx, cy + 56, name, "num", 14)
        else:
            keynum(d, cx, cy, key); text_halo(d, cx, cy + 36, name, "italic", 14)

    T.cartouche(d, WPX / 2, 64, "THE HUSH", "the wood between Quelling and the Wreath", w=640)
    T.north_arrow(d, WPX - 118, 300)
    T.scale_bar(d, 175, HPX - 150, HEXW, 5, "0      1      2      3      4      5 miles   (1 hex ≈ 1 mile)")
    legend(d, WPX - 432, HPX - 486)

    T.finish(img, WPX, HPX, OUT)
    print("wrote", OUT)


# ---- terrain symbols (X1 style: one clean glyph per hex) ----

def forest_hex(d, cx, cy):
    tree(d, cx, cy - 2, 40)


def tree(d, x, y, h):
    w = h * 0.46
    for k in (0, 1, 2):                       # three-tier fir, single per hex
        top = y - h / 2 + k * h * 0.25
        POLY(d, [(x, top), (x - w * (1 - k * .2), top + h * .42), (x + w * (1 - k * .2), top + h * .42)],
             outline=INK, w=1.1)
    L(d, x, y + h * .33, x, y + h * .5, w=1.6)


def mountain_hex(d, cx, cy):
    mtri(d, cx - 15, cy + 7, 42)              # a little range of solid peaks
    mtri(d, cx + 17, cy + 2, 54)


def mtri(d, x, y, h):
    w = h * 0.6
    POLY(d, [(x - w, y + h / 2), (x, y - h / 2), (x + w, y + h / 2)], fill=INK, outline=INK)
    PL(d, [(x - w * .24, y - h * .14), (x - w * .06, y - h * .3),
           (x + w * .06, y - h * .14), (x + w * .22, y - h * .28)], w=1.1, fill=PAPER)


def blight_hex(d, cx, cy):
    deadtree(d, cx, cy, 36)                    # one forked dead tree marks the zone


def deadtree(d, x, y, h):
    L(d, x, y + h / 2, x, y - h / 2, w=1.5)
    for k in range(4):
        yy = y - h / 2 + h * (0.16 + 0.2 * k)
        sgn = -1 if k % 2 else 1
        L(d, x, yy, x + sgn * h * .36, yy - h * .2, w=1.2)


# ---- site icons ----

def town(d, cx, cy):
    rx, ry = SIZE * .6, SIZE * .42
    ELL(d, cx, cy, rx, ry, outline=INK, w=2.2)
    random.seed(7)
    for _ in range(7):
        b = random.uniform(8, 13)
        x = cx + random.uniform(-rx * .6, rx * .6); y = cy + random.uniform(-ry * .5, ry * .5)
        RECT(d, x - b / 2, y - b / 2, x + b / 2, y + b / 2, fill=INK, outline=None)


def wreath_icon(d, cx, cy):
    R = SIZE * .6
    ELL(d, cx, cy, R, outline=INK, w=3.4)
    ELL(d, cx, cy, R * .74, outline=INK, w=1.4)
    star(d, cx, cy, R * .42)


def star(d, cx, cy, r):
    pts = [(cx + (r if i % 2 == 0 else r * .4) * math.cos(math.radians(45 * i - 90)),
            cy + (r if i % 2 == 0 else r * .4) * math.sin(math.radians(45 * i - 90))) for i in range(8)]
    POLY(d, pts, fill=INK, outline=None)


def route(d, pts, dash, w):
    on, off = dash
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        seg = math.hypot(x1 - x0, y1 - y0); ux, uy = (x1 - x0) / seg, (y1 - y0) / seg
        t = 0.0
        while t < seg:
            a, b = t, min(t + on, seg)
            L(d, x0 + ux * a, y0 + uy * a, x0 + ux * b, y0 + uy * b, w=w)
            t += on + off


def legend(d, x, y):
    w, h = 408, 460
    RECT(d, x, y, x + w, y + h, fill=PAPER, w=2.0)
    RECT(d, x + 5, y + 5, x + w - 5, y + h - 5, w=1.0)
    text(d, x + w / 2, y + 34, "LEGEND", "title", 19, anchor="mm", track=3)
    ix, tx, yy, step = x + 50, x + 96, y + 86, 58
    rows = [("forest", lambda px, py: tree(d, px, py, 34)),
            ("mountains", lambda px, py: mtri(d, px, py, 40)),
            ("the Blight (dead ground)", lambda px, py: deadtree(d, px, py, 32)),
            ("Quelling", lambda px, py: town_icon(d, px, py)),
            ("the Wreath", lambda px, py: small_wreath(d, px, py)),
            ("keyed site", lambda px, py: keynum(d, px, py, "#")),
            ("salvage road", lambda px, py: L(d, px - 22, py, px + 22, py, w=2.6))]
    for name, icon in rows:
        icon(ix, yy)
        text(d, tx, yy, name, "label", 17, anchor="lm")
        yy += step


def town_icon(d, x, y):
    ELL(d, x, y, 26, 15, outline=INK, w=1.8)
    for dx in (-12, 0, 12):
        RECT(d, x + dx - 4, y - 4, x + dx + 4, y + 4, fill=INK, outline=None)


def small_wreath(d, x, y):
    ELL(d, x, y, 22, outline=INK, w=2.6)
    star(d, x, y, 11)


if __name__ == "__main__":
    main()
