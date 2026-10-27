# OSR Map Maker

A single-page, old-school (TSR/B-X style) hex-wilderness and dungeon map editor.
Pure static front end: `index.html` + a bundled `icons.js` (icons are inlined as
data URIs). No backend, no database, no accounts — your maps live in your own
browser.

> An independent fan tool, not affiliated with or endorsed by TSR, Wizards of the
> Coast, or any trademark holder. "B/X", "OSR", and similar terms are used
> descriptively. Dungeon symbols are CC0 by Mark Gosbell — see [CREDITS.md](CREDITS.md).

**▶ Live: https://marc-korte.github.io/osr-map-maker/**

Each person who opens the link gets their own private workspace; the working
map autosaves in that browser (localStorage), named snapshots live under
**Saved maps** in the sidebar, and **Save .json** / **Load** move maps between
browsers. Nothing is stored server-side. Undo/redo: Ctrl+Z / Ctrl+Y (macOS: Cmd+Z / Cmd+Shift+Z).

## Using it

- **Wilderness:** pick a terrain in the sidebar and **Paint** (drag) or **Fill** a
  connected patch; **Water** is the first swatch. **Keyed site** adds a numbered
  location, **Place name** names a hex (town, ruin…), **Label** puts free text
  anywhere (regions, seas). **Hex numbers** (Map section) prints classic CCRR
  coordinates.
- **Rivers, roads, trails:** freehand, smoothed while you draw, drawn over the
  terrain (roads dashed, trails dotted). A river's end snaps onto another river
  (gold ring) to join a tributary, starting on a river's end extends it, and a
  river always widens toward the water/junction end — draw it in either direction. Name a
  river by double-clicking it with **Select/Move** (or select it and press Enter).
- **Dungeon:** **Room** drags out a floor rectangle (Shift-drag carves rock),
  **Floor/Rock** paint single squares, **Stamp** places symbols — with **Snap to
  grid** on, doors and windows snap into walls and turn to match, and 2×2 / 2×1
  pieces sit on the grid lines.
- **Select/Move:** drag things, double-click (or Enter) to edit text, arrows
  nudge, `G` toggles GM-only, `Del` deletes, `Ctrl+C` / `Ctrl+V` / `Ctrl+D`
  copy / paste at the cursor / duplicate. Every shortcut also has a button in
  the sidebar's **Selection** section for touch screens.
- **GM / Player view:** GM-only items (and GM-only layers) disappear from the
  Player view, its key, and its PNG export. **Export PNG** is up to 300 dpi and
  never includes selection highlights.
- **Generate** builds a random map from the options; it keeps a title you typed,
  shows the seed it used (**Reuse** puts it in the Seed box to rebuild that exact
  map), and is undoable. Generated rivers run along hexsides (between the
  symbols) from high ground down to a lake, the sea or the map edge, joining as
  tributaries; roads link the settlements as one network that steers around
  other sites, and every road/river crossing gets a bridge. Generated dungeons
  keep corridors off room walls (a door at every doorway, no 2-wide blobs);
  the **Jaquay** option ([after Jennell Jaquays](https://thealexandrian.net/wordpress/13085/roleplaying-games/jaquaying-the-dungeon))
  adds loops instead of dead-end branches, secret / concealed / one-way doors on
  those loops, a back way in, a passage out through the map edge, more than one
  way down (including a GM-only trapdoor) and a stair partway along a passage.

## Layout

```
index.html        # the app
icons.js          # bundled icon set (base64) — built by maps/build_icons_js.py
maps/             # Python icon/map generators (dev tooling, not part of the site)
.github/workflows/
  pages.yml       # deploys index.html + icons.js to GitHub Pages on push to main
```

## Develop locally

It's a static file — just open `index.html` in a browser. No build step, no
server needed.

Dev URL hooks: `?gw` / `?gd` generate a sample wilderness/dungeon (add
`&seed=abc` to pick one; that session never autosaves, so your own map is left
alone), `?dev` exposes the model as `window.MM`, and `?test` runs the in-page
invariant checks (result appears in the tab title; your autosave is restored
after).

Editing the icon set (optional):

```
cd maps
python3 gen_hexicons.py        # (re)build hex terrain icons
python3 gen_stairs.py          # tapered dungeon stair glyph
python3 build_icons_js.py      # bundle icons/ -> ../icons.js
```

## Deploy (GitHub Pages)

Hosting is GitHub Pages, set up and automatic:

- Push to `main` → `.github/workflows/pages.yml` publishes `index.html` +
  `icons.js` to the Pages CDN. No Docker, no server, no secrets.
- Pages is configured as **Settings → Pages → Source: GitHub Actions**.

So the whole update loop is just: **edit `index.html` → commit → push.** The live
site updates in ~a minute. (A hard refresh / Ctrl-Shift-R bypasses browser cache.)

### Custom domain (optional)

Add a `CNAME` file containing your domain (e.g. `maps.example.com`), point a DNS
`CNAME` at `marc-korte.github.io`, and set the domain under Settings → Pages.

## Optional: self-host with Docker

Not needed — Pages covers it — but the repo still ships an nginx setup if you ever
want a private instance (e.g. on a NAS):

- `Dockerfile` + `default.conf` — `nginx:alpine` serving the two files.
- `compose.yaml` — `docker compose up --build` → http://localhost:8089
- `deploy/compose.truenas.yaml` + `deploy/tailscale-serve.json` — Dockge/TrueNAS
  stack pulling the GHCR image (`ghcr.io/marc-korte/osr-map-maker`, built by
  `.github/workflows/docker-publish.yml`) behind a Tailscale sidecar.

If you don't want any of that, the `Dockerfile`, `compose*.yaml`, `default.conf`,
`deploy/`, and `docker-publish.yml` workflow can be deleted without affecting the
Pages site.
