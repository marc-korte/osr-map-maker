'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Town = require('../town.js');

// Exercise the shipping nested-Town sanitizer. Persistence/migration callers are
// covered separately in storage.test.cjs; this suite checks the new land records
// and their ownership links, without reimplementing normalization in the tests.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function source(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'production source exists: ' + start);
  return html.slice(a, b);
}
const context = vm.createContext({});
vm.runInContext(source('const MAX_KEY_NUMBER=', 'function keyGroups(') + '\n' + source('function sanitizeTown(', 'function migrateMap(') + '\nthis.sanitize = sanitizeTown;', context, { filename: 'production-town-sanitizer.js' });
const clone = value => structuredClone(value);
function sanitize(value) {
  const result = context.sanitize(value);
  // Return ordinary Node objects so assertion prototypes do not depend on vm.
  return result === null ? null : JSON.parse(JSON.stringify(result));
}
const box = (x, y, w = 30, h = 30) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
function fixture() {
  return {
    version: 1, width: 1000, height: 800, unit: 1, center: [500, 400], boundary: box(100, 100, 800, 600),
    plaza: { id: 'market', x: 500, y: 400, polygon: box(480, 380, 40, 40) },
    roads: [{ id: 'road-1', pts: [[150, 200], [800, 200]], width: 10, kind: 'street' }],
    buildings: [
      { id: 'house-1', x: 310, y: 230, polygon: box(300, 220, 20, 20), width: 20, depth: 20, angle: 0, roof: 0, parcelId: 'parcel-1', role: 'main', roadId: 'road-1', siteId: 'site-1', gm: false },
      { id: 'shed-1', x: 330, y: 270, polygon: box(325, 265, 10, 10), width: 10, depth: 10, angle: 0, roof: 1, parcelId: 'parcel-1', role: 'outbuilding', parentId: 'house-1', gm: false }
    ],
    sites: [{ id: 'site-1', x: 310, y: 230, n: 41, label: '41', name: 'Private contact', notes: 'A secret route leads to area 77.', buildingId: 'house-1', gm: true }],
    blocks: [{ id: 'block-1', polygon: box(250, 210, 200, 160), landUse: 'residential', density: .45 }],
    parcels: [{ id: 'parcel-1', blockId: 'block-1', roadId: 'road-1', polygon: box(280, 210, 80, 100), frontage: [[280, 210], [360, 210]], landUse: 'residential', buildingIds: ['house-1', 'shed-1'] }],
    yards: [{ id: 'yard-1', parcelId: 'parcel-1', polygon: box(285, 280, 65, 25), kind: 'garden', gm: false }],
    farmGroups: [{ id: 'farm-group-1', roadId: 'road-1', polygon: box(30, 30, 110, 100), access: [[140, 80], [150, 200]], gm: false }],
    farms: [{ id: 'field-1', groupId: 'farm-group-1', roadId: 'road-1', polygon: box(40, 40, 40, 70), access: [[80, 80], [140, 80], [150, 200]], crop: 0 }],
    water: [], bridges: [], gates: [], walls: [], districts: [], trees: [], docks: []
  };
}
function geometry(data) {
  const keep = object => Object.fromEntries(Object.entries(object).filter(([key]) => ['id', 'x', 'y', 'polygon', 'pts', 'frontage', 'access', 'width', 'depth', 'angle', 'n', 'name', 'notes', 'buildingId', 'parentId', 'parcelId', 'blockId', 'roadId', 'groupId', 'buildingIds', 'landUse', 'density', 'kind', 'role', 'crop'].includes(key)));
  return Object.fromEntries(['buildings', 'sites', 'roads', 'water', 'walls', 'bridges', 'farms', 'blocks', 'parcels', 'yards', 'farmGroups'].map(key => [key, (data[key] || []).map(keep)]));
}

test('generated land records round-trip without moving geometry or changing key identities', () => {
  const data = Town.generate('import-landuse-model', { layout: 'organic', water: 'none', size: 'town' });
  assert(data.blocks?.length > 1 && data.parcels?.length > 3 && data.yards?.length > 0 && data.farmGroups?.length > 0, 'the fixture contains actual generated land records');
  const before = geometry(data), clean = sanitize(JSON.parse(JSON.stringify(data)));
  assert(clean);
  assert.deepEqual(geometry(clean), before);
  for (const key of ['buildings', 'sites', 'blocks', 'parcels', 'yards', 'farmGroups', 'farms']) assert.deepEqual(clean[key].map(object => object.gm), data[key].map(object => !!object.gm), key + ' preserves effective privacy flags');
  assert.deepEqual(geometry(sanitize(clone(clean))), before, 'repeated load is geometrically idempotent');
});

test('older towns without land arrays preserve buildings, private prose, and stable numbers', () => {
  const data = fixture();
  for (const key of ['blocks', 'parcels', 'yards', 'farmGroups']) delete data[key];
  for (const building of data.buildings) for (const key of ['parcelId', 'parentId', 'role']) delete building[key];
  for (const farm of data.farms) for (const key of ['groupId', 'roadId', 'access']) delete farm[key];
  const before = geometry(data), clean = sanitize(data);
  assert.deepEqual(geometry(clean), before);
  for (const key of ['blocks', 'parcels', 'yards', 'farmGroups']) assert.deepEqual(clean[key], [], key + ' is an optional legacy list');
  assert.equal(clean.sites[0].n, 41);
  assert.equal(clean.sites[0].notes, 'A secret route leads to area 77.');
  assert.equal(clean.sites[0].gm, true);
});

test('missing or malformed optional lists and polygon records cannot survive as unsafe drawing inputs', () => {
  const types = fixture();
  Object.assign(types, { blocks: {}, parcels: 'not a list', yards: null, farmGroups: 7 });
  const empty = sanitize(types);
  for (const key of ['blocks', 'parcels', 'yards', 'farmGroups']) assert.deepEqual(empty[key], []);
  const data = fixture();
  for (const key of ['blocks', 'parcels', 'yards', 'farmGroups']) {
    data[key].push(null, { id: 'bad-' + key, polygon: [[0, 0], [1, 0], [NaN, 1]] }, { id: 'huge-' + key, polygon: Array.from({ length: 129 }, () => [0, 0]) });
  }
  const clean = sanitize(data);
  for (const key of ['blocks', 'parcels', 'yards', 'farmGroups']) assert.equal(clean[key].length, 1, key + ' retains its valid record only');
});

test('land lists and imported building membership are bounded before use', () => {
  const data = fixture();
  data.blocks = Array.from({ length: 3010 }, (_, i) => ({ ...clone(data.blocks[0]), id: 'bounded-block-' + i }));
  data.parcels = Array.from({ length: 3010 }, (_, i) => ({ ...clone(data.parcels[0]), id: 'bounded-parcel-' + i, blockId: 'bounded-block-0' }));
  data.yards = Array.from({ length: 3010 }, (_, i) => ({ ...clone(data.yards[0]), id: 'bounded-yard-' + i, parcelId: 'bounded-parcel-0' }));
  data.farmGroups = Array.from({ length: 270 }, (_, i) => ({ ...clone(data.farmGroups[0]), id: 'bounded-group-' + i }));
  data.parcels[0].buildingIds = Array(20000).fill('house-1');
  data.buildings.forEach(building => { building.parcelId = 'bounded-parcel-0'; });
  const clean = sanitize(data);
  for (const key of ['blocks', 'parcels', 'yards']) assert.equal(clean[key].length, 3000, key + ' has a finite import ceiling');
  assert.equal(clean.farmGroups.length, 256);
  assert.deepEqual(clean.parcels[0].buildingIds.slice().sort(), ['house-1', 'shed-1']);
});

test('ambiguous cross-category IDs are repaired without guessing a new ownership target', () => {
  const data = fixture();
  data.blocks[0].id = data.buildings[0].id = 'ambiguous-owner';
  data.parcels[0].blockId = 'ambiguous-owner'; data.buildings[1].parentId = 'ambiguous-owner';
  data.roads.push({ ...clone(data.roads[0]), id: 'road-1' });
  data.farmGroups.push({ ...clone(data.farmGroups[0]), id: 'farm-group-1' });
  const clean = sanitize(data), kinds = ['roads', 'buildings', 'sites', 'blocks', 'parcels', 'yards', 'farmGroups'];
  const ids = kinds.flatMap(key => clean[key].map(object => object.id));
  assert.equal(new Set(ids).size, ids.length, 'referenceable objects have globally unique IDs');
  assert(!clean.parcels[0].blockId && !clean.parcels[0].roadId);
  assert(!clean.buildings[1].parentId && !clean.buildings[0].roadId);
  assert(!clean.sites[0].buildingId, 'a key is not silently attached to one repaired owner');
  assert(!clean.farms[0].roadId && !clean.farms[0].groupId);
});

test('parcel membership is canonical and parent links cannot cross plots or form chains', () => {
  const data = fixture();
  data.parcels.push({ ...clone(data.parcels[0]), id: 'parcel-2', polygon: box(400, 210, 80, 100), frontage: [[400, 210], [480, 210]], buildingIds: ['house-1'] });
  data.buildings.push({ ...clone(data.buildings[0]), id: 'house-2', parcelId: 'parcel-2', siteId: undefined });
  data.buildings.push({ ...clone(data.buildings[1]), id: 'cross-plot', parentId: 'house-2' });
  data.buildings.push({ ...clone(data.buildings[1]), id: 'chained-shed', parentId: 'shed-1' });
  data.buildings.push({ ...clone(data.buildings[1]), id: 'self-parent', parentId: 'self-parent' });
  data.parcels[0].buildingIds = ['house-2', 'missing', 'house-2'];
  const clean = sanitize(data), byId = new Map(clean.buildings.map(building => [building.id, building]));
  assert.equal(byId.get('shed-1').parentId, 'house-1', 'a valid main/outbuilding relationship survives');
  for (const id of ['cross-plot', 'chained-shed', 'self-parent']) assert(!byId.get(id).parentId, id + ' cannot inherit an unrelated or recursive owner');
  for (const parcel of clean.parcels) assert.deepEqual(parcel.buildingIds.slice().sort(), clean.buildings.filter(building => building.parcelId === parcel.id).map(building => building.id).sort());
  assert.deepEqual(clean.parcels[1].buildingIds, ['house-2']);
});

test('repairing damaged property or parent records cannot reveal an inherited private outbuilding', () => {
  const privateCompound = () => {
    const data = fixture();
    data.buildings[0].gm = true;
    assert.equal(data.buildings[1].gm, false, 'the child relies on inherited rather than explicit privacy');
    assert.equal(Town.isBuildingVisible(data, data.buildings[1], 'player'), false);
    return data;
  };
  const valid = sanitize(privateCompound());
  assert.equal(valid.buildings[1].parentId, 'house-1');
  assert.equal(valid.buildings[1].gm, false, 'a valid relationship keeps independent child privacy editable');
  valid.buildings[0].gm = false;
  assert.equal(Town.isBuildingVisible(valid, valid.buildings[1], 'player'), true, 'revealing a valid main building still reveals its public child');
  for (const damage of ['lost-property', 'duplicate-parent', 'dropped-parent']) {
    const data = privateCompound();
    if (damage === 'lost-property') data.parcels[0].frontage = [[0, 0]];
    else if (damage === 'duplicate-parent') data.buildings.push({ ...clone(data.buildings[0]), gm: false });
    else data.buildings[0].polygon = [[0, 0]];
    const clean = sanitize(data), child = clean.buildings.find(building => building.id === 'shed-1');
    assert(child && !child.parentId, damage + ': the invalid association is removed');
    if (damage === 'lost-property') assert(!child.parcelId, 'the invalid property reference is removed too');
    assert.equal(child.gm, true, damage + ': inherited privacy becomes explicit before its owner is lost');
    assert.equal(Town.isBuildingVisible(clean, child, 'player'), false);
    assert.equal(Town.hitTest(clean, child.x, child.y, { view: 'player', keys: false, lines: false }), null, damage + ': the hidden child cannot be selected in Player view');
    assert.equal(sanitize(clone(clean)).buildings.find(building => building.id === child.id).gm, true, damage + ': a second load preserves the privacy repair');
  }
  const missing = privateCompound();
  missing.buildings.shift(); missing.buildings[0].gm = true;
  const child = sanitize(missing).buildings[0];
  assert.equal(child.gm, true, 'explicit privacy also survives an already missing owner');
});

test('dropping the sole private occupant preserves hidden property fences and garden rendering', () => {
  const privateProperty = () => {
    const data = fixture();
    data.buildings = data.buildings.slice(0, 1); data.buildings[0].gm = true;
    data.parcels[0].buildingIds = ['house-1']; data.parcels[0].gm = false;
    return data;
  };
  const polygonPath = polygon => JSON.stringify(polygon.map((point, i) => [i ? 'lineTo' : 'moveTo', ...point]).concat([['closePath']]));
  function renderedLand(data, view) {
    const calls = [], state = {}; let path = [];
    const ctx = new Proxy(state, {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          if (key === 'beginPath') path = [];
          if (['moveTo', 'lineTo', 'closePath', 'rect', 'arc'].includes(key)) path.push([key, ...args]);
          if (key === 'stroke' || key === 'clip') calls.push({ key, path: JSON.stringify(path) });
        };
      },
      set(target, key, value) { target[key] = value; return true; }
    });
    Town.draw(ctx, data, { view, symbols: false, keys: false, text: false });
    return {
      fence: calls.some(call => call.key === 'stroke' && call.path === polygonPath(data.parcels[0].polygon)),
      garden: calls.some(call => call.key === 'clip' && call.path === polygonPath(data.yards[0].polygon))
    };
  }
  const valid = sanitize(privateProperty());
  assert.equal(valid.parcels[0].gm, false, 'an intact private compound does not acquire irreversible parcel privacy');
  assert.deepEqual(renderedLand(valid, 'player'), { fence: false, garden: false }, 'the private main hides its public property decorations');
  valid.buildings[0].gm = false;
  assert.deepEqual(renderedLand(valid, 'player'), { fence: true, garden: true }, 'revealing the valid owner reveals its unchanged property');

  const damaged = privateProperty(); damaged.buildings[0].polygon = [[300, 220], [320, 220]];
  const clean = sanitize(damaged);
  assert.equal(clean.buildings.length, 0, 'only the malformed sole occupant is removed');
  assert.equal(clean.parcels.length, 1); assert.equal(clean.yards.length, 1);
  assert.deepEqual(clean.parcels[0].buildingIds, []);
  assert.equal(clean.parcels[0].gm, true, 'the formerly inherited property privacy becomes explicit before ownership is lost');
  assert.deepEqual(clean.yards[0].polygon, fixture().yards[0].polygon, 'the private garden geometry remains recoverable');
  assert.deepEqual(renderedLand(clean, 'player'), { fence: false, garden: false }, 'repair cannot expose either the property fence or its garden');
  assert.deepEqual(renderedLand(clean, 'gm'), { fence: true, garden: true }, 'the retained private land remains available to the GM');
  assert.deepEqual(renderedLand(sanitize(clone(clean)), 'player'), { fence: false, garden: false }, 'privacy survives another save/load normalization');
});

test('unsafe frontage and access paths are rejected while valid paths and geometry stay unchanged', () => {
  const data = fixture(), originalAccess = clone(data.farmGroups[0].access);
  for (const [index, frontage] of [undefined, [[0, 0]], [[0, 0], [0, 0]], [[0, 0], [1, Infinity]], [[0, 0], [1, 0], [2, 0]]].entries()) data.parcels.push({ ...clone(data.parcels[0]), id: 'bad-frontage-' + index, frontage });
  data.farms[0].access = [[0, 0], [NaN, 2]];
  data.farmGroups.push({ ...clone(data.farmGroups[0]), id: 'oversized-path', access: Array.from({ length: 129 }, (_, i) => [i, 0]) });
  data.yards.push({ ...clone(data.yards[0]), id: 'orphan-yard', parcelId: 'missing-parcel' });
  const clean = sanitize(data);
  assert.equal(clean.parcels.length, 1, 'a property requires a nonzero two-point frontage');
  assert.deepEqual(clean.farmGroups[0].access, originalAccess);
  assert(!clean.farms[0].access && !clean.farmGroups[1].access, 'unsafe optional polylines are removed');
  assert.deepEqual(clean.yards.map(yard => yard.id), ['yard-1'], 'orphan decorations do not survive their property');
});

test('land-use values, density, roles, and privacy flags normalize to safe finite values', () => {
  const data = fixture();
  data.blocks[0].landUse = { unexpected: true }; data.blocks[0].density = Infinity; data.blocks[0].gm = 'private';
  data.blocks.push({ ...clone(data.blocks[0]), id: 'low-density', density: -3 }, { ...clone(data.blocks[0]), id: 'high-density', density: 30 });
  data.parcels[0].landUse = 'not-a-land-use'; data.parcels[0].gm = 1;
  data.yards[0].kind = 'unrecognized'; data.yards[0].gm = 'private';
  data.buildings[0].role = { name: 'main' }; data.buildings[0].gm = 1;
  data.farmGroups[0].gm = 'private'; data.farms[0].gm = null;
  const clean = sanitize(data), allowed = new Set(['commercial', 'residential', 'craft', 'garden']);
  assert(clean.blocks.every(block => allowed.has(block.landUse) && Number.isFinite(block.density) && block.density >= 0 && block.density <= 1));
  assert(allowed.has(clean.parcels[0].landUse));
  assert(['garden', 'court', 'workyard'].includes(clean.yards[0].kind));
  assert.equal(clean.buildings[0].role, 'main');
  for (const key of ['blocks', 'parcels', 'yards', 'buildings', 'farmGroups', 'farms']) assert(clean[key].every(object => typeof object.gm === 'boolean'), key + ' uses explicit boolean privacy');
});
