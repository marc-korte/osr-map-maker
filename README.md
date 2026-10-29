# OSR Map Maker

An old-school (TSR/B-X style) map editor with **Wilderness**, **Dungeon**, and
**Town** modes. Generate a seeded map, then edit it and prepare private GM notes.
The static front end is `index.html`, `icons.js` and `town.js`; icons are bundled
as data URIs. No backend, database or accounts — maps live in your own browser.

> An independent fan tool, not affiliated with or endorsed by TSR, Wizards of the
> Coast, or any trademark holder. "B/X", "OSR", and similar terms are used
> descriptively. Dungeon symbols are CC0 by Mark Gosbell — see [CREDITS.md](CREDITS.md).

**▶ Live: https://marc-korte.github.io/osr-map-maker/**

Each person who opens the link gets their own private workspace; the working
map autosaves in that browser (localStorage), named snapshots live under
**Saved maps** in the sidebar, and **Save .json** / **Load** move maps between
browsers. Nothing is stored server-side. Undo/redo: Ctrl+Z / Ctrl+Y (macOS: Cmd+Z / Cmd+Shift+Z).
If another tab saves a different workspace, autosave pauses and preserves this
tab's edits in memory. Save a JSON backup before reloading the newer workspace.
This protects stale tabs; it does not merge simultaneous edits. Close older app
tabs when updating to a new release, and keep a JSON backup before upgrading.

## Using it

- **Workspace:** **Edit** holds tools and a searchable, labeled symbol palette;
  **Generate** holds generation options; **GM key** holds searchable private
  notes; **Map** holds dimensions, scale, layers and saved snapshots. On phones
  and small landscape screens, the bottom navigation opens these panels in a
  drawer. **Close**, Escape or the backdrop returns to the map.
- **Map style:** wilderness, dungeon and town maps share white paper, black ink,
  grayscale shading, serif location labels and plain numbered keys. Fields,
  roofs, water and rock use fine patterns or hatching. Existing saved maps use
  this style without regeneration. Colour is reserved for editor controls,
  selections and GM indicators; exported maps are entirely grayscale.
- **Navigation:** **Pan** moves the map without editing, including with one
  finger. Zoom and **Fit** stay beside the map. Fitted views adapt when the
  window changes size; manual zoom stays as you set it. **Project** contains
  backup/open/clear actions and **Help & touch controls**. Export and the
  GM/Player view switch remain visible on small screens.
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
- **Town:** generate a village, town or city with road-facing houses, a market,
  districts, countryside approaches, optional walls, and river crossings or a
  coastal harbor. **Street layout → Varied** chooses a seeded plan: organic
  lanes, a roadside high street, clustered districts, market spokes, or planned
  blocks. Each plan varies within its family. Pick a specific layout to explore
  that style; **Current layout** identifies the existing map. Changing this
  option takes effect on the next generation and preserves the current map.
  Streets and banks divide actual blocks, then properties receive street
  frontage, houses, outbuildings and enclosed courts, workyards or gardens.
  Commercial centers have compact fronts; outskirts have deeper garden plots.
  City size and building density change occupied property area and setbacks.
  Asymmetric settlement outlines replace the oval perimeter. Farmland forms
  groups of fields, orchards and pasture with access to countryside roads.
  Gates and complete dry approaches are planned before houses;
  tower footprints stay clear of water, street widths leave room beside banks,
  and bridge decks reach dry ground at both ends. Piers connect to their quays.
  Countryside roads continue to the visible map frame and end flush with it,
  so they read as routes off the map. Regenerate older maps to extend their roads.
  Open settlements label their approaches as roads. Select and move buildings, numbered locations and streets;
  linked bridges move with their street. Add buildings, keyed places, labels
  and extra streets, or erase items. A keyed location offers **Select building**
  to reach the house beneath its number. Location names and adventure leads
  stay in the private GM key; district and gate names are public. Buildings move
  independently of their fixed property boundaries; moving one outside its plot
  detaches that association. Outbuildings inherit a main building's GM privacy,
  and deleting or detaching a private parent preserves their privacy.
  Existing saved geometry stays intact; regenerate to use the new property plan.
- **Select/Move:** drag things, double-click (or Enter) to edit text, arrows
  nudge, `G` toggles GM-only, and `Del` deletes. Symbols, free labels and drawn
  lines support `Ctrl+C` / `Ctrl+V` / `Ctrl+D` to copy / paste at the cursor /
  duplicate. Available selection actions also have sidebar buttons for touch
  screens.
- **Location numbers:** keyed places use plain numbers rather than circles.
  Wilderness numbers fit inside their hex above the icon (below it when hex
  coordinates are enabled), with bold ink and a white glyph outline for contrast.
  Town numbers find space beside roofs.
  Numbers stay stable after deleting or reordering locations; gaps are intentional
  and new locations receive fresh numbers. If you delete a destination mentioned
  in a private note, update that note yourself. Older project files upgrade on
  load while preserving positions and notes; use the current app for v4 projects.
  Click a number or its site to select it. Generated wilderness roads cross
  open ground inside hexes and stay on land. Terrain and elevation guide the routes;
  ordinary terrain pictures move or shrink within their hex to leave room. Regenerate
  an existing map to adopt the new routes; hand-drawn lines keep their stored
  paths.
- **Generation logic:** wilderness bridges follow the visible road curves;
  shared road junctions stay on dry approaches and roads keep clear of river
  channels. New routes favor accessible terrain and gentle grades, with river-crossing
  costs and fixed landmark clearance. Solid main roads and finer dashed minor roads
  share the monochrome style; the legend identifies both. Direct stretches are allowed
  where the geography supports them. Terrain pictures may be omitted in crowded
  corridors; the underlying terrain remains in the project and its legend.
  Selecting and erasing a road follows its visible curve. Dungeon furniture leaves traversable routes, stairless dungeons
  have an outside entrance, and generated locks/portcullises include reachable
  keys or controls in the private GM key. Ordinary layouts can still contain
  intentional secret chambers. Regenerate to apply new layout rules; saved
  edits are not automatically moved.
- **GM / Player view:** GM-only items (and GM-only layers) disappear from the
  Player view, its key, and its PNG export. **Export PNG** is up to 300 dpi and
  never includes selection highlights.
- **Adventure keys:** generated dungeons have private room names, a shared
  faction and hook, and B/X room stocking. Choose **Room theme** (keep, crypt,
  temple or cavern hideout) and **Dungeon level** (depth 1–9).
  Generated wilderness settlements and landmarks are numbered, with private
  briefs covering services, residents, trouble, and rumors pointing to actual
  locations on the map. Town locations include services, contacts and adventure
  leads. Open **Room key / Site key · GM notes** to edit an entry, then
  **Export GM key (.md)** for a table reference. Wilderness and town briefs are
  system-neutral prompts. Dungeon keys give B/X monster references, group sizes,
  HD and morale, rolled treasure, and playable traps or specials. Use your B/X
  monster entries for combat details and resolve any listed magic-item bundles
  with the B/X item tables.
  Notes persist in autosave, snapshots and JSON backups, and edits support undo.
  Search matches names and notes. Inside the notes dialog, Ctrl/Cmd+S saves the
  note; Escape cancels it and returns focus to the location entry.
  **Save .json includes all GM secrets and notes**, even in Player view; share a
  Player PNG with players instead.
- **B/X dungeon stocking:** each room rolls independently: 1–2 on d6 means
  monsters, 3 a trap, 4 a special, and 5–6 an empty room. A second d6 indicates
  treasure on 1–3 for monsters, 1–2 for traps, or 1 for empty rooms. Specials
  have no automatic treasure. Small dungeons may vary substantially from the
  average; the generator does not force a quota or cycle through room types.
  Monster choices use original themed lists of B/X creatures, with group sizes
  adjusted for depth. A successful monster-room treasure check rolls one group
  cache using its lair treasure type, including any fixed extra gold, rather
  than multiplying a hoard by the number of creatures. Empty/trapped caches use
  the B/X depth tables; coin amounts, gem/jewellery values and magic bundles are
  rolled. A lair table can legitimately produce an empty cache. Creatures such
  as skeletons with Nil treasure do not acquire an invented hoard.
  Trap and cache markers are private and match the same stocking result as the
  key. A trapped strongbox has one combined cache marker; trigger coordinates
  match its actual position. Crowded rooms retain their contents in the key,
  using a wall cache or the numbered floor square instead of blocking a route.
  The entrance notes include wandering encounters, reaction and optional morale
  procedures. Theme/depth changes keep the floor plan and marker locations;
  regenerate to apply new contents. Existing saved or edited notes are preserved.
- **Dungeon presentation:** **Map → Rock shading** offers walls-only hatching,
  full rock, or no shading. New maps show a grid on the floors; **Grid
  background** extends it across the rock. Hidden secret doors become solid
  walls in Player view. Traps and secret doors start GM-only; reveal one with
  **GM only** / `G`.
- **Generate** keeps a title you typed, shows the seed it used (**Reuse** fills
  the Seed box), and is undoable. Reusing a seed with the same options and
  dimensions rebuilds the map. Each mode keeps its own seed, options and map.
  Wilderness defaults to **Coherent regions**: continuous ranges, foothills,
  lowland lakes, and temperate, arid or cold climates. **Classic patches** keeps
  the older terrain approach available. Rivers follow hexsides from high ground
  to water or the edge, joining as tributaries. Roads connect settlements on
  each landmass, avoid other sites and stay off lakes and seas. Island
  settlements may need boat travel; road/river crossings get bridges.
  Dungeons default to **Connected chambers**: compact groups of rectangular
  rooms, a larger hall, short connecting passages, galleries, columns and
  furnishings. **Scattered rooms** remains available. Corridors keep off room
  walls, with narrow, doored entrances;
  **Jaquays-style paths** ([after Jennell Jaquays](https://thealexandrian.net/wordpress/13085/roleplaying-games/xandering-the-dungeon))
  verifies actual mapped loops and adds two independent edge entrances. At least
  one loop remains usable without finding secret or one-way doors. GM-only
  letters pair a lower service passage (**A**), a discoverable narrow crawl
  (**B**) and a one-way chute (**C**), with real area destinations, clues, travel
  time and return rules in the **GM key**. Vertical routes are described off-map
  detours joining rooms on the current map, rather than additional generated
  floors. **Stairs: No** keeps the loops, entrances and crawl, while suppressing
  all vertical routes. Jaquays mode skips filler dead-end passages. Regenerate
  to apply the new layout; saved dungeon edits remain intact.

## Layout

```
index.html        # the app
icons.js          # bundled icon set (base64) — built by maps/build_icons_js.py
town.js           # original settlement geometry and canvas cartography
tests/town.test.cjs # Node tests for town geometry, layers and rendering contracts
tests/town-variety.test.cjs # Actual street topology, layout replay and spatial safety
tests/town-realism.test.cjs # Blocks, property use, compounds, farmland and bounded rendering
tests/town-import.test.cjs # Production land-record sanitation, ownership and privacy repair
tests/town-engine.test.cjs # Missing-engine edit guards, recovery and inherited privacy
tests/wilderness.test.cjs # Node tests for road/river geometry, bridges and climate
tests/dungeon.test.cjs # Node tests for dungeon routes, entrances and GM notes
tests/dungeon-stocking.test.cjs # B/X stocking, treasure, private markers and depth controls
tests/storage.test.cjs # Node tests for autosave conflicts and migration recovery
maps/             # Python icon/map generators (dev tooling, not part of the site)
.github/workflows/
  pages.yml       # deploys index.html + icons.js + town.js to GitHub Pages
```

## Develop locally

It's a static file — just open `index.html` in a browser. No build step, no
server needed.

Keep `index.html`, `icons.js` and `town.js` together. If the town engine cannot
load, a saved town remains in the project and shows recovery guidance; its map edit
actions pause until the engine is available again. JSON backups remain available.

Dev URL hooks: `?gw` / `?gd` / `?gt` generate a sample wilderness, dungeon or
town (add `&seed=abc` to pick one; that session never autosaves, so your own map is left
alone), `?dev` exposes the model as `window.MM`, and `?test` runs the in-page
invariant checks (result appears in the tab title; your autosave is restored
after, without writing test fixtures to autosave).

Run `node scripts/validate.cjs` to check app syntax, shipped scripts and all
town, wilderness, dungeon and autosave tests. The browser `?test` suite checks editor
integration and native canvas behavior. Node tests cover generator geometry,
stable key identities, route notes and cross-tab storage protection.

See [the release review](RELEASE_REVIEW.md) for fixed blockers, validation and
the remaining 1.0 checklist.

Editing the icon set (optional):

```
cd maps
python3 gen_hexicons.py        # (re)build hex terrain icons
python3 gen_stairs.py          # tapered dungeon stair glyph
python3 build_icons_js.py      # bundle icons/ -> ../icons.js
```

## Deploy (GitHub Pages)

Hosting is GitHub Pages, set up and automatic:

- Push to `main` → `.github/workflows/pages.yml` validates the app, then publishes
  `index.html` + `icons.js` + `town.js` to the Pages CDN. Failed validation blocks
  both Pages and Docker publishing. PRs also run the shared validation workflow.
- Pages is configured as **Settings → Pages → Source: GitHub Actions**.

The update loop is **edit the app → run the checks → commit → push.** The live
site updates in ~a minute. (A hard refresh / Ctrl-Shift-R bypasses browser cache.)

### Custom domain (optional)

Add a `CNAME` file containing your domain (e.g. `maps.example.com`), point a DNS
`CNAME` at `marc-korte.github.io`, and set the domain under Settings → Pages.

## Optional: self-host with Docker

Not needed — Pages covers it — but the repo still ships an nginx setup if you ever
want a private instance (e.g. on a NAS):

- `Dockerfile` + `default.conf` — `nginx:alpine` serving the three app files.
- `compose.yaml` — `docker compose up --build` → http://localhost:8089
- `deploy/compose.truenas.yaml` + `deploy/tailscale-serve.json` — Dockge/TrueNAS
  stack pulling the GHCR image (`ghcr.io/marc-korte/osr-map-maker`, built by
  `.github/workflows/docker-publish.yml`) behind a Tailscale sidecar.

If you don't want any of that, the `Dockerfile`, `compose*.yaml`, `default.conf`,
`deploy/`, and `docker-publish.yml` workflow can be deleted without affecting the
Pages site.
