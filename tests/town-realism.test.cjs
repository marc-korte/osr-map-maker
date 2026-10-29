'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Town = require('../town.js');

const layouts = ['organic', 'linear', 'clustered', 'radial', 'planned'];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const area = polygon => Math.abs(polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const center = polygon => polygon.reduce((sum, p) => [sum[0] + p[0] / polygon.length, sum[1] + p[1] / polygon.length], [0, 0]);
function pointSegmentGap(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], den = dx * dx + dy * dy;
  const t = den ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den)) : 0;
  return distance(p, mix(a, b, t));
}
const edgeGap = (p, polygon) => Math.min(...polygon.map((a, i) => pointSegmentGap(p, a, polygon[(i + 1) % polygon.length])));
function inside(p, polygon, tolerance = 1e-7) {
  if (edgeGap(p, polygon) <= tolerance) return true;
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
const strictlyInside = (p, polygon, tolerance) => inside(p, polygon) && edgeGap(p, polygon) > tolerance;
function crossing(a, b, c, d) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const aa = cross(a, b, c), ab = cross(a, b, d), ba = cross(c, d, a), bb = cross(c, d, b);
  return aa * ab < -1e-8 && ba * bb < -1e-8;
}
function segmentGap(a, b, c, d) {
  return crossing(a, b, c, d) ? 0 : Math.min(pointSegmentGap(a, c, d), pointSegmentGap(b, c, d), pointSegmentGap(c, a, b), pointSegmentGap(d, a, b));
}
function interiorsOverlap(a, b, tolerance = 1e-4) {
  const box = polygon => [Math.min(...polygon.map(p => p[0])), Math.min(...polygon.map(p => p[1])), Math.max(...polygon.map(p => p[0])), Math.max(...polygon.map(p => p[1]))];
  const x = box(a), y = box(b);
  if (x[2] <= y[0] + tolerance || y[2] <= x[0] + tolerance || x[3] <= y[1] + tolerance || y[3] <= x[1] + tolerance) return false;
  if (a.some(p => strictlyInside(p, b, tolerance)) || b.some(p => strictlyInside(p, a, tolerance))) return true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) if (crossing(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  // Identical or partly coincident polygons can overlap without any strictly
  // interior vertex. Probe both sides of edges; a shared dividing edge alone
  // must not count as overlapping land.
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], length = distance(p, q);
    if (!length) continue;
    const m = mix(p, q, .5);
    for (const side of [-1, 1]) {
      const probe = [m[0] - (q[1] - p[1]) / length * tolerance * 3 * side, m[1] + (q[0] - p[0]) / length * tolerance * 3 * side];
      if (strictlyInside(probe, a, tolerance) && strictlyInside(probe, b, tolerance)) return true;
    }
  }
  return false;
}
function contained(inner, outer, tolerance) {
  for (let i = 0; i < inner.length; i++) {
    if (![0, .25, .5, .75].every(t => inside(mix(inner[i], inner[(i + 1) % inner.length], t), outer, tolerance))) return false;
    for (let j = 0; j < outer.length; j++) if (crossing(inner[i], inner[(i + 1) % inner.length], outer[j], outer[(j + 1) % outer.length])) return false;
  }
  return true;
}
function roadGap(polygon, road) {
  if (road.pts.some(p => strictlyInside(p, polygon, 1e-6))) return 0;
  let result = Infinity;
  for (let i = 0; i < polygon.length; i++) for (let j = 1; j < road.pts.length; j++) result = Math.min(result, segmentGap(polygon[i], polygon[(i + 1) % polygon.length], road.pts[j - 1], road.pts[j]));
  return result;
}
const pointRoadGap = (p, road) => Math.min(...road.pts.slice(1).map((b, i) => pointSegmentGap(p, road.pts[i], b)));
const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

// Independently distinguish through streets from culdesacs. Add the settlement
// perimeter, split exact centerline intersections, then remove each edge in turn.
// An edge with an alternate route is part of a closed land division; an actual
// dead-end branch is allowed to reserve street space inside one block.
function cyclicStreetSamples(data) {
  const tolerance = .001 * data.unit;
  const segments = data.roads.flatMap(road => road.pts.slice(1).map((b, i) => ({ a: road.pts[i], b, street: true, cuts: [0, 1] })));
  const perimeter = data.walls[0]?.pts || data.boundary;
  segments.push(...perimeter.map((a, i) => ({ a, b: perimeter[(i + 1) % perimeter.length], street: false, cuts: [0, 1] })));
  const project = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
    return length2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2 : 0;
  };
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j], dx = a.b[0] - a.a[0], dy = a.b[1] - a.a[1], ex = b.b[0] - b.a[0], ey = b.b[1] - b.a[1], den = dx * ey - dy * ex;
    if (Math.abs(den) > 1e-9) {
      const ox = b.a[0] - a.a[0], oy = b.a[1] - a.a[1], t = (ox * ey - oy * ex) / den, u = (ox * dy - oy * dx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { a.cuts.push(t); b.cuts.push(u); }
    }
    for (const [first, second] of [[a, b], [b, a]]) for (const p of [second.a, second.b]) {
      const t = project(p, first.a, first.b);
      if (t >= 0 && t <= 1 && pointSegmentGap(p, first.a, first.b) < tolerance) first.cuts.push(t);
    }
  }
  const nodes = new Map(), edges = new Map(), neighbors = new Map();
  const node = p => { const key = p.map(value => Math.round(value / tolerance)).join(':'); if (!nodes.has(key)) nodes.set(key, p); return key; };
  for (const segment of segments) {
    segment.cuts.sort((a, b) => a - b);
    for (let i = 1; i < segment.cuts.length; i++) {
      const p = mix(segment.a, segment.b, segment.cuts[i - 1]), q = mix(segment.a, segment.b, segment.cuts[i]);
      if (distance(p, q) < tolerance) continue;
      const a = node(p), b = node(q), id = [a, b].sort().join('/');
      if (edges.has(id)) { edges.get(id).street ||= segment.street; continue; }
      edges.set(id, { id, a, b, p, q, street: segment.street });
      for (const [x, y] of [[a, b], [b, a]]) { if (!neighbors.has(x)) neighbors.set(x, []); neighbors.get(x).push({ node: y, edge: id }); }
    }
  }
  const samples = [];
  for (const edge of edges.values()) if (edge.street) {
    const seen = new Set([edge.a]), queue = [edge.a];
    for (let at = 0; at < queue.length && !seen.has(edge.b); at++) for (const next of neighbors.get(queue[at]) || []) if (next.edge !== edge.id && !seen.has(next.node)) { seen.add(next.node); queue.push(next.node); }
    if (seen.has(edge.b)) samples.push(...[.25, .5, .75].map(t => mix(edge.p, edge.q, t)));
  }
  return samples;
}
const cache = new Map();
function plan(layout, water = 'none', seed = 'realism-a', size = 'town', extra = {}) {
  const options = { layout, water, size, width: 1000, height: 800, ...extra }, key = JSON.stringify([seed, options]);
  if (!cache.has(key)) cache.set(key, Town.generate(seed, options));
  return cache.get(key);
}
function model(data, tag) {
  for (const name of ['blocks', 'parcels', 'yards', 'farmGroups']) assert(Array.isArray(data[name]), tag + ': generated model includes actual ' + name);
  assert(data.blocks.length >= 2 && data.parcels.length >= 12, tag + ': several street blocks contain usable properties');
  const objects = [...data.blocks, ...data.parcels, ...data.yards, ...data.farmGroups, ...data.buildings, ...data.roads, ...data.gates, ...data.farms, ...data.sites];
  assert(objects.every(object => typeof object.id === 'string' && object.id.length), tag + ': editable objects have stable IDs');
  assert.equal(new Set(objects.map(object => object.id)).size, objects.length, tag + ': property and farm IDs cannot collide with existing editable map objects');
}

test('realism geometry proof distinguishes shared boundaries, overlapping land, and concave containment', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert(!interiorsOverlap(square, [[10, 0], [20, 0], [20, 10], [10, 10]]));
  assert(interiorsOverlap(square, square));
  assert(interiorsOverlap(square, [[9, 2], [15, 2], [15, 8], [9, 8]]));
  const concave = [[0, 0], [10, 0], [10, 3], [3, 3], [3, 10], [0, 10]];
  assert(!contained([[1, 1], [8, 1], [1, 8]], concave, .001), 'an edge crossing an indentation is not contained');
  const samples = cyclicStreetSamples({ unit: 1, walls: [], boundary: [[0, 0], [100, 0], [100, 100], [0, 100]], roads: [{ pts: [[0, 50], [100, 50]] }, { pts: [[50, 50], [50, 75]] }] });
  assert(samples.length >= 6 && samples.every(p => Math.abs(p[1] - 50) < .001), 'through-street proof recognizes a real land division and excludes its culdesac branch');
});

test('a closed street loop reached by a single neck remains a hole in the surrounding block', () => {
  // Exercise the production partitioner with a minimal graph rather than a
  // particular town blueprint. Test-only access leaves the shipped API intact.
  const source = fs.readFileSync(require.resolve('../town.js'), 'utf8');
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(source.replace('const api = { generate,', 'const api = { streetBlocks, generate,'), sandbox);
  const boundary = [[0, 0], [200, 0], [200, 200], [0, 200]];
  const loop = [[60, 100], [100, 60], [140, 100], [100, 140], [60, 100]];
  const roads = [{ pts: [[0, 100], [60, 100]] }, { pts: loop }, { pts: [[100, 60], [100, 40]] }];
  const blocks = sandbox.module.exports.streetBlocks(roads, boundary, [], 1);
  assert.equal(blocks.length, 2, 'the loop divides its own land from its surrounding neighborhood');
  assert(Math.abs(blocks.reduce((sum, block) => sum + area(block.polygon), 0) - 40000) < 1e-7, 'the inner loop is subtracted from the surrounding block instead of counting its land twice');
  for (const point of [[100, 100], [40, 40]]) assert.equal(blocks.filter(block => strictlyInside(point, block.polygon, .001)).length, 1, 'each dry interior point belongs to exactly one block');
  assert(!interiorsOverlap(blocks[0].polygon, blocks[1].polygon, .001), 'the surrounding face preserves its hole');
  assert(blocks.every(block => block.polygon.every(point => distance(point, [100, 40]) > .001)), 'a terminal branch remains a street reservation, not a retraced block boundary');
});

for (const layout of layouts) test(`${layout}: actual blocks, frontage properties, houses and yards fit the street plan`, () => {
  for (const seed of ['realism-a', 'realism-b']) for (const [water, size] of [['none', 'town'], ['river', 'city'], ['coast', 'village']]) {
    const data = plan(layout, water, seed, size), tag = `${layout} ${water} ${size} ${seed}`, u = data.unit;
    model(data, tag);
    const blocks = new Map(data.blocks.map(block => [block.id, block])), parcels = new Map(data.parcels.map(parcel => [parcel.id, parcel]));
    assert.equal(blocks.size, data.blocks.length); assert.equal(parcels.size, data.parcels.length);
    const boundaries = [data.boundary, ...data.walls.map(wall => wall.pts), ...data.water.map(body => body.polygon)];
    for (const [index, block] of data.blocks.entries()) {
      assert(block.polygon.length >= 3 && area(block.polygon) > 50 * u * u, tag + ': nontrivial block land');
      for (const p of block.polygon) assert(p.every(Number.isFinite), tag + ': finite block geometry');
      for (let i = 0; i < block.polygon.length; i++) for (const t of [.25, .5, .75]) {
        const p = mix(block.polygon[i], block.polygon[(i + 1) % block.polygon.length], t);
        assert(data.roads.some(road => pointRoadGap(p, road) < .15 * u) || boundaries.some(polygon => edgeGap(p, polygon) < .15 * u), tag + ': block edges follow real streets, banks, or the settlement boundary');
      }
      for (const other of data.blocks.slice(index + 1)) assert(!interiorsOverlap(block.polygon, other.polygon, .005 * u), tag + ': block interiors are disjoint');
    }
    const occupied = new Set();
    for (const [index, parcel] of data.parcels.entries()) {
      const block = blocks.get(parcel.blockId), road = data.roads.find(road => road.id === parcel.roadId);
      assert(block && road, tag + ': property belongs to a real block and adjoining street');
      assert(contained(parcel.polygon, block.polygon, .02 * u), tag + ': full property boundary lies within its block');
      for (const other of data.parcels.slice(index + 1)) assert(!interiorsOverlap(parcel.polygon, other.polygon, .005 * u), tag + ': neighboring properties reserve separate land');
      for (const street of data.roads) assert(roadGap(parcel.polygon, street) >= street.width / 2 - .03 * u, tag + ': plots respect full street widths, including culdesacs');
      for (const body of data.water) assert(!interiorsOverlap(parcel.polygon, body.polygon, .005 * u), tag + ': all property land is dry');
      for (const square of data.plazas || [data.plaza]) assert(!interiorsOverlap(parcel.polygon, square.polygon, .005 * u), tag + ': public squares are reserved land');
      assert(parcel.frontage.length === 2 && distance(...parcel.frontage) >= 5 * u, tag + ': a property has a usable street frontage');
      for (const t of [0, .25, .5, .75, 1]) {
        const p = mix(...parcel.frontage, t);
        assert(edgeGap(p, parcel.polygon) < .05 * u, tag + ': frontage is part of the actual property edge');
        const gap = pointRoadGap(p, road);
        assert(gap >= road.width / 2 - .05 * u && gap <= road.width / 2 + 5 * u, tag + ': property frontage physically adjoins the referenced street');
      }
      const houses = data.buildings.filter(building => building.parcelId === parcel.id);
      assert.deepEqual(new Set(parcel.buildingIds), new Set(houses.map(building => building.id)), tag + ': building ownership is complete and bidirectional');
      if (houses.length) {
        occupied.add(parcel.id);
        assert.equal(houses.filter(building => building.role === 'main').length, 1, tag + ': an occupied property has one main house');
      }
      for (const building of houses) {
        assert(contained(building.polygon, parcel.polygon, .02 * u), tag + ': roofs fit inside their own property');
        if (building.role === 'outbuilding') {
          const parent = houses.find(other => other.id === building.parentId);
          assert(parent && parent.role === 'main', tag + ': an outbuilding belongs to the same property as its main house');
        }
      }
    }
    assert(occupied.size >= data.parcels.length * .7, tag + ': properties contain a real settlement');
    for (const building of data.buildings) assert(parcels.has(building.parcelId), tag + ': every generated town building has a property');
    assert(data.yards.length >= occupied.size * .5, tag + ': open private land is reserved for most occupied properties');
    for (const yard of data.yards) {
      const parcel = parcels.get(yard.parcelId);
      assert(parcel && contained(yard.polygon, parcel.polygon, .02 * u), tag + ': yard/garden belongs inside its property');
      assert(area(yard.polygon) >= 25 * u * u, tag + ': usable open yard or garden area');
      assert(data.buildings.every(building => !interiorsOverlap(yard.polygon, building.polygon, .005 * u)), tag + ': reserved yards and gardens are not covered by roofs');
      for (const body of data.water) assert(!interiorsOverlap(yard.polygon, body.polygon, .005 * u), tag + ': open private land stays dry');
    }
    const plotsPerBlock = data.blocks.map(block => data.parcels.filter(parcel => parcel.blockId === block.id).length);
    assert(Math.max(...plotsPerBlock) >= 4, tag + ': blocks contain multiple properties rather than one synthetic block per house');
  }
});

test('through streets divide actual block faces while dead-end branches remain reservations', () => {
  for (const layout of layouts) {
    const data = plan(layout), samples = cyclicStreetSamples(data); model(data, layout);
    assert(samples.length >= 9, layout + ': the fixture has actual closed street/perimeter divisions');
    for (const p of samples) for (const block of data.blocks) assert(!strictlyInside(p, block.polygon, .15 * data.unit), layout + ': no through street is buried inside an unsplit block');
  }
});

test('central and outlying properties have measurably different built coverage and open space', () => {
  const inner = [], outer = [], innerOpen = [], outerOpen = [];
  for (const layout of layouts) for (const seed of ['realism-a', 'realism-b']) {
    const data = plan(layout, 'none', seed), u = data.unit; model(data, layout);
    const ordered = data.parcels.map(parcel => ({ parcel, radius: distance(center(parcel.polygon), data.center) })).sort((a, b) => a.radius - b.radius);
    const count = Math.max(3, Math.floor(ordered.length * .3));
    for (const [items, coverage, open] of [[ordered.slice(0, count), inner, innerOpen], [ordered.slice(-count), outer, outerOpen]]) for (const { parcel } of items) {
      const footprint = data.buildings.filter(building => building.parcelId === parcel.id).reduce((sum, building) => sum + area(building.polygon), 0);
      coverage.push(footprint / area(parcel.polygon));
      open.push(data.yards.filter(yard => yard.parcelId === parcel.id).reduce((sum, yard) => sum + area(yard.polygon), 0) / (u * u));
    }
  }
  assert(median(inner) > median(outer) * 1.15, 'central properties have materially higher roof coverage than edge properties');
  assert(median(outerOpen) > median(innerOpen) * 1.15, 'outskirts reserve larger usable yards and gardens');
});

test('density controls alter real occupation and land use rather than only model labels', () => {
  const sparse = [], dense = [], cityFrontage = [], commercialCoverage = [], gardenCoverage = [], commercialOpen = [], gardenOpen = [];
  let outbuildings = 0, craftProperties = 0, craftWorkyards = 0;
  const collectLandUse = data => {
    for (const parcel of data.parcels) {
      const roofs = data.buildings.filter(building => building.parcelId === parcel.id), yards = data.yards.filter(yard => yard.parcelId === parcel.id);
      const coverage = roofs.reduce((sum, building) => sum + area(building.polygon), 0) / area(parcel.polygon), open = yards.reduce((sum, yard) => sum + area(yard.polygon), 0) / (data.unit * data.unit);
      if (parcel.landUse === 'commercial') { commercialCoverage.push(coverage); commercialOpen.push(open); }
      if (parcel.landUse === 'garden') { gardenCoverage.push(coverage); gardenOpen.push(open); }
      if (parcel.landUse === 'craft') {
        craftProperties++;
        if (yards.some(yard => yard.kind === 'workyard' && area(yard.polygon) >= 25 * data.unit * data.unit)) craftWorkyards++;
      }
    }
  };
  for (const layout of layouts) for (const [density, results] of [['sparse', sparse], ['dense', dense]]) {
    const data = plan(layout, 'none', 'realism-density', 'town', { density }); model(data, layout);
    const built = data.buildings.reduce((sum, building) => sum + area(building.polygon), 0), land = data.parcels.reduce((sum, parcel) => sum + area(parcel.polygon), 0);
    results.push(built / land);
    outbuildings += data.buildings.filter(building => building.role === 'outbuilding').length;
    collectLandUse(data);
  }
  // Riverfront workshops provide the wet-process craft plots; inland density
  // fixtures alone intentionally contain no waterfront craft district.
  for (const layout of layouts) collectLandUse(plan(layout, 'river', 'realism-a', 'city'));
  assert(median(dense) > median(sparse) * 1.1, 'dense settlements occupy more property land with buildings');
  assert(outbuildings >= 5, 'auxiliary buildings are actually generated for inhabited properties');
  assert(commercialCoverage.length >= 5 && gardenCoverage.length >= 5, 'the fixtures contain enough actual commercial and garden properties to compare');
  assert(median(commercialCoverage) > median(gardenCoverage) * 1.25, 'commercial plots reserve a materially denser built footprint than garden properties');
  assert(median(gardenOpen) > median(commercialOpen) * 1.2, 'garden properties have larger real open plots than commercial properties');
  assert(craftProperties >= 5 && craftWorkyards >= craftProperties * .5, 'most craft properties have usable reserved workyards');
  for (const layout of layouts) {
    const data = plan(layout, 'none', 'realism-density', 'city', { density: 'dense' }); model(data, layout + ' city');
    const properties = data.parcels.map(parcel => ({ parcel, main: data.buildings.find(building => building.role === 'main' && building.parcelId === parcel.id) })).filter(property => property.main).sort((a, b) => distance(center(a.parcel.polygon), data.center) - distance(center(b.parcel.polygon), data.center));
    for (const { parcel, main } of properties.slice(0, Math.max(3, Math.floor(properties.length * .3)))) {
      const a = parcel.frontage[0], b = parcel.frontage[1], length = distance(a, b), dx = (b[0] - a[0]) / length, dy = (b[1] - a[1]) / length;
      const along = main.polygon.map(p => (p[0] - a[0]) * dx + (p[1] - a[1]) * dy);
      cityFrontage.push((Math.max(...along) - Math.min(...along)) / length);
    }
  }
  assert(median(cityFrontage) >= .65, 'dense city centers have a substantial real street wall, rather than isolated small houses in wide plots');
  for (const layout of layouts) for (const water of ['none', 'river', 'coast']) {
    const data = plan(layout, water, 'realism-a', water === 'river' ? 'city' : 'town');
    const site = data.sites.find(site => /^Herbalist’s (Garden|Shop)$/.test(site.name));
    assert(site, 'the settlement includes its keyed herbalist service');
    const main = data.buildings.find(building => building.id === site.buildingId);
    assert(main && main.role === 'main', 'the herbalist occupies a real main-house property');
    if (site.name.endsWith('Garden')) {
      const parcel = data.parcels.find(parcel => parcel.id === main.parcelId), gardens = data.yards.filter(yard => yard.parcelId === main.parcelId && yard.kind === 'garden');
      assert(parcel && gardens.some(garden => area(garden.polygon) >= 25 * data.unit * data.unit && contained(garden.polygon, parcel.polygon, .02 * data.unit)), 'a keyed garden has actual usable garden land on its own property');
      for (const garden of gardens) assert(data.buildings.every(building => !interiorsOverlap(garden.polygon, building.polygon, .005 * data.unit)), 'the keyed herb garden remains open planting land');
    } else assert(!/fenced garden/i.test(site.notes), 'a gardenless herbalist shop does not promise a nonexistent garden');
  }
});

test('street-led settlement envelopes are not a repeated ellipse with equal radial setbacks', () => {
  const signatures = new Set(); let visiblyNonElliptical = 0;
  for (const layout of layouts) {
    const data = plan(layout), polygon = data.boundary;
    const xs = polygon.map(p => p[0]), ys = polygon.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const rx = (Math.max(...xs) - Math.min(...xs)) / 2, ry = (Math.max(...ys) - Math.min(...ys)) / 2;
    // A rectangle's corners can all sit on the same ellipse while its long
    // straight edges depart strongly from it. Measure the whole outline.
    const outline = polygon.flatMap((p, i) => [0, .25, .5, .75].map(t => mix(p, polygon[(i + 1) % polygon.length], t)));
    const radii = outline.map(p => Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry));
    if (Math.max(...radii) - Math.min(...radii) > .18) visiblyNonElliptical++;
    signatures.add(polygon.map(p => [Math.round((p[0] - cx) / rx * 10), Math.round((p[1] - cy) / ry * 10)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).flat().join(','));
  }
  assert(visiblyNonElliptical >= 3, 'most families have a materially non-elliptical settlement boundary');
  assert(signatures.size >= 4, 'different street families produce different normalized envelopes');
});

test('farm fields form accessed agricultural groups instead of detached decorative rings', () => {
  let totalFields = 0;
  for (const layout of layouts) for (const water of ['none', 'river', 'coast']) {
    const data = plan(layout, water), tag = `${layout} ${water}`, u = data.unit; model(data, tag);
    assert(data.farms.length >= 2 && data.farmGroups.length >= 1, tag + ': usable agricultural land is generated');
    const groups = new Map(data.farmGroups.map(group => [group.id, group]));
    assert(data.farmGroups.length < data.farms.length, tag + ': neighboring fields share real farm groups');
    for (const field of data.farms) {
      const group = groups.get(field.groupId), road = data.roads.find(road => road.id === field.roadId);
      assert(group && road, tag + ': fields belong to a group served by an actual street');
      assert(contained(field.polygon, group.polygon, .03 * u), tag + ': group land contains its crop fields');
      assert(field.access.length >= 2 && field.access.every(p => p.every(Number.isFinite)), tag + ': field has a real access route');
      const ends = [field.access[0], field.access.at(-1)];
      assert(ends.some(p => inside(p, field.polygon, .1 * u)), tag + ': farm access reaches the actual field');
      assert(ends.some(p => pointRoadGap(p, road) <= road.width / 2 + .1 * u), tag + ': farm access attaches to its referenced street');
      for (const body of data.water) assert(roadGap(body.polygon, { pts: field.access }) >= .5 * u && !interiorsOverlap(field.polygon, body.polygon, .005 * u), tag + ': fields and access remain on their dry bank');
      for (const building of data.buildings) assert(!interiorsOverlap(field.polygon, building.polygon, .005 * u) && roadGap(building.polygon, { pts: field.access }) > .1 * u, tag + ': cultivation and access leave houses clear');
      assert(!interiorsOverlap(field.polygon, data.boundary, .005 * u), tag + ': cultivation is outside the settlement envelope');
      totalFields++;
    }
    for (const group of data.farmGroups) {
      const fields = data.farms.filter(field => field.groupId === group.id), road = data.roads.find(road => road.id === group.roadId);
      assert(fields.length >= 2, tag + ': each agricultural group contains related fields');
      assert(road && group.access.length >= 2, tag + ': farm group has an actual entrance');
      assert([group.access[0], group.access.at(-1)].some(p => pointRoadGap(p, road) <= road.width / 2 + .1 * u), tag + ': group entrance joins its street');
      const radii = fields.map(field => distance(center(field.polygon), data.center));
      assert(Math.max(...radii) - Math.min(...radii) > 8 * u, tag + ': fields extend into a working landscape, rather than sharing one ornamental radius');
    }
  }
  assert(totalFields >= 45, 'several farm fields occur across all families and water settings');
});

test('block and property geometry survives narrow and tall maps deterministically', () => {
  for (const [layout, width, height, water] of [['linear', 3000, 500, 'river'], ['organic', 600, 3000, 'coast'], ['planned', 600, 500, 'none'], ['clustered', 4000, 3200, 'river']]) {
    const options = { layout, width, height, water, size: 'village' }, data = Town.generate('realism-aspect', options), copy = Town.generate('realism-aspect', options);
    model(data, layout + ' aspect'); assert.deepEqual(copy, data); assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
    for (const object of [...data.blocks, ...data.parcels, ...data.yards, ...data.farms]) for (const p of object.polygon) assert(p.every(Number.isFinite) && p[0] >= -.001 && p[0] <= width + .001 && p[1] >= -.001 && p[1] <= height + .001, 'all reserved land stays inside the sheet');
    for (const parcel of data.parcels) {
      const block = data.blocks.find(block => block.id === parcel.blockId);
      assert(block && contained(parcel.polygon, block.polygon, .03 * data.unit), 'extreme aspect ratios preserve real block ownership');
    }
  }
});

test('a private main house also hides its outbuildings and compound decoration in player maps', () => {
  const data = JSON.parse(JSON.stringify(plan('organic', 'none', 'realism-density', 'town', { density: 'dense' })));
  model(data, 'compound privacy');
  const child = data.buildings.find(building => building.role === 'outbuilding');
  assert(child, 'the fixture includes a real main-house/outbuilding compound');
  const parent = data.buildings.find(building => building.id === child.parentId), parcel = data.parcels.find(parcel => parcel.id === child.parcelId), yards = data.yards.filter(yard => yard.parcelId === child.parcelId);
  assert(parent && parcel && yards.length, 'the compound has its own reserved property and open yard');
  parent.gm = true; child.gm = false;
  const beforeRender = JSON.stringify(data);
  const record = view => {
    let path = []; const calls = [];
    const ctx = new Proxy({}, {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          if (key === 'beginPath') path = [];
          if (['moveTo', 'lineTo', 'arc', 'rect', 'closePath'].includes(key)) path.push([key, ...args]);
          if (['fill', 'stroke', 'clip'].includes(key)) calls.push({ key, path: JSON.stringify(path) });
        };
      },
      set(target, key, value) { target[key] = value; return true; }
    });
    Town.draw(ctx, data, { view, keys: false, text: false });
    return calls;
  };
  const outline = polygon => JSON.stringify(polygon.map((p, i) => [i ? 'lineTo' : 'moveTo', ...p]).concat([['closePath']]));
  const gm = record('gm'), player = record('player');
  for (const building of [parent, child]) {
    assert(gm.some(call => call.key === 'fill' && call.path === outline(building.polygon)), 'the GM still sees every roof in the compound');
    assert(!player.some(call => call.path === outline(building.polygon)), 'the player map does not reveal a private compound roof');
    assert.equal(Town.hitTest(data, building.x, building.y, { view: 'player', keys: false, lines: false }), null, 'private main and auxiliary roofs cannot be selected');
    assert.equal(Town.hitTest(data, building.x, building.y, { view: 'gm', keys: false, lines: false })?.id, building.id, 'the GM can still select each separate building');
  }
  for (const object of [parcel, ...yards]) {
    assert(gm.some(call => call.path === outline(object.polygon)), 'the GM sees real property/yard decoration');
    assert(!player.some(call => call.path === outline(object.polygon)), 'hidden compound land does not leak through fences or garden patterns');
  }
  assert.equal(JSON.stringify(data), beforeRender, 'visibility checks never rewrite compound ownership or privacy flags');
  data.sites = [{ id: 'privacy-number-probe', n: 9876, x: child.x, y: child.y, gm: false }];
  const number = Town.siteNumberLayout(data, { view: 'player' }).find(number => number.id === 'privacy-number-probe');
  assert(number && distance([number.x, number.y], [child.x, child.y]) < .001, 'invisible auxiliary roofs do not displace public numeric labels');
  assert.equal(child.gm, false, 'effective parent privacy does not rewrite the auxiliary building flag');
});

test('an oversized imported courtyard cannot create an unbounded paving loop', () => {
  const data = JSON.parse(JSON.stringify(plan('planned'))); model(data, 'large courtyard');
  const main = data.buildings.find(building => building.role === 'main'), parcel = data.parcels.find(parcel => parcel.id === main.parcelId);
  data.buildings = [main]; data.parcels = [parcel];
  data.yards = [{ id: 'oversized-imported-court', parcelId: parcel.id, kind: 'court', gm: false, polygon: [[-1e9, -1e9], [1e9, -1e9], [1e9, 1e9], [-1e9, 1e9]] }];
  for (const name of ['roads', 'water', 'bridges', 'walls', 'gates', 'farms', 'farmGroups', 'trees', 'docks', 'sites']) data[name] = [];
  const before = JSON.stringify(data); let operations = 0, pavingCircles = 0;
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        assert(++operations <= 10000, 'one imported courtyard has a fixed, modest canvas operation budget');
        if (key === 'arc') pavingCircles++;
        for (const value of args) if (typeof value === 'number') assert(Number.isFinite(value), 'courtyard rendering uses finite coordinates');
      };
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  Town.draw(ctx, data, { terrain: true, symbols: false, keys: false, text: false, exporting: true });
  assert(pavingCircles > 0, 'the terrain layer actually renders courtyard paving within the budget');
  assert.equal(JSON.stringify(data), before, 'bounded rendering does not rewrite imported land');
});
