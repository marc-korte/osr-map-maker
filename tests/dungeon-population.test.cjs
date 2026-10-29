'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the shipped inline generator and population helpers. UI, storage and
// canvas measurement are mocked; these checks make no browser/raster claims.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `production source section: ${start}`);
  return html.slice(a, b);
}
function declaration(name) {
  const match = html.match(new RegExp(`const ${name}=[^\\n]+`));
  assert.ok(match, `production declaration: ${name}`);
  return match[0];
}
const context = vm.createContext({ window: {}, console, Math, document: { getElementById: () => null } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'icons.js'), 'utf8'), context);
vm.runInContext(`
const ICONS=window.ICONS,BY={dungeon:Object.fromEntries(ICONS.dungeon.map(i=>[i.n,i]))};
${['DUN_OPTS_DEF','PPI','DUN_CELL','WILD_HEX','LEG_W','WILD_MIN','MODE_FIELDS','modeFields','mapScale'].map(declaration).join('\n')}
${section('const SCHEMA_V=', '// Stable numbers identify')}
Object.assign(M,{mode:'dun',title:'Population fixture',dunOpts:{}});
let _pre=null;
const noop=()=>{},beginChange=noop,clearSel=noop,render=noop,save=noop,commitChange=noop,buildTools=noop,maybeFit=noop,toast=noop;
const titleIsAuto=()=>false;
${declaration('MAX_KEY_NUMBER')}
${section('function validKeyNumber(', '// generate-option defaults')}
const MAP_STYLE={labelFont:'Georgia,serif'},ctx={save:noop,restore:noop,measureText:text=>({width:String(text).length*6})};
${section('function layout(){', '// ---------- primitives ----------')}
${section('function pageW(', 'function fitCanvas(){')}
${section('function fmtScale(', '// key box with a FIXED footprint')}
${section('function lyr(', '// squared distance')}
${section('const legendInMarginDun=', '// what the dungeon key lists')}
${section('const legendDunNames=', 'function legendDun(')}
${section('let _rng=Math.random;', '// features read as landmarks')}
${section('function dnm(', '// hex distance')}
${section('function makeHeap(', 'function intoHex(')}
${section('const isSecretDoor=', '// symbol snap:')}
${section('const DUN_THEMES=', 'function updateRoomKey(')}
${section('const hexId=', 'function selDesc(')}
${section('function gmRoomKeyText(){', 'function exportRoomKey(){')}
${section('function validateMap(', 'function afterLoad(){')}
${section('let lastDunRooms=', 'function mapIsEmpty(){')}
window.generate=(seed,options={})=>{
  const {cols=28,rows=36,...opts}=options;
  M.cols=M.colsD=cols;M.rows=M.rowsD=rows;M.view='gm';M.showLegend=true;
  M.dunOpts={...DUN_OPTS_DEF,...opts};genDun(seed);
  const population={},stock=makeDungeonStock(seed,lastDunRooms,population);
  const result=JSON.parse(JSON.stringify({model:M,rooms:lastDunRooms,routes:lastDunRoutes,layout:layout(),stock,population,gmText:gmRoomKeyText()}));
  M.view='player';result.playerText=gmRoomKeyText();M.view='gm';
  return result;
};
window.population=(seed,rooms,stock,cells,opts={})=>{
  M.dunOpts={...DUN_OPTS_DEF,...opts};M.cells=cells;
  const before=JSON.stringify([rooms,stock,cells]);
  const population=makeDungeonPopulation(seed,rooms,stock,cells);
  return {population,unchanged:before===JSON.stringify([rooms,stock,cells])};
};
window.stock=(seed,rooms,cells,opts={})=>{
  M.dunOpts={...DUN_OPTS_DEF,...opts};M.cells=cells;
  const population={},stock=makeDungeonStock(seed,rooms,population);
  return {population,stock};
};
window.syntheticKeys=(seed,rooms,stock,cells,opts={},order=rooms.map((_,i)=>i),numbers=order.map((_,i)=>i+1))=>{
  M.cols=M.colsD=Math.max(8,...rooms.map(r=>r.x+r.w+2));M.rows=M.rowsD=Math.max(8,...rooms.map(r=>r.y+r.h+2));
  M.view='gm';M.dunOpts={...DUN_OPTS_DEF,...opts};M.cells=cells;M.labels=[];
  const L=layout();M.syms=order.map((i,n)=>({type:'key',n:numbers[n],x:L.ox+(rooms[i].x+.5)*L.cell,y:L.oy+(rooms[i].y+.5)*L.cell}));
  const population=makeDungeonPopulation(seed,rooms,stock,cells);
  stockDungeonKeys(seed,rooms,order,stock,population);
  return {population,stock,keys:dungeonKeys(),text:gmRoomKeyText()};
};
window.readSaved=model=>{
  Object.assign(M,JSON.parse(JSON.stringify(model)),{view:'gm'});
  const before=JSON.stringify(M),text=gmRoomKeyText();
  M.view='player';const player=gmRoomKeyText();M.view='gm';
  return {text,player,unchanged:before===JSON.stringify(M)};
};
window.migrate=model=>{
  const copy=JSON.parse(JSON.stringify(model)),error=validateMap(copy),dropped=migrateMap(copy);
  return {model:copy,error,dropped};
};
window.populationRng=()=>{
  const saved=_rng;try{_rng=mulberry32(8675309);const expected=mulberry32(8675309)();
    makeDungeonPopulation('population-isolation',lastDunRooms,makeDungeonStock('population-isolation',lastDunRooms),M.cells);
    return _rng()===expected;
  }finally{_rng=saved;}
};
`, context, { filename: 'production-dungeon-population.js' });
const plain = value => JSON.parse(JSON.stringify(value));
const call = (name, ...args) => plain(context.window[name](...args));
const cache = new Map();
function generate(seed, options = {}) {
  const key = JSON.stringify([seed, options]);
  if (!cache.has(key)) cache.set(key, call('generate', seed, options));
  return cache.get(key);
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function roomCells(rooms) {
  const cells = {};
  for (const room of rooms) for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) cells[`${x},${y}`] = 'floor';
  return cells;
}
function line(cells, a, b) {
  assert(a[0] === b[0] || a[1] === b[1], 'synthetic corridors have explicit orthogonal floor cells');
  const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
  for (let x = a[0], y = a[1]; ; x += dx, y += dy) { cells[`${x},${y}`] = 'floor'; if (x === b[0] && y === b[1]) return; }
}
function chain(count = 8) {
  const rooms = Array.from({ length: count }, (_, i) => ({ x: i * 5, y: 2, w: 3, h: 3, role: ['guard','storage','rest','shrine','archive','hall','gallery','guard'][i % 8] }));
  const cells = roomCells(rooms);
  for (let i = 1; i < count; i++) line(cells, [rooms[i - 1].x + 2, 3], [rooms[i].x, 3]);
  return { rooms, cells };
}
const forcedStock = kinds => kinds.map(kind => ({ kind, level: 1, contentRoll: { monster: 1, trap: 3, special: 4, empty: 5 }[kind], treasureRoll: kind === 'special' ? null : 6, hasTreasure: false, loot: null, monster: kind === 'monster' ? { name: 'Skeleton', hd: '1', tier: 1, count: 3, morale: 12, treasureType: 'Nil', themes: ['crypt','temple'] } : null }));

// Derive room adjacency from the actual floor, contracting room interiors and
// stopping at any intervening room. Proposed MST edges and nearest centers are
// deliberately unavailable to this proof.
function floorRoomGraph(rooms, cells) {
  const owner = new Map();
  for (const [i, room] of rooms.entries()) for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (cells[`${x},${y}`] === 'floor') owner.set(`${x},${y}`, i);
  const adjacency = rooms.map(() => new Set());
  for (const [i, room] of rooms.entries()) {
    const queue = [], seen = new Set();
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (cells[`${x},${y}`] === 'floor') { const k = `${x},${y}`; queue.push(k); seen.add(k); }
    for (let at = 0; at < queue.length; at++) {
      const [x, y] = queue[at].split(',').map(Number);
      for (const [dx, dy] of DIRS) {
        const k = `${x + dx},${y + dy}`;
        if (cells[k] !== 'floor' || seen.has(k)) continue;
        seen.add(k);
        const other = owner.get(k);
        if (other !== undefined && other !== i) { adjacency[i].add(other); continue; }
        queue.push(k);
      }
    }
  }
  return adjacency;
}
function assertConnectedTerritories(population, rooms, cells) {
  const graph = floorRoomGraph(rooms, cells), claimed = new Set();
  for (const faction of population.factions) {
    assert(faction.rooms.length > 0 && faction.rooms.includes(faction.home), 'a faction has a real home within its territory');
    const allowed = new Set(faction.rooms), seen = new Set([faction.home]), queue = [faction.home];
    for (const current of queue) for (const next of graph[current]) if (allowed.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
    assert.equal(seen.size, allowed.size, 'every faction territory is connected through actual floor without crossing another faction room');
    for (const i of faction.rooms) {
      assert(Number.isInteger(i) && i >= 0 && i < rooms.length);
      assert(!claimed.has(i), 'room territories do not overlap');claimed.add(i);
      assert.equal(population.roomOwners[i], faction.id, 'territory and per-room ownership agree');
    }
  }
  for (const [i, owner] of population.roomOwners.entries()) if (owner !== null) assert(population.factions.some(f => f.id === owner && f.rooms.includes(i)), 'every owned room belongs to an actual faction');
}

const expectedContents = [
  ['monster',1,6,false],['empty',5,3,false],['monster',1,6,false],['empty',5,6,false],['empty',6,5,false],['empty',6,6,false],
  ['special',4,null,false],['empty',6,6,false],['empty',6,5,false],['special',4,null,false],['monster',2,3,true],['trap',3,1,true],
  ['monster',2,1,true],['monster',2,5,false],['monster',1,3,true],['trap',3,4,false],['monster',1,1,true],['empty',6,2,false],
  ['empty',5,5,false],['special',4,null,false],['trap',3,3,false],['monster',2,5,false],['special',4,null,false],['empty',6,1,true]
];
const contents = stock => stock.map(s => [s.kind, s.contentRoll, s.treasureRoll, s.hasTreasure]);
const undead = new Set(['Skeleton','Ghoul','Wight','Wraith','Mummy','Vampire']);
const integration = [
  ['population-keep', { layout: 'compact', theme: 'keep', jaquay: 'yes', level: 2 }],
  ['population-crypt', { layout: 'compact', theme: 'crypt', jaquay: 'yes', level: 4 }],
  ['population-cavern', { layout: 'scattered', theme: 'cavern', jaquay: 'yes', level: 3 }],
  ['population-tall', { cols: 12, rows: 48, layout: 'compact', theme: 'temple', jaquay: 'yes', level: 2 }],
  ['population-tiny', { cols: 8, rows: 8, layout: 'compact', roomSize: 'small', density: 'packed', stairs: 'no', theme: 'crypt' }]
];
function residentsAgree(map) {
  const { stock, population } = map, factions = new Map(population.factions.map(f => [f.id, f]));
  assert.equal(population.roomOwners.length, stock.length);
  assert.equal(population.roles.length, stock.length);
  assert.equal(factions.size, population.factions.length, 'faction identifiers are unique');
  for (const [i, entry] of stock.entries()) {
    assert.equal(entry.factionId, population.roomOwners[i], 'resolved room stock agrees with its territorial owner');
    assert.equal(entry.role, population.roles[i]);
    if (entry.kind !== 'monster') { assert.equal(entry.monster, null, 'a room duty never adds a resident to an empty, special or trapped room'); continue; }
    const faction = factions.get(entry.factionId);
    assert(faction && faction.rooms.includes(i), 'every resident group belongs to a real territorial faction');
    assert(faction.roster.includes(entry.monster.name), 'room occupants come from their own faction roster');
    assert.equal(entry.monster.name, faction.monster.name, 'a faction uses a consistent B/X creature reference');
    assert.equal(entry.monster.hd, faction.monster.hd);
    assert.equal(entry.monster.morale, faction.monster.morale);
  }
  for (const faction of factions.values()) {
    const inhabitants = stock.filter(s => s.kind === 'monster' && s.factionId === faction.id);
    assert(inhabitants.length > 0, 'a faction is rooted in at least one actual occupied room');
    assert(faction.roster.every(name => inhabitants.some(s => s.monster.name === name)), 'the declared roster does not invent unseen resident species');
  }
}

test('population planning preserves the pre-change B/X contents and treasure-presence rolls exactly', () => {
  const { rooms, cells } = chain(24);
  for (const options of [{ theme: 'keep', level: 1 }, { theme: 'crypt', level: 9 }, { theme: 'cavern', level: 4 }]) {
    const { stock } = call('stock', 'bx-population-rolls', rooms, cells, options);
    assert.deepEqual(contents(stock), expectedContents, 'faction homes, duties and patrols cannot upgrade an empty room or force a treasure result');
  }
});

test('the independent floor proof stops at intervening rooms and rejects disconnected territory', () => {
  const { rooms, cells } = chain(3), graph = floorRoomGraph(rooms, cells);
  assert.deepEqual([...graph[0]], [1]);
  assert.deepEqual([...graph[2]], [1]);
  assert.throws(() => assertConnectedTerritories({ factions: [{ id: 'a', home: 0, rooms: [0,2] }, { id: 'b', home: 1, rooms: [1] }], roomOwners: ['a','b','a'] }, rooms, cells), /connected through actual floor/);
});

test('disconnected actual floor overrides proposed neighboring-room metadata', () => {
  const { rooms, cells } = chain(8);
  rooms.forEach((room, i) => { room.neighbors = [(i + 1) % rooms.length]; });
  delete cells['18,3'];
  const stock = forcedStock(['monster','empty','empty','empty','empty','empty','empty','monster']);
  const { population, unchanged } = call('population', 'split-floor', rooms, stock, cells, { theme: 'crypt' });
  assert(unchanged, 'planning does not rewrite caller geometry, contents or proposed links');
  assertConnectedTerritories(population, rooms, cells);
  assert(population.roomOwners[0] && population.roomOwners[7]);
  assert.notEqual(population.roomOwners[0], population.roomOwners[7], 'residents on disconnected floors cannot share one connected territorial claim');
});

test('faction territories follow a folded corridor instead of nearest room centers', () => {
  const rooms = [[0,0],[5,0],[10,0],[0,8],[5,8],[10,8]].map(([x,y]) => ({ x, y, w: 3, h: 3 })), cells = roomCells(rooms);
  for (const [a,b] of [[[2,1],[5,1]],[[1,1],[1,9]],[[2,9],[5,9]],[[7,9],[10,9]],[[11,1],[11,9]]]) line(cells, a, b);
  const graph = floorRoomGraph(rooms, cells);
  assert(!graph[1].has(2) && graph[0].has(3), 'the nearest upper rooms have no direct floor link, while the long vertical corridor is real');
  const { population } = call('population', 'folded-floor', rooms, forcedStock(['empty','monster','monster','empty','empty','empty']), cells, { theme: 'crypt' });
  assertConnectedTerritories(population, rooms, cells);
  assert.notEqual(population.roomOwners[1], population.roomOwners[2], 'the two occupied homes remain distinct');
});

test('an unoccupied dungeon has no invented factions, opponents or wandering residents', () => {
  const { rooms, cells } = chain(6), stock = forcedStock(['empty','trap','empty','special','empty','empty']);
  const { population } = call('population', 'no-residents', rooms, stock, cells, { theme: 'crypt' });
  assert.deepEqual(population.factions, []);
  assert.equal(population.relation, null);
  assert(population.roomOwners.every(owner => owner === null));
  const keyed = call('syntheticKeys', 'no-residents', rooms, stock, cells, { theme: 'crypt' });
  assert(!/^Encounter:/m.test(keyed.text));
  assert(!/^[1-6]:\s*\d+\s*×/m.test(keyed.text), 'a wandering list cannot summon a catalog creature with no resident group');
});

test('one occupied room supplies one real faction without manufacturing a rival', () => {
  const { rooms, cells } = chain(8), stock = forcedStock(['empty','empty','monster','empty','empty','empty','empty','empty']);
  for (const theme of ['crypt','keep']) {
    const { population } = call('population', 'one-resident', rooms, stock, cells, { theme });
    assert.equal(population.factions.length, 1);
    assert.equal(population.relation, null);
    assert.equal(population.factions[0].home, 2);
    assert(!/\brival\b|\bother band\b|\bother faction\b/i.test(population.factions[0].motive + ' ' + population.factions[0].leverage), 'a solitary faction has no invented opponent in its goal or bargaining terms');
    assertConnectedTerritories(population, rooms, cells);
  }
  assert.deepEqual(stock.map(s => s.kind), ['empty','empty','monster','empty','empty','empty','empty','empty']);
});

test('population planning is deterministic and leaves its input and geometry RNG untouched', () => {
  const { rooms, cells } = chain(8), stock = forcedStock(['monster','empty','trap','empty','special','monster','empty','empty']);
  const a = call('population', 'population-replay', rooms, stock, cells, { theme: 'crypt', level: 3 });
  const b = call('population', 'population-replay', rooms, stock, cells, { theme: 'crypt', level: 3 });
  assert.deepEqual(a, b);assert(a.unchanged);
  assert.equal(call('populationRng'), true, 'neither territorial planning nor its stock resolution consumes the map-geometry stream');
});

for (const [seed, options] of integration) test(`${seed}: factions occupy connected territories on the actual generated floor`, () => {
  const map = generate(seed, options);
  assertConnectedTerritories(map.population, map.rooms, map.model.cells);
  residentsAgree(map);
});

function keyedRooms(map) {
  const { model, rooms, layout: L } = map;
  return new Map(model.syms.filter(s => s.type === 'key').map(key => {
    const x = Math.floor((key.x - L.ox) / L.cell), y = Math.floor((key.y - L.oy) / L.cell);
    const i = rooms.findIndex(room => x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h);
    assert(i >= 0, 'each area number belongs to an actual room');
    return [key.n, { key, i }];
  }));
}
function areaReferences(text) {
  return [...text.matchAll(/\bareas?\s+(\d+(?:(?:\s*,\s*|\s+and\s+)\d+)*)/gi)].flatMap(match => match[1].match(/\d+/g).map(Number));
}
function assertReferences(text, keys) {
  const numbers = new Set(keys.map(key => key.n)), refs = areaReferences(text);
  assert(refs.length > 0, 'the populated brief contains usable keyed destinations');
  for (const n of refs) assert(numbers.has(n), `area ${n} resolves to an existing stable key`);
}

test('crypt populations remain entirely undead across shallow, middle and deepest levels', () => {
  for (const level of [1,4,9]) {
    const { rooms, cells } = chain(24), map = call('stock', 'bx-population-rolls', rooms, cells, { theme: 'crypt', level });
    assert(map.population.factions.length > 0);
    for (const faction of map.population.factions) {
      assert.equal(faction.kind, 'undead');
      assert(faction.roster.every(name => undead.has(name)), 'the crypt roster cannot fall back to unrelated deep-level creatures');
    }
    for (const stock of map.stock.filter(s => s.kind === 'monster')) assert(undead.has(stock.monster.name));
    residentsAgree(map);
  }
});

test('faction motives, resources, bargaining terms, signs and relations reach the playable private key', () => {
  for (const [seed, options] of integration.slice(0, 3)) {
    const map = generate(seed, options), factions = new Map(map.population.factions.map(f => [f.id, f])), keys = keyedRooms(map);
    const byRoom = new Map([...keys.values()].map(({ key, i }) => [i, key]));
    for (const faction of factions.values()) {
      for (const field of ['motive','sustenance','leverage','sign']) {
        assert(typeof faction[field] === 'string' && faction[field].length >= 12, `a faction has concrete ${field}`);
        assert(map.gmText.includes(faction[field]), `the GM can use the faction's ${field} without hidden generation metadata`);
      }
      assert(faction.rooms.includes(faction.resourceRoom), 'supplies or binding resources occupy an actual room in the faction territory');
      assert(map.gmText.includes('Home: area ' + byRoom.get(faction.home).n));
      assert(map.gmText.includes('Kept in area ' + byRoom.get(faction.resourceRoom).n));
    }
    const relation = map.population.relation;
    if (factions.size > 1) {
      assert(relation && relation.a !== relation.b && factions.has(relation.a) && factions.has(relation.b));
      assert(relation.detail.length >= 20 && map.gmText.includes(relation.detail), 'the relationship gives the GM a playable situation');
    } else assert.equal(relation, null);
    assert.equal(map.playerText, '', 'faction intelligence remains private in Player view');
  }
});

test('architectural room purposes do not turn empty duty spaces into extra encounters', () => {
  const { rooms, cells } = chain(8), stock = forcedStock(rooms.map(() => 'empty'));
  const keyed = call('syntheticKeys', 'empty-room-roles', rooms, stock, cells, { theme: 'crypt' });
  const purposes = keyed.keys.map(key => key.notes.split('\n\n').find(part => part.startsWith('Room purpose:')));
  assert(purposes.every(Boolean));
  assert(new Set(purposes).size >= 6, 'watch, storage, rest, shrine and other architectural roles give different room purposes');
  assert.deepEqual(keyed.population.roles, rooms.map(room => room.role), 'room use follows the architecture already present');
  for (const key of keyed.keys) {
    assert(key.notes.startsWith('B/X contents: Empty.'));
    assert(!/^Encounter:|^Duty:/m.test(key.notes), 'an unoccupied watch post has no unrolled watch crew');
  }
  assert(keyed.stock.every(s => s.kind === 'empty' && s.monster === null && !s.hasTreasure));
});

test('each wandering entry uses an actual resident group and stays within that faction territory', () => {
  for (const [seed, options] of integration) {
    const map = generate(seed, options), keys = keyedRooms(map), byRoom = new Map([...keys.values()].map(({ key, i }) => [i, key.n]));
    const rows = [...map.gmText.matchAll(/^([1-6]): (\d+) × (.+?) \(HD (.+?), ML (\d+)\) — (.+?); from area (\d+), within areas ([\d, ]+)\.$/gm)];
    assert.equal(rows.length, map.stock.some(s => s.kind === 'monster') ? 6 : 0);
    const represented = new Set();
    for (const row of rows) {
      const source = keys.get(Number(row[7]));assert(source, 'a patrol names an existing source area');
      const resident = map.stock[source.i], faction = map.population.factions.find(f => f.id === resident.factionId);
      assert.equal(resident.kind, 'monster');
      assert.equal(row[3], resident.monster.name);
      assert.equal(row[4], resident.monster.hd);
      assert.equal(Number(row[5]), resident.monster.morale);
      assert(Number(row[2]) >= 1 && Number(row[2]) <= resident.monster.count, 'a patrol is drawn from, rather than added to, its source group');
      assert.equal(row[6], faction.name);represented.add(faction.id);
      assert.deepEqual(row[8].match(/\d+/g).map(Number).sort((a,b) => a-b), faction.rooms.map(i => byRoom.get(i)).sort((a,b) => a-b), 'the wandering territory names the same actual owned rooms');
    }
    for (const faction of map.population.factions) assert(represented.has(faction.id), 'each resident faction has a runnable patrol entry');
  }
});

test('population references follow the keyed room order instead of raw room indices', () => {
  const { rooms, cells } = chain(8), seed = 'bx-population-rolls', opts = { theme: 'crypt' };
  const { stock } = call('stock', seed, rooms, cells, opts), order = [7,0,5,2,6,1,4,3];
  const keyed = call('syntheticKeys', seed, rooms, stock, cells, opts, order), numbers = keyed.keys.map(key => key.n);
  assertReferences(keyed.text, keyed.keys);
  for (const faction of keyed.population.factions) {
    assert(keyed.text.includes('Home: area ' + numbers[order.indexOf(faction.home)]));
    assert(keyed.text.includes('Kept in area ' + numbers[order.indexOf(faction.resourceRoom)]));
  }
});

test('mindless Skeleton factions have conflicting bindings rather than political accusations or talks', () => {
  const { rooms, cells } = chain(6), stock = forcedStock(rooms.map(() => 'monster')), seed = 'review-skeleton-8';
  const { population } = call('population', seed, rooms, stock, cells, { theme: 'crypt', level: 1 });
  assert.deepEqual(population.factions.map(f => f.monster.name), ['Skeleton','Skeleton']);
  const relation = population.relation, factions = new Map(population.factions.map(f => [f.id, f]));
  assert(relation && relation.a !== relation.b && factions.has(relation.a) && factions.has(relation.b), 'the binding conflict references the two actual factions');
  assert(!/negotiat|talks|accus/i.test(relation.detail), 'mindless sentries do not make political accusations or negotiate a compact');
  assert(/orders?|seals?|rites?|binding/i.test(relation.detail), 'the conflict names a usable ritual or watch constraint');
  for (const faction of factions.values()) assert(/do not converse|do not negotiate|do not accept bribes/.test(faction.leverage), 'the offered lever respects mindless undead behavior');
  const keyed = call('syntheticKeys', seed, rooms, stock, cells, { theme: 'crypt', level: 1 });
  assert(keyed.text.includes(relation.detail));
  for (const faction of factions.values()) assert(keyed.text.includes(faction.name));
  assertReferences(keyed.text, keyed.keys);
});

test('legacy key migration and reading preserve handwritten inhabitants instead of restocking them', () => {
  const legacy = plain(generate(...integration[0]).model);
  legacy.v = 3;delete legacy.dunOpts;
  const keys = legacy.syms.filter(s => s.type === 'key');
  keys.forEach((key, i) => { key.name = 'Old chapel ' + i; key.notes = 'Handwritten: goblins shelter here; preserve this old claim.\n\nKeep my private clue ' + i + '.'; });
  const expected = keys.map(({ n, name, notes }) => ({ n, name, notes })), migrated = call('migrate', legacy);
  assert.equal(migrated.error, null);assert.equal(migrated.dropped, 0);
  assert.deepEqual(migrated.model.syms.filter(s => s.type === 'key').map(({ n, name, notes }) => ({ n, name, notes })), expected);
  const read = call('readSaved', migrated.model);
  assert(read.unchanged && read.text.includes(expected[0].notes));
  assert.equal(read.player, '');
});

test('one packed 48-square Jaquays map keeps bounded population and access notes through JSON migration', () => {
  const map = generate('population-large-packed', { cols: 48, rows: 48, layout: 'compact', roomSize: 'small', density: 'packed', jaquay: 'yes', theme: 'crypt', level: 5 });
  const keys = map.model.syms.filter(s => s.type === 'key');
  assert(keys.length >= 12 && map.routes.length > 0, 'the fixture exercises a large populated map with actual Jaquays routes');
  assert(keys.every(key => key.notes.length <= 8000), 'population briefs leave room for the final private route and lock instructions');
  assertReferences(map.gmText, keys);
  const important = keys.flatMap(key => key.notes.split('\n\n').filter(part => /^(?:Route\s|Access\sL\d+|Key\sL\d+|Mapped loop:|Entrance:)/.test(part)).map(text => ({ n: key.n, text })));
  assert(important.some(part => /^Route\s/.test(part.text)) && important.some(part => /^Access\sL\d+/.test(part.text)), 'the fixture includes both route destinations and final lock-access notes');
  const migrated = call('migrate', JSON.parse(JSON.stringify(map.model)));
  assert.equal(migrated.error, null);assert.equal(migrated.dropped, 0);
  const restored = new Map(migrated.model.syms.filter(s => s.type === 'key').map(key => [key.n, key]));
  assert.deepEqual([...restored.values()].map(key => [key.n,key.notes]), keys.map(key => [key.n,key.notes]), 'sanitization does not truncate generated content on save/load');
  for (const part of important) assert(restored.get(part.n).notes.includes(part.text), 'the last route/access prose survives intact');
});
