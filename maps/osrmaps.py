"""
osrmaps.py  -  shared drawing helpers for the BX1 map generators.

Convention: callers work entirely in DESIGN pixels (e.g. a 1500x1980 sheet).
Every helper scales to the supersampled canvas internally via s(). Only
new_paper()/finish() know about the supersample factor. Render big, shrink with
LANCZOS, get clean anti-aliased ink without a vector backend.

Black ink on warm paper, the look of an early-'80s B/X module.
Used by gen_hush.py (hex wilderness) and gen_wreath.py (dungeon).
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

SS = 3

# PALETTE: "bw" (black ink on white, X1-interior style, photocopy-friendly),
# "cream" (warm paper), or "blue" (B2 blue-graph). Ships as "bw".
PALETTE = "bw"
_PALETTES = {
    "bw":    dict(INK=(0, 0, 0),     PAPER=(255, 255, 255), GRIDLINE=(199, 199, 199),
                  GREY=(223, 223, 223), GREY2=(110, 110, 110)),
    "cream": dict(INK=(28, 26, 24),  PAPER=(247, 242, 230), GRIDLINE=(184, 175, 153),
                  GREY=(210, 203, 186), GREY2=(150, 144, 126)),
    "blue":  dict(INK=(38, 78, 140), PAPER=(232, 240, 250), GRIDLINE=(150, 184, 224),
                  GREY=(150, 184, 224), GREY2=(70, 110, 170)),
}
_P = _PALETTES[PALETTE]
INK, PAPER, GRIDLINE, GREY, GREY2 = _P["INK"], _P["PAPER"], _P["GRIDLINE"], _P["GREY"], _P["GREY2"]

_FONTS = {
    "title":  ["/home/marc/.local/share/fonts/Jost-Bold.ttf",
               "/usr/share/fonts/truetype/DejaVuSans-Bold.ttf"],
    "label":  ["/home/marc/.local/share/fonts/EBGaramond-VariableFont_wght.ttf",
               "/usr/share/fonts/truetype/DejaVuSerif.ttf"],
    "italic": ["/home/marc/.local/share/fonts/EBGaramond-Italic-VariableFont_wght.ttf",
               "/usr/share/fonts/truetype/DejaVuSerif-Italic.ttf"],
    "num":    ["/usr/share/fonts/truetype/DejaVuSans-Bold.ttf"],
}
_cache = {}


def s(v):
    return int(round(v * SS))


def font(kind, px):
    key = (kind, int(px * SS))
    if key not in _cache:
        for p in _FONTS[kind]:
            if os.path.exists(p):
                _cache[key] = ImageFont.truetype(p, int(px * SS)); break
        else:
            _cache[key] = ImageFont.load_default()
    return _cache[key]


# ---- canvas --------------------------------------------------------------

_cur = None                          # the image stamp() pastes icons onto
_ICONDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
_iconcache = {}


def new_paper(w, h):
    global _cur
    img = Image.new("RGB", (w * SS, h * SS), PAPER)
    _cur = img
    return img, ImageDraw.Draw(img)


def finish(img, w, h, path):
    img.resize((w, h), Image.LANCZOS).save(path, "PNG")
    return path


def load_icon(setname, name):
    key = (setname, name)
    if key not in _iconcache:
        p = os.path.join(_ICONDIR, setname, name + ".png")
        _iconcache[key] = Image.open(p).convert("RGBA") if os.path.exists(p) else None
    return _iconcache[key]


def stamp(setname, name, cx, cy, box, boxh=None):
    """Paste a transparent PNG icon (from icons/<set>/<name>.png) centered on
    design-space (cx,cy), scaled to fit a box x boxh design-px area."""
    if _cur is None:
        return
    ic = load_icon(setname, name)
    if ic is None:
        return
    bw, bh = s(box), s(boxh if boxh else box)
    rt = min(bw / ic.width, bh / ic.height)
    w = max(1, int(ic.width * rt)); h = max(1, int(ic.height * rt))
    ic2 = ic.resize((w, h), Image.LANCZOS)
    _cur.paste(ic2, (s(cx) - w // 2, s(cy) - h // 2), ic2)


# ---- primitive drawers (design-space in, supersample out) ----------------

def L(d, x0, y0, x1, y1, w=1.0, fill=INK, joint=None):
    d.line([(s(x0), s(y0)), (s(x1), s(y1))], fill=fill, width=max(1, s(w)), joint=joint)


def PL(d, pts, w=1.0, fill=INK, joint="curve"):
    d.line([(s(x), s(y)) for x, y in pts], fill=fill, width=max(1, s(w)), joint=joint)


def POLY(d, pts, fill=None, outline=INK, w=1.0):
    p = [(s(x), s(y)) for x, y in pts]
    if fill is not None:
        d.polygon(p, fill=fill)
    if outline is not None:
        d.line(p + [p[0]], fill=outline, width=max(1, s(w)), joint="curve")


def ELL(d, cx, cy, rx, ry=None, fill=None, outline=INK, w=1.0):
    ry = rx if ry is None else ry
    box = [s(cx - rx), s(cy - ry), s(cx + rx), s(cy + ry)]
    d.ellipse(box, fill=fill, outline=outline, width=max(1, s(w)))


def RECT(d, x0, y0, x1, y1, fill=None, outline=INK, w=1.0):
    d.rectangle([s(x0), s(y0), s(x1), s(y1)], fill=fill, outline=outline, width=max(1, s(w)))


def text(d, x, y, string, kind="label", px=14, fill=INK, anchor="mm", track=0):
    f = font(kind, px)
    if track and len(string) > 1:
        widths = [d.textlength(c, font=f) for c in string]
        total = sum(widths) + s(track) * (len(string) - 1)
        cx = s(x) - total / 2 if "m" in anchor else s(x)
        for c, wdt in zip(string, widths):
            d.text((cx, s(y)), c, font=f, fill=fill, anchor="lm")
            cx += wdt + s(track)
    else:
        d.text((s(x), s(y)), string, font=f, fill=fill, anchor=anchor)


def text_halo(d, x, y, string, kind="italic", px=14, anchor="mm"):
    """Label with a paper rectangle behind it, for legibility over terrain."""
    f = font(kind, px)
    w = d.textlength(string, font=f); h = px * SS
    pad = s(4)
    d.rectangle([s(x) - w / 2 - pad, s(y) - h * 0.62 - pad / 2,
                 s(x) + w / 2 + pad, s(y) + h * 0.62 + pad / 2], fill=PAPER)
    d.text((s(x), s(y)), string, font=f, fill=INK, anchor=anchor)


# ---- furniture -----------------------------------------------------------

def frame(d, w, h, m=26):
    RECT(d, m, m, w - m, h - m, w=2.4)
    RECT(d, m + 7, m + 7, w - m - 7, h - m - 7, w=1.1)


def cartouche(d, cx, y, title, sub=None, w=560):
    h = 70 if sub else 52
    RECT(d, cx - w / 2, y, cx + w / 2, y + h, fill=PAPER, w=2.2)
    RECT(d, cx - w / 2 + 5, y + 5, cx + w / 2 - 5, y + h - 5, w=1.0)
    text(d, cx, y + (27 if sub else 26), title, "title", 26, anchor="mm", track=3)
    if sub:
        text(d, cx, y + 53, sub, "italic", 15, anchor="mm")
    return y + h


def north_arrow(d, cx, cy, r=34):
    ELL(d, cx, cy, r, w=1.6)
    POLY(d, [(cx, cy - r + 4), (cx - 9, cy + 6), (cx, cy), (cx + 9, cy + 6)], fill=INK, outline=None)
    POLY(d, [(cx, cy + r - 4), (cx - 9, cy - 6), (cx, cy), (cx + 9, cy - 6)], outline=INK, w=1.2)
    text(d, cx, cy - r - 14, "N", "num", 18, anchor="mm")


def scale_bar(d, x, y, unit, n, label):
    h = 9
    for i in range(n):
        RECT(d, x + i * unit, y, x + (i + 1) * unit, y + h, fill=(INK if i % 2 == 0 else PAPER), w=1.0)
    text(d, x + n * unit / 2, y + h + 13, label, "italic", 13, anchor="mm")


def keynum(d, x, y, label, r=15):
    ELL(d, x, y, r, fill=INK, outline=INK)
    text(d, x, y - 0.5, label, "num", 15, fill=PAPER, anchor="mm")


# ---- dungeon glyphs ------------------------------------------------------

def grid(d, x0, y0, x1, y1, cell):
    x = x0
    while x <= x1 + 0.1:
        L(d, x, y0, x, y1, w=0.5, fill=GRIDLINE); x += cell
    y = y0
    while y <= y1 + 0.1:
        L(d, x0, y, x1, y, w=0.5, fill=GRIDLINE); y += cell


def stairs(d, x, y, w, h, steps=7, vertical=True):
    RECT(d, x, y, x + w, y + h, fill=PAPER, w=1.4)
    for i in range(1, steps):
        if vertical:
            ly = y + i * h / steps
            L(d, x, ly, x + w * (0.3 + 0.7 * i / steps), ly, w=1.0)
        else:
            lx = x + i * w / steps
            L(d, lx, y, lx, y + h * (0.3 + 0.7 * i / steps), w=1.0)


def water(d, pts):
    POLY(d, pts, fill=GREY, outline=INK, w=1.4)
    ys = [p[1] for p in pts]; xs = [p[0] for p in pts]
    y = min(ys) + 10
    while y < max(ys) - 4:
        L(d, min(xs) + 8, y, max(xs) - 8, y, w=0.9, fill=GREY2); y += 12


def door(d, x, y, vertical=False, ln=16):
    """A door: a small open box bridging a wall (canonical OSR door)."""
    if vertical:
        RECT(d, x - 5, y - ln / 2, x + 5, y + ln / 2, fill=PAPER, w=1.6)
    else:
        RECT(d, x - ln / 2, y - 5, x + ln / 2, y + 5, fill=PAPER, w=1.6)


# ---- negative-space dungeon (solid rock, white rooms) --------------------

def solid_rock(d, x0, y0, x1, y1):
    RECT(d, x0, y0, x1, y1, fill=INK, outline=None)


def carve(d, x0, y0, x1, y1, outline=False):
    """Cut a white room/corridor out of solid rock."""
    RECT(d, x0, y0, x1, y1, fill=PAPER, outline=(INK if outline else None), w=1.4)


def grid_in(d, x0, y0, x1, y1, cell):
    """Faint 10-ft grid, confined to a rectangular room/floor."""
    x = x0
    while x <= x1 + 0.1:
        L(d, x, y0, x, y1, w=0.5, fill=GRIDLINE); x += cell
    y = y0
    while y <= y1 + 0.1:
        L(d, x0, y, x1, y, w=0.5, fill=GRIDLINE); y += cell


def hatch_fill(d, x0, y0, x1, y1, gap=9, w=0.6, fill=INK):
    """Diagonal rock-hatch over a rectangle (lighter than a solid fill)."""
    c = y0 - x1
    while c <= y1 - x0:
        xa, xb = max(x0, y0 - c), min(x1, y1 - c)
        if xa <= xb:
            L(d, xa, xa + c, xb, xb + c, w=w, fill=fill)
        c += gap


# ---- canonical OSR map symbols -------------------------------------------

def sym_secret(d, x, y):
    text(d, x, y, "S", "num", 15, anchor="mm")


def sym_stairs(d, x, y, w, h, n=7, down=True):
    """Hatched-bar stairs with a travel arrow, the classic glyph."""
    carve(d, x, y, x + w, y + h, outline=True)
    for i in range(1, n):
        ly = y + i * h / n
        L(d, x, ly, x + w, ly, w=1.0)
    ax = x + w / 2
    if down:
        PL(d, [(ax - 6, y + h * .35), (ax, y + h * .62), (ax + 6, y + h * .35)], w=1.6)
        L(d, ax, y + h * .2, ax, y + h * .62, w=1.6)
    else:
        PL(d, [(ax - 6, y + h * .65), (ax, y + h * .38), (ax + 6, y + h * .65)], w=1.6)
        L(d, ax, y + h * .8, ax, y + h * .38, w=1.6)


def sym_pit(d, x, y, sz=20):
    RECT(d, x - sz / 2, y - sz / 2, x + sz / 2, y + sz / 2, w=1.6)
    L(d, x - sz / 2, y - sz / 2, x + sz / 2, y + sz / 2, w=1.4)
    L(d, x - sz / 2, y + sz / 2, x + sz / 2, y - sz / 2, w=1.4)


def sym_pillars(d, pts, r=4):
    for x, y in pts:
        ELL(d, x, y, r, fill=INK, outline=INK)


def sym_dais(d, cx, cy, r):
    for rr in (r, r * 0.66, r * 0.33):
        ELL(d, cx, cy, rr, outline=INK, w=1.3)


def sym_pool(d, pts):
    water(d, pts)


def tree_cloud(d, x, y, r):
    """A bumpy cloud outline: the classic 'trees' glyph."""
    import math as _m
    pts = []
    for i in range(13):
        a = _m.radians(360 * i / 13)
        rr = r * (0.78 + 0.22 * (i % 2))
        pts.append((x + rr * _m.cos(a), y + rr * _m.sin(a)))
    POLY(d, pts, fill=PAPER, outline=INK, w=1.1)


# ---- reusable legend box -------------------------------------------------

def legend_box(d, x, y, title, entries, w=410, rowh=54, icon_dx=48, text_dx=92):
    h = 64 + rowh * len(entries)
    RECT(d, x, y, x + w, y + h, fill=PAPER, w=2.0)
    RECT(d, x + 5, y + 5, x + w - 5, y + h - 5, w=1.0)
    text(d, x + w / 2, y + 33, title, "title", 19, anchor="mm", track=3)
    yy = y + 80
    for icon, label in entries:
        icon(x + icon_dx, yy)
        text(d, x + text_dx, yy, label, "label", 16, anchor="lm")
        yy += rowh
