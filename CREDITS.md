# Credits

## Dungeon symbols

The dungeon map symbols (`maps/icons/dungeon/`, bundled into `icons.js`) are from
**Classic Dungeon Map Symbols** by **Mark Gosbell**, released into the public
domain under **CC0 1.0**.

- Source: https://markgosbell.itch.io/classic-dungeon-map-symbols
- License: [CC0 1.0 Universal (public domain dedication)](https://creativecommons.org/publicdomain/zero/1.0/)

CC0 requires no attribution, but credit is given here with thanks.
The original bundled assets are retained; the app uses a grayscale rendering
cache that preserves their dimensions and transparency.

## Hex terrain icons

The wilderness hex **terrain** tiles (Forest, Mountains, Hills, Swamp, Desert,
Grassland, Evergreen, Jungle, Badlands, Volcano, etc. in `maps/icons/hex/`) are
the **Black & White Classic** free extra icon set from **Hexographer**
(Inkwell Ideas).

- Source: https://www.hexographer.com/extra-icon-sets/black-white-classic/

The wilderness **feature/settlement** icons (Castle, Town, Village, Tower, Keep,
City, Ruins, Cave, Tomb, Mine, StandingStones, bridges, roads, rivers, etc.) are
**original art**, generated programmatically by `maps/gen_hexicons.py` and
`maps/gen_stairs.py` in the black-ink-on-paper style of early-'80s B/X modules,
and are covered by this project's `LICENSE`.

## Application code

`index.html`, the original `town.js` settlement engine and the `maps/` generators
are © Marc Korte, licensed under the project `LICENSE`.

## Procedural design references

The adventure prompts are original, system-neutral writing. Design ideas were
informed by Courtney Campbell's [overview of *Tricks, Empty Rooms, and Basic
Trap Design*](https://hackslashmaster.blogspot.com/2011/02/on-tricks-empty-rooms-and-basic-trap.html),
Robert Conley's [*How to Make a Fantasy Sandbox*](https://batintheattic.blogspot.com/2009/08/how-to-make-fantasy-sandbox.html),
and the publisher descriptions of [*d30 Sandbox Companion*](https://www.newbigdragon.com/accessories.html)
and [*Tome of Adventure Design*](https://www.mythmeregames.com/products/tome-of-adventure-design-hardcover-book).
These informed interesting quiet rooms, visible hazard clues, negotiable
encounters, useful settlement services, and rumors that link real sites.

[Watabou's One Page Dungeon Generator](https://watabou.github.io/one-page-dungeon/)
by Oleg Dolya inspired readable silhouettes, compact chamber groups and keyed
locations. The public [TownGeneratorOS](https://github.com/watabou/TownGeneratorOS),
[pixel-dungeon](https://github.com/watabou/pixel-dungeon) and
[switch-hook](https://github.com/watabou/switch-hook) repositories were reviewed
for broad design lessons: reserve circulation before placing houses, connect
streets to gates and a market, use room graphs with deliberate loops, and grow
contiguous terrain regions. These ideas informed independent implementations;
the town plan does not use TownGeneratorOS's Voronoi implementation.

The public repository review did not locate the source for One Page Dungeon.
The Jaquays-style option draws on Jennell Jaquays' nonlinear exploration
principles, discussed in Justin Alexander's [dungeon design series](https://thealexandrian.net/wordpress/13085/roleplaying-games/xandering-the-dungeon)
and [level connections](https://thealexandrian.net/wordpress/13141/roleplaying-games/xandering-the-dungeon-addendum-dungeon-level-connections).
No code, assets, generated text or proprietary book tables from these references
were copied into this project.

Wilderness road composition was also informed by [Mike Schley's regional
cartography](https://www.behance.net/gallery/8091291/World-Regional-Maps),
[Justin Alexander's Phandalin hexmap](https://thealexandrian.net/wordpress/50981/roleplaying-games/phandalin-hexmap),
and [Dyson Logos's Autumn Lands](https://dysonlogos.blog/2025/01/15/the-autumn-lands-hex-map-f/):
roads connect useful destinations through terrain and passes, and map symbols
represent regions rather than literal barriers. No artwork or source code from
these maps is included.
