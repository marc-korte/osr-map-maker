#!/usr/bin/env python3
"""Bundle maps/icons/{hex,dungeon}/*.png into ../icons.js as base64 data URIs,
so the Map Maker can stamp them and still export PNG without tainting the canvas."""
import os, re, glob, json, base64
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def label(n):
    n = re.sub(r'\d+x\d+', '', n); n = re.sub(r'_\d+', '', n); n = n.replace('Big', '')
    n = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', n)
    n = re.sub(r'(?<=[A-Za-z])(?=\d)', ' ', n)
    return n.strip() or 'Icon'

def enc(folder):
    out = []
    for f in sorted(glob.glob(os.path.join(folder, "*.png"))):
        n = os.path.basename(f)[:-4]
        uri = "data:image/png;base64," + base64.b64encode(open(f, "rb").read()).decode()
        out.append({"n": n, "label": label(n), "uri": uri})
    return out

data = {"hex": enc(os.path.join(HERE, "icons", "hex")),
        "dungeon": enc(os.path.join(HERE, "icons", "dungeon"))}
with open(os.path.join(ROOT, "icons.js"), "w") as f:
    f.write("window.ICONS=" + json.dumps(data) + ";")
print("hex:", len(data["hex"]), " dungeon:", len(data["dungeon"]),
      " ->", os.path.join(ROOT, "icons.js"))
