# OSR Map Maker

A single-page, old-school (TSR/B-X style) hex-wilderness and dungeon map editor.
Pure static front end: `index.html` + a bundled `icons.js` (icons are inlined as
data URIs). No backend, no database, no accounts — your maps live in your own
browser.

> An independent fan tool, not affiliated with or endorsed by TSR, Wizards of the
> Coast, or any trademark holder. "B/X", "OSR", and similar terms are used
> descriptively. Dungeon symbols are CC0 by Mark Gosbell — see [CREDITS.md](CREDITS.md).

**▶ Live: https://marc-korte.github.io/osr-map-maker/**

Each person who opens the link gets their own private workspace; maps are saved
in that browser (localStorage) and via **Save .json** / **Load**. Nothing is
stored server-side.

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
