#!/usr/bin/env python3
"""
gen_hexicons.py  -  classic Expert-set HEX TERRAIN icons, drawn to match the
old D&D terrain-symbol sheet (Castle, Forest, Mountains, Swamp, Volcano, ...).

Outputs 300x300 transparent PNGs (black line art) into  maps/icons/hex/ , the
same format as the dungeon symbol set, so the Map Maker can stamp them in hexes.
Also writes a contact sheet  _hexicons_sheet.png  for eyeballing.
"""
import os, math, random
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "icons", "hex")
os.makedirs(OUT, exist_ok=True)
SS, S = 4, 300
BLK = (0, 0, 0, 255)


def canvas():
    img = Image.new("RGBA", (S * SS, S * SS), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)

def P(v): return v * SS
def XY(pts): return [(P(x), P(y)) for x, y in pts]
def line(d, pts, w=4, f=BLK): d.line(XY(pts), fill=f, width=int(P(w)), joint="curve")
def poly(d, pts, fill=BLK, outline=None, w=3):
    d.polygon(XY(pts), fill=fill, outline=outline, width=int(P(w)) if outline else 1)
def ell(d, x, y, rx, ry, fill=None, outline=BLK, w=4):
    d.ellipse([P(x - rx), P(y - ry), P(x + rx), P(y + ry)], fill=fill, outline=outline, width=int(P(w)))
def rect(d, x0, y0, x1, y1, fill=BLK, outline=None, w=3):
    d.rectangle([P(x0), P(y0), P(x1), P(y1)], fill=fill, outline=outline, width=int(P(w)) if outline else 1)

CX = CY = 150


# ---------- natural terrain ----------

def i_clear(d):
    pass

def tree(d, x, y, s):
    ell(d, x, y - s * .35, s * .55, s * .5, fill=None, outline=BLK, w=3.5)
    # a few lobes for a leafy look
    for a in (200, 250, 290, 340, 20, 70, 110, 160):
        ell(d, x + s * .5 * math.cos(math.radians(a)), y - s * .35 + s * .45 * math.sin(math.radians(a)),
            s * .2, s * .2, fill=None, outline=BLK, w=3)
    line(d, [(x, y + s * .15), (x, y + s * .5)], 4)

def i_forest(d):
    for (x, y, s) in [(105, 175, 48), (185, 150, 56), (150, 205, 44)]:
        tree(d, x, y, s)

def palm(d, x, y, s):
    line(d, [(x, y + s * .55), (x - s * .12, y - s * .35)], 5)
    for a in (-130, -95, -60, -20):
        ex, ey = x - s * .12 + s * .6 * math.cos(math.radians(a)), y - s * .35 + s * .6 * math.sin(math.radians(a))
        line(d, [(x - s * .12, y - s * .35), (ex, ey)], 4)

def i_jungle(d):
    palm(d, 120, 185, 70); palm(d, 185, 165, 80)
    line(d, [(95, 205), (130, 195), (160, 210), (200, 200)], 4)

def i_mountains(d):
    for (x, y, h) in [(105, 195, 95), (165, 175, 120), (215, 200, 80)]:
        w = h * 0.62
        poly(d, [(x - w, y), (x, y - h), (x + w, y)], fill=BLK)
        # white snow notch
        d.line(XY([(x - w * .26, y - h * .55), (x - w * .06, y - h * .78),
                   (x + w * .08, y - h * .55), (x + w * .26, y - h * .74)]),
               fill=(255, 255, 255, 255), width=int(P(3)))

def i_hills(d):
    for (x, y, w) in [(95, 175, 55), (155, 195, 70), (215, 175, 55)]:
        d.arc([P(x - w), P(y - w * .7), P(x + w), P(y + w * .9)], 200, 340, fill=BLK, width=int(P(4)))

def i_desert(d):
    for (x, y, w) in [(110, 175, 60), (190, 195, 70)]:
        d.arc([P(x - w), P(y - w * .5), P(x + w), P(y + w)], 200, 340, fill=BLK, width=int(P(3.5)))
    random.seed(1)
    for _ in range(7):
        x, y = random.uniform(90, 215), random.uniform(120, 210)
        ell(d, x, y, 2.5, 2.5, fill=BLK, outline=None)

def i_grasslands(d):
    random.seed(2)
    for x in range(95, 211, 16):
        for dx in (-4, 0, 4):
            line(d, [(x + dx, 205), (x + dx + random.uniform(-3, 3), 205 - random.uniform(28, 44))], 3)

def i_swamp(d):
    line(d, [(100, 205), (135, 200), (170, 207), (205, 201)], 4)
    line(d, [(100, 218), (140, 213), (175, 220), (205, 214)], 3)
    for x in (110, 150, 190):                    # cattails
        line(d, [(x, 200), (x, 150)], 3)
        ell(d, x, 145, 7, 12, fill=BLK, outline=None)

def i_barren(d):
    for y in (150, 180, 210):
        line(d, [(95, y), (120, y - 14), (145, y), (170, y - 14), (200, y), (215, y - 10)], 3.5)

def i_volcano(d):
    poly(d, [(95, 210), (140, 110), (160, 110), (205, 210)], fill=BLK)
    # crater spout
    for a in (-100, -80, -60):
        line(d, [(150, 110), (150 + 40 * math.cos(math.radians(a)), 110 + 40 * math.sin(math.radians(a)))], 4,
             f=(0, 0, 0, 255))
    ell(d, 150, 80, 16, 10, fill=None, outline=BLK, w=3)

def i_caves(d):
    for (x, y, w) in [(110, 185, 40), (175, 200, 50), (210, 165, 34)]:
        d.arc([P(x - w), P(y - w), P(x + w), P(y + w)], 180, 360, fill=BLK, width=int(P(4)))
        line(d, [(x - w, y), (x - w, y + 8)], 3); line(d, [(x + w, y), (x + w, y + 8)], 3)

def i_water(d):
    random.seed(3)
    for _ in range(120):
        x, y = random.uniform(75, 225), random.uniform(75, 225)
        if (x - CX) ** 2 + (y - CY) ** 2 < 78 ** 2:
            ell(d, x, y, 2, 2, fill=BLK, outline=None)

def i_iceflow(d):
    for (x, y, rx, ry) in [(120, 150, 34, 26), (185, 175, 30, 22), (150, 205, 26, 18)]:
        d.ellipse([P(x - rx), P(y - ry), P(x + rx), P(y + ry)], outline=BLK, width=int(P(3.5)))
        d.ellipse([P(x - rx * .5), P(y - ry * .5), P(x + rx * .4), P(y + ry * .4)], outline=BLK, width=int(P(2.5)))

def i_plateau(d):
    line(d, [(90, 130), (140, 120), (190, 132), (220, 122)], 5)        # cliff edge
    for x in range(95, 216, 12):                                       # hatch comb below
        line(d, [(x, 134), (x + 6, 168)], 3)

def i_river(d):
    line(d, [(110, 90), (140, 130), (120, 165), (155, 200), (140, 235)], 6)

def i_road(d):
    line(d, [(100, 95), (150, 150), (205, 215)], 4)
    line(d, [(118, 88), (168, 143), (220, 205)], 4)

def i_trail(d):
    pts = [(100, 100), (130, 135), (150, 165), (175, 195), (205, 220)]
    for (x, y) in pts:
        line(d, [(x - 7, y - 7), (x + 7, y + 7)], 3); line(d, [(x - 7, y + 7), (x + 7, y - 7)], 3)

def i_border(d):
    xs = list(range(92, 216, 18))
    for i in range(len(xs) - 1):
        if i % 2 == 0:
            line(d, [(xs[i], 95 + i * 18), (xs[i + 1], 95 + (i + 1) * 18)], 6)


# ---------- settlements (black silhouettes) ----------

def merlon_wall(d, x0, x1, top, bot, tooth=10):
    rect(d, x0, top, x1, bot, fill=BLK)
    x = x0
    while x < x1 - tooth:
        rect(d, x, top - tooth, x + tooth, top, fill=BLK)
        x += tooth * 2

def tower(d, x, w, top, bot):
    merlon_wall(d, x - w / 2, x + w / 2, top, bot, tooth=w / 5)

def i_town(d):
    base = 205
    for (x, w, h) in [(108, 30, 40), (140, 26, 30), (170, 34, 50), (205, 26, 34)]:
        rect(d, x - w / 2, base - h, x + w / 2, base, fill=BLK)
        poly(d, [(x - w / 2 - 3, base - h), (x, base - h - w * .5), (x + w / 2 + 3, base - h)], fill=BLK)

def i_castle(d):
    merlon_wall(d, 100, 200, 150, 205, tooth=11)
    tower(d, 105, 34, 120, 205)
    tower(d, 195, 34, 120, 205)
    tower(d, 150, 30, 105, 150)

def i_city(d):
    merlon_wall(d, 88, 212, 150, 210, tooth=12)
    tower(d, 96, 30, 120, 210); tower(d, 150, 34, 100, 210); tower(d, 204, 30, 118, 210)
    # a dome
    d.pieslice([P(128), P(95), P(172), P(150)], 180, 360, fill=BLK)
    rect(d, 128, 122, 172, 150, fill=BLK)

def i_capitol(d):
    merlon_wall(d, 92, 208, 160, 210, tooth=12)
    tower(d, 100, 28, 130, 210); tower(d, 200, 28, 130, 210)
    # central spire + dome
    d.pieslice([P(126), P(96), P(174), P(150)], 180, 360, fill=BLK); rect(d, 126, 123, 174, 160, fill=BLK)
    poly(d, [(150, 55), (140, 96), (160, 96)], fill=BLK)
    ell(d, 150, 52, 5, 5, fill=BLK, outline=None)

def i_ruins(d):
    # broken castle: jagged-topped wall + a leaning broken tower + a gap
    poly(d, [(100, 205), (100, 150), (118, 150), (122, 168), (132, 150), (150, 150),
             (150, 205)], fill=BLK)                       # left wall, broken top
    poly(d, [(175, 205), (175, 120), (185, 130), (188, 110), (196, 128), (205, 120),
             (205, 205)], fill=BLK)                       # right broken tower
    rect(d, 150, 188, 175, 205, fill=BLK)                 # low rubble bridging the gap


def star(d, cx, cy, r):
    pts = [(cx + (r if i % 2 == 0 else r * .42) * math.cos(math.radians(36 * i - 90)),
            cy + (r if i % 2 == 0 else r * .42) * math.sin(math.radians(36 * i - 90))) for i in range(10)]
    poly(d, pts, fill=BLK, outline=None)

WHT = (255, 255, 255, 255)

# ---------- extra terrain ----------

def conifer(d, x, y, h):
    w = h * 0.32
    for k in range(3):
        top = y - h + k * h * 0.30
        poly(d, [(x, top), (x - w * (1 - k * .12), top + h * .42), (x + w * (1 - k * .12), top + h * .42)], fill=None, outline=BLK, w=3)
    line(d, [(x, y - 2), (x, y + h * .05)], 3)

def i_pines(d):
    conifer(d, 108, 205, 118); conifer(d, 162, 196, 150); conifer(d, 210, 210, 98)

def i_scrub(d):
    random.seed(11)
    for x, y in [(105, 196), (150, 206), (200, 198), (130, 168), (176, 170)]:
        for dx in (-11, 1, 13):
            d.arc([P(x + dx - 12), P(y - 12), P(x + dx + 12), P(y + 14)], 200, 340, fill=BLK, width=int(P(2.6)))

def i_tundra(d):
    random.seed(12)
    for x in range(96, 211, 22):
        line(d, [(x, 205), (x, 205 - random.uniform(13, 22))], 2.4)
        line(d, [(x + 7, 205), (x + 7, 205 - random.uniform(9, 16))], 2.4)
    for _ in range(11):
        ell(d, random.uniform(92, 212), random.uniform(150, 214), 1.8, 1.8, fill=BLK, outline=None)

def i_lake(d):
    poly(d, [(110, 150), (150, 130), (196, 142), (216, 176), (188, 210), (138, 216), (104, 188)], fill=None, outline=BLK, w=4)
    for y in (166, 186):
        line(d, [(132, y), (160, y - 4), (186, y)], 2.4)

def i_oasis(d):
    ell(d, 150, 202, 44, 18, fill=None, outline=BLK, w=3.4)
    line(d, [(122, 204), (150, 207), (180, 203)], 2)
    palm(d, 118, 200, 72); palm(d, 186, 196, 72)

def i_lava(d):
    for y in (176, 202):
        line(d, [(94, y), (120, y - 10), (150, y), (180, y - 10), (212, y), (218, y - 6)], 3)
    for x in (126, 176):
        line(d, [(x, 172), (x, 150)], 3)
        for a in (-100, -80, -60):
            line(d, [(x, 150), (x + 18 * math.cos(math.radians(a)), 150 + 18 * math.sin(math.radians(a)))], 2.4)
        ell(d, x, 170, 8, 5, fill=BLK, outline=None)

# ---------- settlements & structures ----------

def i_village(d):
    base = 206
    for x, w, h in [(120, 28, 38), (160, 24, 30), (196, 30, 44)]:
        rect(d, x - w / 2, base - h, x + w / 2, base, fill=BLK)
        poly(d, [(x - w / 2 - 3, base - h), (x, base - h - w * .55), (x + w / 2 + 3, base - h)], fill=BLK)

def i_keep(d):
    tower(d, 150, 72, 112, 206)
    d.rectangle([P(140), P(176), P(160), P(206)], fill=WHT)
    d.pieslice([P(140), P(166), P(160), P(186)], 180, 360, fill=WHT)

def i_tower(d):
    tower(d, 150, 32, 78, 206)
    d.rectangle([P(144), P(120), P(156), P(136)], fill=WHT)

def i_temple(d):
    poly(d, [(108, 150), (150, 116), (192, 150)], fill=BLK)
    rect(d, 108, 150, 192, 161, fill=BLK)
    for x in (118, 139, 161, 182):
        rect(d, x - 4, 161, x + 4, 200, fill=BLK)
    rect(d, 104, 200, 196, 211, fill=BLK)

def i_standingstones(d):
    for a in range(0, 360, 51):
        x = 150 + 44 * math.cos(math.radians(a)); y = 162 + 30 * math.sin(math.radians(a))
        rect(d, x - 7, y - 20, x + 7, y + 12, fill=BLK)
        d.pieslice([P(x - 7), P(y - 28), P(x + 7), P(y - 12)], 180, 360, fill=BLK)

def i_mine(d):
    d.pieslice([P(122), P(176), P(178), P(232)], 180, 360, fill=BLK)
    rect(d, 122, 204, 178, 216, fill=BLK)
    d.rectangle([P(138), P(196), P(162), P(216)], fill=WHT)
    line(d, [(116, 150), (188, 184)], 5)
    d.arc([P(104), P(134), P(140), P(166)], 290, 40, fill=BLK, width=int(P(5)))
    rect(d, 180, 144, 198, 158, fill=BLK)

def i_cave(d):
    d.pieslice([P(92), P(150), P(208), P(264)], 180, 360, fill=None, outline=BLK, width=int(P(4)))
    d.pieslice([P(124), P(182), P(176), P(234)], 180, 360, fill=BLK)
    rect(d, 124, 208, 176, 216, fill=BLK)

def i_lighthouse(d):
    poly(d, [(134, 206), (142, 118), (158, 118), (166, 206)], fill=BLK)
    rect(d, 130, 206, 170, 216, fill=BLK)
    rect(d, 139, 102, 161, 118, fill=BLK)
    for a in (-155, -120, -60, -25):
        line(d, [(150, 110), (150 + 42 * math.cos(math.radians(a)), 110 + 42 * math.sin(math.radians(a)))], 2.2)

def i_bridge(d):
    for y in (202, 214):
        line(d, [(90, y), (130, y - 3), (170, y + 3), (216, y - 3)], 2.4)
    d.arc([P(112), P(162), P(188), P(222)], 180, 360, fill=BLK, width=int(P(4)))
    line(d, [(108, 176), (192, 176)], 4)
    line(d, [(112, 176), (112, 192)], 4); line(d, [(188, 176), (188, 192)], 4)

def i_ford(d):
    for y in (172, 192, 212):
        line(d, [(90, y), (130, y - 4), (170, y + 4), (216, y - 4)], 2.6)
    for x in range(106, 210, 22):
        ell(d, x, 192, 6, 4, fill=BLK, outline=None)

def i_port(d):
    line(d, [(150, 118), (150, 206)], 5)
    ell(d, 150, 110, 11, 11, fill=None, outline=BLK, w=4)
    line(d, [(126, 140), (174, 140)], 5)
    d.arc([P(108), P(160), P(192), P(228)], 20, 160, fill=BLK, width=int(P(5)))

def i_waterfall(d):
    line(d, [(96, 150), (158, 150)], 5); line(d, [(158, 150), (158, 118)], 4)
    for x in range(106, 156, 11):
        line(d, [(x, 152), (x, 204)], 2.4)
    for y in (208, 217):
        line(d, [(94, y), (130, y - 3), (166, y)], 2.4)

def i_pass(d):
    for x in (98, 202):
        poly(d, [(x - 50, 205), (x, 123), (x + 50, 205)], fill=BLK)
    for y in range(146, 214, 13):
        ell(d, 150, y, 3, 3, fill=BLK, outline=None)

def i_lair(d):
    ell(d, 150, 164, 38, 34, fill=None, outline=BLK, w=4)
    ell(d, 136, 164, 8, 11, fill=BLK, outline=None); ell(d, 164, 164, 8, 11, fill=BLK, outline=None)
    poly(d, [(150, 176), (144, 188), (156, 188)], fill=BLK)
    rect(d, 134, 196, 166, 212, fill=None, outline=BLK, w=3)
    for x in (142, 150, 158):
        line(d, [(x, 196), (x, 212)], 2)

def i_tomb(d):
    d.pieslice([P(94), P(152), P(206), P(252)], 180, 360, fill=None, outline=BLK, width=int(P(4)))
    rect(d, 135, 180, 145, 216, fill=BLK); rect(d, 155, 180, 165, 216, fill=BLK); rect(d, 131, 171, 169, 183, fill=BLK)

def i_statue(d):
    rect(d, 131, 196, 169, 213, fill=BLK)
    ell(d, 150, 118, 10, 12, fill=BLK, outline=None)
    rect(d, 143, 130, 157, 196, fill=BLK)
    line(d, [(143, 148), (124, 170)], 5); line(d, [(157, 148), (176, 170)], 5)

def i_special(d):
    star(d, 150, 158, 50)

def i_shipwreck(d):
    poly(d, [(104, 174), (202, 164), (186, 206), (120, 212)], fill=None, outline=BLK, w=4)
    line(d, [(150, 168), (138, 108)], 4); line(d, [(138, 108), (166, 130)], 3)
    for y in (206, 217):
        line(d, [(90, y), (130, y - 4), (170, y + 4), (216, y - 4)], 2.4)

def i_dungeon(d):
    d.pieslice([P(116), P(150), P(184), P(216)], 180, 360, fill=BLK)
    rect(d, 116, 183, 184, 216, fill=BLK)
    for i in range(4):
        yy = 190 + i * 6
        d.rectangle([P(132 + i * 3), P(yy), P(168 - i * 3), P(yy + 3)], fill=WHT)


ICONS = {
    "Clear": i_clear, "Forest": i_forest, "Pines": i_pines, "Jungle": i_jungle,
    "Mountains": i_mountains, "Hills": i_hills, "Desert": i_desert, "Grasslands": i_grasslands,
    "Scrub": i_scrub, "Tundra": i_tundra, "Swamp": i_swamp, "Barren": i_barren,
    "Volcano": i_volcano, "Lava": i_lava, "Caves": i_caves, "Cave": i_cave,
    "Water": i_water, "Lake": i_lake, "Oasis": i_oasis, "IceFlow": i_iceflow,
    "Plateau": i_plateau, "Waterfall": i_waterfall, "MountainPass": i_pass,
    "River": i_river, "Road": i_road, "Trail": i_trail, "Border": i_border, "Bridge": i_bridge, "Ford": i_ford,
    "Town": i_town, "Village": i_village, "City": i_city, "Capitol": i_capitol,
    "Castle": i_castle, "Keep": i_keep, "Tower": i_tower, "Ruins": i_ruins,
    "Temple": i_temple, "StandingStones": i_standingstones, "Tomb": i_tomb, "Statue": i_statue,
    "Mine": i_mine, "Lighthouse": i_lighthouse, "Port": i_port, "Lair": i_lair,
    "Dungeon": i_dungeon, "Shipwreck": i_shipwreck, "Special": i_special,
}


def main():
    imgs = {}
    for name, fn in ICONS.items():
        img, d = canvas(); fn(d)
        small = img.resize((S, S), Image.LANCZOS)
        small.save(os.path.join(OUT, name + ".png"))
        imgs[name] = small
    # contact sheet
    cols = 6; rows = (len(imgs) + cols - 1) // cols; cell = 150
    sheet = Image.new("RGBA", (cols * cell, rows * (cell + 22) + 10), (255, 255, 255, 255))
    sd = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(imgs.items()):
        r, c = divmod(i, cols)
        thumb = im.resize((cell - 16, cell - 16), Image.LANCZOS)
        sheet.alpha_composite(thumb, (c * cell + 8, r * (cell + 22) + 8))
        sd.rectangle([c * cell + 4, r * (cell + 22) + 4, c * cell + cell - 4, r * (cell + 22) + cell - 4],
                     outline=(150, 150, 150, 255))
        sd.text((c * cell + 8, r * (cell + 22) + cell - 2), name, fill=(0, 0, 0, 255))
    sheet.convert("RGB").save(os.path.join(HERE, "icons", "_hexicons_sheet.png"))
    print("wrote", len(imgs), "hex icons to", OUT)


if __name__ == "__main__":
    main()
