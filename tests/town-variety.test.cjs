'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Town = require('../town.js');

const families = ['organic', 'linear', 'clustered', 'radial', 'planned'];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
const interpolate = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function projection(p, a, b) {
  const d = subtract(b, a), length2 = d[0] * d[0] + d[1] * d[1];
  return length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / length2)) : 0;
}
const pointSegmentDistance = (p, a, b) => distance(p, interpolate(a, b, projection(p, a, b)));
function intersection(a, b, c, d) {
  const ab = subtract(b, a), cd = subtract(d, c), divisor = cross(ab, cd);
  if (Math.abs(divisor) < 1e-9) return null;
  const ca = subtract(c, a), t = cross(ca, cd) / divisor, u = cross(ca, ab) / divisor;
  return t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8 ? [Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, u))] : null;
}
function nearestParameters(a, b, c, d) {
  const hit = intersection(a, b, c, d);
  if (hit) return hit;
  return [[0, projection(a, c, d)], [1, projection(b, c, d)], [projection(c, a, b), 0], [projection(d, a, b), 1]]
    .sort(([t, u], [v, w]) => distance(interpolate(a, b, t), interpolate(c, d, u)) - distance(interpolate(a, b, v), interpolate(c, d, w)))[0];
}
function inside(p, polygon) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}
function polygonGap(a, b) {
  if (a.some(p => inside(p, b)) || b.some(p => inside(p, a))) return 0;
  let gap = Infinity;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const [t, u] = nearestParameters(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]);
    gap = Math.min(gap, distance(interpolate(a[i], a[(i + 1) % a.length], t), interpolate(b[j], b[(j + 1) % b.length], u)));
  }
  return gap;
}
function polygonRoadGap(polygon, road) {
  if (road.pts.some(p => inside(p, polygon))) return 0;
  let gap = Infinity;
  for (let i = 1; i < road.pts.length; i++) for (let j = 0; j < polygon.length; j++) {
    const a = road.pts[i - 1], b = road.pts[i], c = polygon[j], d = polygon[(j + 1) % polygon.length];
    const [t, u] = nearestParameters(a, b, c, d);
    gap = Math.min(gap, distance(interpolate(a, b, t), interpolate(c, d, u)));
  }
  return gap;
}

// Build the graph from the painted streets, not road IDs or layout metadata.
// Split crossings and T-junctions, including contacts within the street widths.
// Degree-two bends do not affect the degree census or E - V + C cycle count.
function streetGraph(data, roads = data.roads) {
  const nodes = [], parent = [], segments = [];
  const add = p => { const id = nodes.length; nodes.push(p); parent.push(id); return id; };
  const root = id => { while (id !== parent[id]) { parent[id] = parent[parent[id]]; id = parent[id]; } return id; };
  const join = (a, b) => { parent[root(b)] = root(a); };
  for (const road of roads) for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1], b = road.pts[i];
    if (distance(a, b) < .001) continue;
    segments.push({ a, b, width: road.width, cuts: [{ t: 0, id: add(a) }, { t: 1, id: add(b) }] });
  }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j], [t, u] = nearestParameters(a.a, a.b, b.a, b.b);
    const p = interpolate(a.a, a.b, t), q = interpolate(b.a, b.b, u);
    if (distance(p, q) > (a.width + b.width) / 2 + 1e-5) continue;
    const x = add(p), y = add(q);
    a.cuts.push({ t, id: x }); b.cuts.push({ t: u, id: y }); join(x, y);
  }
  // Repeated projections at the same spot are one junction, regardless of which
  // road pair discovered the contact first.
  for (const segment of segments) {
    segment.cuts.sort((a, b) => a.t - b.t);
    for (let i = 1; i < segment.cuts.length; i++) if (Math.abs(segment.cuts[i].t - segment.cuts[i - 1].t) * distance(segment.a, segment.b) < .01 * data.unit) join(segment.cuts[i].id, segment.cuts[i - 1].id);
  }
  const adjacency = new Map(), edges = new Set();
  for (const segment of segments) for (let i = 1; i < segment.cuts.length; i++) {
    const a = root(segment.cuts[i - 1].id), b = root(segment.cuts[i].id);
    if (a === b) continue;
    const key = [a, b].sort((x, y) => x - y).join(':');
    if (edges.has(key)) continue;
    edges.add(key);
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b); adjacency.get(b).add(a);
  }
  const seen = new Set(); let components = 0;
  for (const start of adjacency.keys()) if (!seen.has(start)) {
    components++; const queue = [start]; seen.add(start);
    for (const current of queue) for (const next of adjacency.get(current)) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  const degrees = [...adjacency.values()].map(neighbors => neighbors.size), junctions = [...adjacency].filter(([, neighbors]) => neighbors.size >= 3).map(([id, neighbors]) => ({ point: nodes[id], degree: neighbors.size }));
  const degreeCounts = degrees.filter(n => n !== 2).reduce((counts, n) => (counts[n] = (counts[n] || 0) + 1, counts), {});
  return { components, junctions, degreeCounts, cycles: edges.size - adjacency.size + components };
}

function topology(data) {
  const graph = streetGraph(data);
  return JSON.stringify({ degreeCounts: graph.degreeCounts, cycles: graph.cycles });
}

// The market is an area, rather than a point on a specific road. Count distinct
// street exits through its boundary so an arbitrary bend cannot fake variety.
function marketExits(data) {
  const points = [];
  for (const road of data.roads) for (let i = 1; i < road.pts.length; i++) for (let j = 0; j < data.plaza.polygon.length; j++) {
    const hit = intersection(road.pts[i - 1], road.pts[i], data.plaza.polygon[j], data.plaza.polygon[(j + 1) % data.plaza.polygon.length]);
    if (!hit) continue;
    const p = interpolate(road.pts[i - 1], road.pts[i], hit[0]);
    if (!points.some(q => distance(p, q) < road.width + 2 * data.unit)) points.push(p);
  }
  return points.length;
}

test('automatic town plans change street topology and market access across seeds', () => {
  const plans = Array.from({ length: 24 }, (_, i) => Town.generate('street-variety-' + i, { water: 'none', size: 'town' }));
  const resolved = new Set(plans.map(data => data.layout));
  assert(resolved.size >= 4 && [...resolved].every(layout => families.includes(layout)), 'automatic generation resolves at least four actual street-plan families');
  assert(plans.every(data => data.options.layout === 'varied'), 'saved options retain the automatic choice');
  assert(new Set(plans.map(topology)).size >= 4, 'actual junction degrees and cycles differ, after ignoring degree-two road bends');
  const exits = plans.map(marketExits);
  assert(new Set(exits).size >= 3, 'market access has at least three different degrees');
  assert(exits.filter(count => count !== 4).length >= 6, 'the market is not always a four-way crossroads');
  assert(exits.filter(count => count < 4).length >= 3, 'several plans have a local market instead of a mandatory central fan');
});

test('automatic sparse coastal villages have varied street graphs without fortifications', () => {
  const plans = Array.from({ length: 16 }, (_, i) => Town.generate('coastal-village-variety-' + i, { size: 'village', water: 'coast', walls: 'no', density: 'sparse' }));
  assert(new Set(plans.map(data => data.layout)).size >= 4, 'the current coastal-village settings resolve at least four plan families');
  assert(new Set(plans.map(topology)).size >= 4, 'coastal harbor access does not collapse different families into the same junction graph');
  assert(plans.every(data => !data.walls.length && data.roads.some(road => road.kind === 'approach')), 'the proof uses open settlements with real countryside access');
});

test('explicit town plans alter the actual junction graph rather than only their labels', () => {
  for (const seed of ['street-plan-proof', 'different-neighborhood']) {
    const plans = families.map(layout => Town.generate(seed, { layout, water: 'none', size: 'town' }));
    assert.deepEqual(plans.map(data => data.layout), families);
    assert(new Set(plans.map(topology)).size >= 4, seed + ': explicit choices have different graph structures');
    assert(marketExits(plans[families.indexOf('radial')]) >= 4, 'radial deliberately retains the fan as one choice');
    assert(marketExits(plans[families.indexOf('linear')]) <= 3, 'linear gives its market a high street rather than a radial fan');
    const clustered = plans[families.indexOf('clustered')], clusters = clustered.plazas.filter(square => distance([square.x, square.y], clustered.center) > 70 * clustered.unit);
    assert(clusters.length >= 2, 'clustered plans have several separate local squares');
    const clusteredGraph = streetGraph(clustered);
    for (const square of clusters) {
      assert(clustered.roads.some(road => polygonRoadGap(square.polygon, road) <= road.width / 2), 'each local square has actual street access');
      assert(clusteredGraph.junctions.some(junction => distance(junction.point, [square.x, square.y]) < 85 * clustered.unit), 'local centers have their own nearby street junctions');
      assert(clustered.buildings.every(building => polygonGap(square.polygon, building.polygon) > .001), 'local squares are real open spaces, not labels over houses');
      assert(clustered.water.every(body => polygonGap(square.polygon, body.polygon) > .001), 'local squares stand on dry land');
    }
    const planned = streetGraph(plans[families.indexOf('planned')]);
    assert(planned.junctions.filter(j => j.degree >= 4).length >= 3, 'planned streets distribute crossings among several junctions');
  }
});

test('an automatic plan replays exactly when its resolved family is selected explicitly', () => {
  for (let i = 0; i < 8; i++) {
    const automatic = Town.generate('layout-resolution-' + i, { layout: 'varied', water: i % 2 ? 'river' : 'none' });
    const explicit = Town.generate('layout-resolution-' + i, { layout: automatic.layout, water: i % 2 ? 'river' : 'none' });
    explicit.options.layout = 'varied';
    assert.deepEqual(explicit, automatic, 'resolving the family does not shift the geometry random stream');
  }
});

test('individual plan families also vary their graph across seeds', () => {
  for (const layout of families) {
    const plans = Array.from({ length: 6 }, (_, i) => Town.generate('within-family-' + i, { layout, water: 'none', size: 'town' }));
    assert(new Set(plans.map(topology)).size >= 2, layout + ': seed changes alter junctions or loops, beyond cosmetic coordinate jitter');
  }
});

test('moving one street changes every selected point exactly once without moving other map objects', () => {
  for (const layout of families) for (const water of ['none', 'river', 'coast']) {
    const data = Town.generate('independent-street-points', { layout, water, size: 'town' });
    for (const road of data.roads) {
      const before = road.pts.map(point => point.slice());
      const others = () => JSON.stringify({ roads: data.roads.filter(other => other !== road), plaza: data.plaza, plazas: data.plazas, gates: data.gates, water: data.water, buildings: data.buildings });
      const unchanged = others(), dx = 13.25, dy = -7.5;
      // This is the editor's whole-street translation: each point in the
      // selected polyline is updated, including a closed street's last point.
      for (const point of road.pts) { point[0] += dx; point[1] += dy; }
      assert.deepEqual(road.pts, before.map(([x, y]) => [x + dx, y + dy]), `${layout} ${road.id}: each coordinate moves exactly once`);
      assert.equal(others(), unchanged, `${layout} ${road.id}: unselected streets, squares, gates, water, and buildings retain their geometry`);
      for (let i = 0; i < road.pts.length; i++) { road.pts[i][0] = before[i][0]; road.pts[i][1] = before[i][1]; }
    }
  }
});

test('street graph proof recognizes bends, T-junctions, and crossings independently of road IDs', () => {
  const data = { unit: 1, roads: [{ width: 2, pts: [[0, 0], [10, 0], [20, 0]] }, { width: 2, pts: [[10, 0], [10, 10]] }] };
  assert.deepEqual(streetGraph(data).degreeCounts, { 1: 3, 3: 1 });
  assert.equal(streetGraph(data).cycles, 0);
  data.roads.push({ width: 2, pts: [[0, 5], [20, 5]] });
  assert.equal(streetGraph(data).degreeCounts[4], 1, 'a segment-interior crossing becomes a junction');
  const straight = { unit: 1, roads: [{ width: 2, pts: [[0, 0], [20, 0]] }] };
  const bent = { unit: 1, roads: [{ width: 2, pts: [[0, 0], [10, 7], [20, 0]] }] };
  assert.equal(topology(straight), topology(bent), 'road bends alone do not count as new topology');
});

for (const layout of families) {
  test(`${layout}: generation is deterministic, serializable, and preserves requested options`, () => {
    const options = { layout, size: 'town', water: 'river', walls: 'yes', density: 'dense', width: 1000, height: 800 };
    const first = Town.generate('layout-replay', options);
    assert.deepEqual(Town.generate('layout-replay', options), first);
    assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
    assert.equal(first.layout, layout);
    assert.equal(first.options.layout, layout);
    assert.equal(first.seed, 'layout-replay');
  });
  for (const size of ['village', 'town', 'city']) for (const water of ['none', 'river', 'coast']) {
    test(`${layout}: ${size} / ${water} preserves usable roads, gates, bridges, and parcels`, () => {
      const data = Town.generate('layout-safety-' + size + '-' + water, { layout, size, water, width: 1000, height: 800 });
      assertUsablePlan(data, `${layout} ${size} ${water}`);
    });
  }
}

function assertUsablePlan(data, tag) {
  const u = data.unit;
  assert(data.roads.length > 3, tag + ': enough streets for a settlement');
  if (Array.isArray(data.parcels)) {
    const occupied = new Set(data.buildings.filter(building => building.role === 'main').map(building => building.parcelId));
    assert(occupied.size >= ({ village: 12, town: 20, city: 30 })[data.options.size], tag + ': enough occupied main-house properties');
  } else assert(data.buildings.length >= 35, tag + ': enough legacy street frontage');
  assert.equal(streetGraph(data).components, 1, tag + ': every painted street joins the town network');
  assert(data.roads.some(road => polygonRoadGap(data.plaza.polygon, road) <= road.width / 2), tag + ': the market has street access');
  assert(data.gates.length >= 2, tag + ': at least two countryside entrances');
  assert.equal(data.roads.filter(road => road.kind === 'approach').length, data.gates.length, tag + ': each gate has one exterior approach');
  for (const road of data.roads) {
    assert(road.pts.length >= 2 && road.width > 0);
    for (const p of road.pts) assert(p.every(Number.isFinite) && p[0] >= 0 && p[0] <= data.width && p[1] >= 0 && p[1] <= data.height, tag + ': finite, bounded streets');
    if (road.kind !== 'primary') for (const body of data.water) assert(polygonRoadGap(body.polygon, road) >= road.width / 2 + .69 * u, tag + ': complete dry street width: ' + road.id);
    else for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1], b = road.pts[i], length = distance(a, b);
      if (!length) continue;
      for (let sample = 0; sample <= 12; sample++) for (const side of [-.5, 0, .5]) {
        const p = interpolate(a, b, sample / 12);
        p[0] -= (b[1] - a[1]) / length * road.width * side; p[1] += (b[0] - a[0]) / length * road.width * side;
        if (!data.water.some(body => inside(p, body.polygon))) continue;
        assert(data.bridges.some(bridge => bridge.roadId === road.id && bridge.pts.slice(1).some((q, j) => pointSegmentDistance(p, bridge.pts[j], q) <= bridge.width / 2 + .001)), tag + ': the whole wet street footprint has bridge decking');
      }
    }
  }
  for (const gate of data.gates) {
    const road = data.roads.find(road => road.id === gate.roadId);
    assert(road && distance(road.pts.at(-1), [gate.x, gate.y]) < .001, tag + ': gate joins its interior street');
    const approach = data.roads.find(road => road.kind === 'approach' && road.from === gate.id);
    assert(approach && distance(approach.pts[0], [gate.x, gate.y]) < .001, tag + ': countryside route begins at its gate');
    const end = approach.pts.at(-1);
    assert(Math.min(Math.abs(end[0]), Math.abs(end[1]), Math.abs(end[0] - data.width), Math.abs(end[1] - data.height)) < .001, tag + ': countryside route reaches the actual sheet boundary');
    for (const side of [-1, 1]) {
      const x = gate.x - Math.sin(gate.angle) * 10 * u * side, y = gate.y + Math.cos(gate.angle) * 10 * u * side;
      const tower = [[-5.6, -6.1], [5.6, -6.1], [5.6, 6.1], [-5.6, 6.1]].map(([a, b]) => [x + (a * Math.cos(gate.angle) - b * Math.sin(gate.angle)) * u, y + (a * Math.sin(gate.angle) + b * Math.cos(gate.angle)) * u]);
      for (const body of data.water) assert(polygonGap(tower, body.polygon) > .001, tag + ': full gate tower is dry');
      for (const building of data.buildings) assert(polygonGap(tower, building.polygon) > .001, tag + ': gate towers leave houses clear');
    }
  }
  for (const building of data.buildings) {
    const frontage = data.roads.find(road => road.id === building.roadId);
    assert(frontage, tag + ': parcel references a real street');
    for (const p of building.polygon) assert(p.every(Number.isFinite) && p[0] >= 0 && p[0] <= data.width && p[1] >= 0 && p[1] <= data.height, tag + ': finite, bounded parcels');
    for (const body of data.water) assert(polygonGap(building.polygon, body.polygon) > .001, tag + ': whole house is dry');
    for (const road of data.roads) assert(polygonRoadGap(building.polygon, road) >= road.width / 2 + 1.48 * u, tag + ': house clears the full street width');
    if (building.role === 'outbuilding') {
      assert(data.buildings.some(parent => parent.id === building.parentId && parent.role === 'main' && parent.parcelId === building.parcelId), tag + ': rear outbuilding reaches the street through its main-house property');
    } else assert(polygonRoadGap(building.polygon, frontage) < frontage.width / 2 + 45 * u, tag + ': main house has actual nearby street frontage');
  }
}

test('every street-plan family stays usable on wide and tall maps', () => {
  for (const layout of families) for (const [width, height] of [[3000, 500], [600, 3000]]) {
    const data = Town.generate('layout-aspect-' + layout, { layout, width, height, water: 'river', size: 'village' });
    assertUsablePlan(data, `${layout} ${width}x${height}`);
  }
});

test('saved towns without layout metadata still draw and select their original geometry', () => {
  const data = Town.generate('legacy-layout', { layout: 'radial', water: 'none' });
  delete data.layout; delete data.options.layout;
  const before = JSON.stringify(data), calls = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { calls.push(key); for (const value of args) if (typeof value === 'number') assert(Number.isFinite(value)); };
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  Town.draw(ctx, data);
  assert(calls.includes('stroke') && calls.includes('fillText'));
  const site = data.sites[0];
  assert.equal(Town.hitTest(data, site.x, site.y).id, site.id);
  assert.equal(JSON.stringify(data), before, 'legacy rendering and selection do not regenerate or rewrite saved geometry');
});
