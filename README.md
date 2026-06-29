# OSR Map Maker

A single-page, old-school (TSR/B-X style) hex-wilderness and dungeon map editor.
Pure static front end: `index.html` + a bundled `icons.js` (icons are inlined as
data URIs). No backend, no database.

```
index.html        # the app
icons.js          # bundled icon set (base64) — built by maps/build_icons_js.py
Dockerfile        # nginx:alpine serving the two files
default.conf      # nginx: no-cache headers for the app shell
compose.yaml      # local build + run on :8089
deploy/
  compose.truenas.yaml   # TrueNAS/Dockge: GHCR image + Tailscale sidecar
  tailscale-serve.json   # Tailscale serve -> nginx
.github/workflows/docker-publish.yml   # build + push image to GHCR on push to main
maps/             # Python map generators + icon builder (dev tooling, not served)
```

## Develop locally

Just open `index.html` in a browser, or run it through nginx exactly like prod:

```
docker compose up --build      # http://localhost:8089
```

Editing the icon set:

```
cd maps
python3 gen_hexicons.py        # (re)build hex terrain icons
python3 gen_stairs.py          # tapered dungeon stair glyph
python3 build_icons_js.py      # bundle icons/ -> ../icons.js
```

## CI: build image to GHCR

`.github/workflows/docker-publish.yml` builds and pushes
`ghcr.io/marc-korte/osr-map-maker:latest` (and a `sha-xxxxxxx` tag) on every push to
`main`. Uses the built-in `GITHUB_TOKEN` — no extra secrets.

After the first successful run, make the package usable by the NAS:
- GitHub → your profile → **Packages** → `osr-map-maker` → **Package settings**
  → set visibility **Public** (simplest), **or** keep it private and
  `docker login ghcr.io` on the NAS with a PAT that has `read:packages`.

## Deploy on TrueNAS SCALE (Dockge)

1. **Dataset** (TrueNAS UI → Datasets → Add, under your pool):
   `/mnt/Pool-0/osr-map-maker`. Copy `deploy/tailscale-serve.json` into it.
2. **Stack** in Dockge: new stack `osr-map-maker`, paste
   `deploy/compose.truenas.yaml` (image already set to `ghcr.io/marc-korte/...`).
3. Set `TS_AUTHKEY` in the stack env (Dockge env editor or a `.env` in the stack
   folder) — a Tailscale reusable/ephemeral auth key.
4. **Deploy.** Reach it at `https://osr-map-maker.<your-tailnet>.ts.net`
   (Tailscale provisions the TLS cert). LAN-only instead: drop the `tailscale`
   service and uncomment the `web` `ports:` block (`http://<NAS-IP>:8089`).

### Update loop

Edit → commit → push `main`. Actions rebuilds `:latest`. Then either:
- In Dockge, **Pull** the stack image and **Up**, or
- Uncomment the `watchtower` service in the deploy compose to auto-pull
  (default every 5 min).

## Alternative: build on the NAS from git (no CI, no registry)

Skip GHCR entirely — point compose at the repo and let the NAS build it:

```yaml
services:
  web:
    build: https://github.com/marc-korte/osr-map-maker.git#main
    restart: unless-stopped
    ports:
      - "8089:80"
```

In Dockge use **rebuild** (with no cache) to pick up new commits. Simpler, but
the NAS does the build each time and there's no image history.

## Notes

- Maps live in the browser (localStorage + **Save .json** / **Load**); nothing is
  stored server-side, so the container is stateless and disposable.
- `default.conf` sends `Cache-Control: no-cache` so a hard refresh always shows the
  latest deploy.
