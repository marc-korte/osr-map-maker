#!/usr/bin/env python3
"""
gen_wreath.py  -  the Wreath dungeon, B/X style: black ink on white, rooms cut
as white space out of solid black rock, the canonical OSR symbol set, a symbol
legend, and a 10-ft grid on the floors. Two levels: the ring (Upper) and the
precursor underworks (Lower). Output: wreath_map.png
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import osrmaps as T
from osrmaps import (L, PL, POLY, ELL, RECT, text, text_halo, keynum, door, grid_in,
                     hatch_fill, carve, sym_stairs, sym_secret, sym_pit, sym_pillars,
                     sym_dais, water, legend_box, INK, PAPER, GRIDLINE, GREY)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wreath_map.png")
WPX, HPX = 1500, 1980
CELL = 26


def disc(d, cx, cy, r, fill):
    d.ellipse([T.s(cx - r), T.s(cy - r), T.s(cx + r), T.s(cy + r)], fill=fill)


def wedge(d, cx, cy, r, a0, a1, fill):
    d.pieslice([T.s(cx - r), T.s(cy - r), T.s(cx + r), T.s(cy + r)], a0, a1, fill=fill)


def pol(cx, cy, r, a):
    return cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))


# stamp the imported classic PNG icons (same set the Map Maker uses)
def idoor(x, y):   T.stamp('dungeon', 'Door1x1', x, y, CELL * 1.05)
def isecret(x, y): T.stamp('dungeon', 'DoorSecret1x1', x, y, CELL * 1.25)
def istairs(x, y, box=CELL * 2.1): T.stamp('dungeon', 'Stairs1x1_01', x, y, box)
def ipit(x, y):    T.stamp('dungeon', 'PitCircle1x1', x, y, CELL * 1.05)


def main():
    img, d = T.new_paper(WPX, HPX)
    T.frame(d, WPX, HPX)
    T.cartouche(d, WPX / 2, 52, "THE WREATH", "the ring in the heart of the Hush", w=620)

    upper(d, 760, 566)
    lower(d, 150, 1070, 1206, 770)
    symbol_legend(d, 66, 432)

    T.north_arrow(d, WPX - 112, 232)
    T.scale_bar(d, 175, HPX - 70, CELL * 2, 8, "0        20        40        60        80 ft   (1 square = 10 ft)")
    T.finish(img, WPX, HPX, OUT)
    print("wrote", OUT)


# ============ UPPER LEVEL: the ring ============

def upper(d, cx, cy):
    R_out, R_wall_in, R_gal_in, R_in_in = 372, 346, 250, 224

    disc(d, cx, cy, R_out, INK)          # solid footprint
    disc(d, cx, cy, R_wall_in, PAPER)    # gallery + interior -> white floor
    disc(d, cx, cy, R_gal_in, INK)       # inner wall solid
    disc(d, cx, cy, R_in_in, PAPER)      # courtyard white floor

    # 10-ft grid on the floors, then redraw the wall bands to mask grid off rock
    bb = (cx - R_out, cy - R_out, cx + R_out, cy + R_out)
    grid_ring(d, *bb)
    ELL(d, cx, cy, (R_out + R_wall_in) / 2, outline=INK, w=R_out - R_wall_in + 2)
    ELL(d, cx, cy, (R_gal_in + R_in_in) / 2, outline=INK, w=R_gal_in - R_in_in + 2)

    # iris entry: doorless gap in the outer wall at 12 o'clock
    wedge(d, cx, cy, R_out + 3, 257, 283, PAPER)
    for a in range(259, 282, 5):
        L(d, *pol(cx, cy, R_gal_in, a), *pol(cx, cy, R_out, a), w=1.2)
    text_halo(d, cx, cy - R_out - 26, "iris entry  (opens only in silence)", "italic", 14)

    # doorways gallery -> courtyard
    for a in (90, 208, 332):
        wedge(d, cx, cy, R_gal_in + 3, a - 5, a + 5, PAPER)
        idoor(*pol(cx, cy, (R_gal_in + R_in_in) / 2, a))

    # W-3 the Rejected: cells subdividing the gallery arc (right)
    for a in (8, 36, 64):
        L(d, *pol(cx, cy, R_gal_in, a), *pol(cx, cy, R_wall_in, a), w=2.4)
    for a in (22, 50):
        idoor(*pol(cx, cy, R_gal_in - 1, a))
    isecret(*pol(cx, cy, (R_gal_in + R_wall_in) / 2, 50))   # a secret door in the cells
    text_halo(d, *pol(cx, cy, (R_gal_in + R_wall_in) / 2, 36), "W-3", "num", 13)

    # W-4 wet crawl: organic tunnel breaching the wall (lower left)
    crawl(d, cx, cy, R_out, R_gal_in, 156)
    text_halo(d, *pol(cx, cy, R_out + 78, 162), "W-4 wet crawl", "italic", 13)

    # W-5 stairs down (lower-right gallery)
    sx, sy = pol(cx, cy, (R_gal_in + R_wall_in) / 2, 116)
    istairs(sx, sy)
    text_halo(d, sx, sy + 36, "W-5  to Lower Level", "italic", 13)

    # W-2 courtyard: kneeling corpses + tubes + dais + the white crystal tree
    for a in range(0, 360, 30):
        fx, fy = pol(cx, cy, 150, a)
        ELL(d, fx, fy, 5, fill=INK, outline=INK)
        L(d, fx, fy, *pol(cx, cy, 66, a), w=0.8, fill=GREY)
    sym_dais(d, cx, cy, 58)
    crystal_tree(d, cx, cy)

    # markers
    keynum(d, *pol(cx, cy, (R_out + R_gal_in) / 2, 270), "1")
    text_halo(d, cx, cy - 300, "W-1 Ring-Walk", "italic", 14)
    text_halo(d, cx, cy + 86, "W-2 the White Tree", "num", 14)
    for a in (250, 290):
        sentry(d, *pol(cx, cy, (R_out + R_gal_in) / 2, a))


def grid_ring(d, x0, y0, x1, y1):
    x = (x0 // CELL) * CELL
    while x <= x1:
        L(d, x, y0, x, y1, w=0.5, fill=GRIDLINE); x += CELL
    y = (y0 // CELL) * CELL
    while y <= y1:
        L(d, x0, y, x1, y, w=0.5, fill=GRIDLINE); y += CELL


def crystal_tree(d, cx, cy):
    for a in range(0, 360, 45):
        L(d, cx, cy, *pol(cx, cy, 44 if a % 90 == 0 else 28, a - 90), w=2.0)
    pts = [pol(cx, cy, 30 if i % 2 == 0 else 12, 45 * i - 90) for i in range(8)]
    POLY(d, pts, fill=PAPER, outline=INK, w=2.0)
    ELL(d, cx, cy, 7, fill=INK, outline=INK)


def sentry(d, x, y):
    ELL(d, x, y, 7, outline=INK, w=1.5)
    L(d, x, y + 7, x, y + 16, w=1.3)


def crawl(d, cx, cy, r_out, r_in, ang):
    n = 7
    pts = [pol(cx, cy, (r_out + 46) - (r_out + 46 - r_in) * i / n, ang + 9 * math.sin(i * 1.7))
           for i in range(n + 1)]
    PL(d, pts, w=2.0)
    PL(d, [(x + 13, y + 4) for x, y in pts], w=2.0)
    for x, y in pts[1:-1:2]:
        L(d, x - 4, y - 4, x + 4, y + 4, w=1.0)


# ============ LOWER LEVEL: the precursor underworks ============

def lower(d, x0, y0, w, h):
    T.cartouche(d, x0 + w / 2, y0 - 4, "DEEP WREATH  -  LOWER LEVEL", w=520)
    bx0, by0, bx1, by1 = x0, y0 + 58, x0 + w, y0 + h
    RECT(d, bx0, by0, bx1, by1, fill=PAPER, outline=None)   # white base
    hatch_fill(d, bx0, by0, bx1, by1)                        # rock = diagonal hatch

    R = {  # name: (x0, y0, x1, y1)
        "land": (x0 + 470, by0 + 14, x0 + 600, by0 + 84),
        "A":    (x0 + 40,  by0 + 150, x0 + 250, by0 + 500),
        "B":    (x0 + 372, by0 + 150, x0 + 642, by0 + 330),
        "C":    (x0 + 760, by0 + 150, x0 + 952, by0 + 312),
        "D":    (x0 + 372, by0 + 440, x0 + 612, by0 + 650),
        "E":    (x0 + 740, by0 + 430, x0 + 1150, by0 + 668),
    }
    corrs = [(x0 + 520, by0 + 84, x0 + 552, by0 + 150),
             (x0 + 250, by0 + 250, x0 + 372, by0 + 282),
             (x0 + 642, by0 + 214, x0 + 760, by0 + 246),
             (x0 + 478, by0 + 330, x0 + 510, by0 + 440),
             (x0 + 612, by0 + 528, x0 + 740, by0 + 560),
             (x0 + 845, by0 + 312, x0 + 845, by0 + 430)]
    for r in R.values():                       # rooms: white floor + black wall
        carve(d, *r, outline=True)
    for c in corrs:                            # corridors punch openings through walls
        carve(d, *c)
    for r in R.values():
        grid_in(d, *r, CELL)
    for c in corrs:
        grid_in(d, *c, CELL)
    RECT(d, bx0, by0, bx1, by1, outline=INK, w=2.2)         # level border

    # doors at room mouths
    idoor(x0 + 536, by0 + 150);  idoor(x0 + 250, by0 + 266)
    idoor(x0 + 642, by0 + 230);  idoor(x0 + 494, by0 + 440)
    idoor(x0 + 740, by0 + 544);  idoor(x0 + 845, by0 + 430)

    # stair up landing
    lr = R["land"]; istairs((lr[0] + lr[2]) / 2, (lr[1] + lr[3]) / 2, CELL * 2.6)
    text_halo(d, (lr[0] + lr[2]) / 2, lr[3] - 12, "from W-5", "italic", 12)

    # A Cold Gallery: ghost-cells + a secret door
    a = R["A"]
    for i in range(4):
        yy = a[1] + 36 + i * 76
        L(d, a[0], yy, a[0] + 60, yy, w=1.4); L(d, a[0] + 60, yy, a[0] + 60, yy + 56, w=1.4)
        L(d, a[0], yy + 56, a[0] + 60, yy + 56, w=1.4)
    isecret(a[2], a[1] + 180)
    keynum(d, a[0] + 22, a[1] + 22, "A"); text_halo(d, (a[0] + a[2]) / 2, a[3] - 16, "Cold Gallery", "num", 13)

    # B Drone Bay: racks + a pit
    b = R["B"]
    for i in range(3):
        rx = b[0] + 30 + i * 86
        RECT(d, rx, b[1] + 44, rx + 50, b[1] + 134, w=1.5)
    ipit(b[2] - 40, b[3] - 36)
    keynum(d, b[0] + 22, b[1] + 22, "B"); text_halo(d, (b[0] + b[2]) / 2, b[3] - 16, "Drone Bay", "num", 13)

    # C Governor: the spinning top
    c = R["C"]; gear(d, (c[0] + c[2]) / 2, (c[1] + c[3]) / 2 + 8)
    keynum(d, c[0] + 22, c[1] + 22, "C"); text_halo(d, (c[0] + c[2]) / 2, c[3] - 16, "Governor", "num", 13)

    # D Coolant Sump: a pool
    dd = R["D"]
    water(d, [(dd[0] + 26, dd[1] + 46), (dd[2] - 26, dd[1] + 34), (dd[2] - 18, dd[3] - 30), (dd[0] + 30, dd[3] - 24)])
    keynum(d, dd[0] + 22, dd[1] + 22, "D"); text_halo(d, (dd[0] + dd[2]) / 2, dd[3] - 16, "Coolant Sump", "num", 13)

    # E Operator's Hall: pillars + dais + Ovell
    e = R["E"]; cxh, cyh = (e[0] + e[2]) / 2, (e[1] + e[3]) / 2
    sym_pillars(d, [(e[0] + 70, e[1] + 60), (e[0] + 70, e[3] - 60), (e[2] - 70, e[1] + 60), (e[2] - 70, e[3] - 60)])
    sym_dais(d, cxh + 110, cyh, 54); ovell(d, cxh + 110, cyh)
    keynum(d, e[0] + 22, e[1] + 22, "E"); text_halo(d, (e[0] + e[2]) / 2, e[3] - 16, "Operator's Hall", "num", 13)


def gear(d, x, y):
    ELL(d, x, y, 22, outline=INK, w=1.6)
    for a in range(0, 360, 45):
        L(d, *pol(x, y, 22, a), *pol(x, y, 29, a), w=1.6)
    ELL(d, x, y, 6, fill=INK, outline=INK)
    L(d, x, y - 40, x, y - 22, w=1.0)


def ovell(d, x, y):
    ELL(d, x, y - 8, 7, outline=INK, w=1.5)
    L(d, x, y - 1, x, y + 14, w=1.5)
    L(d, x - 9, y + 4, x + 9, y + 4, w=1.5)
    text_halo(d, x, y + 28, "Ovell", "italic", 12)


# ============ symbol legend ============

def symbol_legend(d, x, y):
    entries = [
        (lambda px, py: idoor(px, py), "door"),
        (lambda px, py: isecret(px, py), "secret door"),
        (lambda px, py: istairs(px, py, 30), "stairs"),
        (lambda px, py: ipit(px, py), "pit"),
        (lambda px, py: sym_pillars(d, [(px - 12, py), (px, py), (px + 12, py)]), "pillars"),
        (lambda px, py: water(d, [(px - 18, py - 9), (px + 18, py - 11), (px + 16, py + 10), (px - 16, py + 9)]), "pool of water"),
        (lambda px, py: T.sym_dais(d, px, py, 15), "dais"),
        (lambda px, py: keynum(d, px, py, "#"), "keyed area"),
    ]
    legend_box(d, x, y, "MAP KEY", entries, w=300, rowh=46, icon_dx=42, text_dx=80)


if __name__ == "__main__":
    main()
