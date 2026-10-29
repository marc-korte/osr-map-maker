'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Town = require('../town.js');

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const signedArea = polygon => polygon.reduce((sum, p, i) => {
  const q = polygon[(i + 1) % polygon.length];
  return sum + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;
function pointSegmentGap(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denominator)) : 0;
  return distance(p, mix(a, b, t));
}
function inside(p, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

// Independently split actual centerline crossings and bank/perimeter contacts.
// A bend with degree two contributes no new junction or topological face side:
// adding wiggles to a ring and its X therefore cannot conceal that blueprint.
function streetTopology(data, includeBoundaries = true) {
  const tolerance = .001 * data.unit;
  const segments = data.roads.flatMap(road => road.pts.slice(1).map((b, i) => ({ a: road.pts[i], b, cuts: [0, 1] })));
  for (const polygon of includeBoundaries ? [data.walls[0]?.pts || data.boundary, ...data.water.map(body => body.polygon)] : []) {
    segments.push(...polygon.map((a, i) => ({ a, b: polygon[(i + 1) % polygon.length], cuts: [0, 1] })));
  }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j], dx = a.b[0] - a.a[0], dy = a.b[1] - a.a[1], ex = b.b[0] - b.a[0], ey = b.b[1] - b.a[1], denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) > 1e-9) {
      const ox = b.a[0] - a.a[0], oy = b.a[1] - a.a[1], t = (ox * ey - oy * ex) / denominator, u = (ox * dy - oy * dx) / denominator;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { a.cuts.push(t); b.cuts.push(u); }
    }
    for (const [first, second] of [[a, b], [b, a]]) for (const p of [second.a, second.b]) {
      const dx = first.b[0] - first.a[0], dy = first.b[1] - first.a[1], length2 = dx * dx + dy * dy;
      const t = length2 ? ((p[0] - first.a[0]) * dx + (p[1] - first.a[1]) * dy) / length2 : 0;
      if (t >= 0 && t <= 1 && pointSegmentGap(p, first.a, first.b) < tolerance) first.cuts.push(t);
    }
  }
  const nodes = new Map(), neighbors = new Map(), edges = new Set();
  const node = p => {
    const id = p.map(value => Math.round(value / tolerance)).join(':');
    if (!nodes.has(id)) nodes.set(id, p);
    return id;
  };
  for (const segment of segments) {
    segment.cuts.sort((a, b) => a - b);
    for (let i = 1; i < segment.cuts.length; i++) {
      const p = mix(segment.a, segment.b, segment.cuts[i - 1]), q = mix(segment.a, segment.b, segment.cuts[i]);
      if (distance(p, q) < tolerance) continue;
      const a = node(p), b = node(q), edge = [a, b].sort().join('/');
      if (edges.has(edge)) continue;
      edges.add(edge);
      for (const [x, y] of [[a, b], [b, a]]) {
        if (!neighbors.has(x)) neighbors.set(x, new Set());
        neighbors.get(x).add(y);
      }
    }
  }
  const junctions = [...neighbors].filter(([, adjacent]) => adjacent.size >= 3).map(([id, adjacent]) => ({ point: nodes.get(id), degree: adjacent.size }));
  // A culdesac does not divide a block. Strip leaves before walking faces so a
  // short spur cannot turn an otherwise triangular block into a false quad.
  const leaves = [...neighbors].filter(([, adjacent]) => adjacent.size === 1).map(([id]) => id);
  for (const leaf of leaves) {
    const adjacent = neighbors.get(leaf);
    if (adjacent.size !== 1) continue;
    const next = [...adjacent][0];
    adjacent.clear(); neighbors.get(next).delete(leaf);
    if (neighbors.get(next).size === 1) leaves.push(next);
  }
  const ordered = new Map([...neighbors].map(([id, adjacent]) => [id, [...adjacent].sort((a, b) => {
    const p = nodes.get(id), x = nodes.get(a), y = nodes.get(b);
    return Math.atan2(x[1] - p[1], x[0] - p[0]) - Math.atan2(y[1] - p[1], y[0] - p[0]);
  })]));
  const used = new Set(), faces = [];
  for (const [start, adjacent] of ordered) for (const next of adjacent) {
    if (used.has(start + '/' + next)) continue;
    let a = start, b = next, failed = false;
    const face = [];
    for (let step = 0; step <= edges.size * 2; step++) {
      if (used.has(a + '/' + b)) { failed = a !== start || b !== next; break; }
      used.add(a + '/' + b); face.push(a);
      const options = ordered.get(b), index = options.indexOf(a), c = options[(index + options.length - 1) % options.length];
      a = b; b = c;
    }
    const polygon = face.map(id => nodes.get(id)), area = signedArea(polygon);
    if (failed || area < 50 * data.unit * data.unit) continue;
    // Probe inside the first face edge, rather than its centroid, which can sit
    // outside a concave face. Exclude the outside face and water itself.
    const p = polygon[0], q = polygon[1], mid = mix(p, q, .5), length = distance(p, q);
    const probe = [mid[0] - (q[1] - p[1]) / length * tolerance * 4, mid[1] + (q[0] - p[0]) / length * tolerance * 4];
    if (!inside(probe, data.boundary) || data.water.some(body => inside(probe, body.polygon))) continue;
    faces.push({ sides: face.filter(id => neighbors.get(id).size !== 2).length, area });
  }
  return { junctions, faces };
}

function simplifyRoute(points, tolerance) {
  let farthest = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const gap = pointSegmentGap(points[i], points[0], points.at(-1));
    if (gap > farthest) { farthest = gap; index = i; }
  }
  if (farthest <= tolerance) return [points[0], points.at(-1)];
  return simplifyRoute(points.slice(0, index + 1), tolerance).slice(0, -1).concat(simplifyRoute(points.slice(index), tolerance));
}

const straightRuns = (points, tolerance) => {
  const simplified = simplifyRoute(points, tolerance);
  return simplified.slice(1).map((p, i) => distance(simplified[i], p));
};

function rectangularFill(polygon) {
  let smallestBox = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], dx = q[0] - p[0], dy = q[1] - p[1], length = distance(p, q);
    if (!length) continue;
    const along = polygon.map(p => (p[0] * dx + p[1] * dy) / length), across = polygon.map(p => (p[1] * dx - p[0] * dy) / length);
    smallestBox = Math.min(smallestBox, (Math.max(...along) - Math.min(...along)) * (Math.max(...across) - Math.min(...across)));
  }
  return Math.abs(signedArea(polygon)) / smallestBox;
}

const fixtureOptions = { layout: 'clustered', size: 'town', water: 'river', walls: 'yes', density: 'normal', width: 1000, height: 800 };
const fixtures = [
  ['qexzcjcp', fixtureOptions],
  ['realism-a', { ...fixtureOptions, size: 'city', water: 'none' }],
  ['street-neighborhood-coast', { ...fixtureOptions, size: 'village', water: 'coast', walls: 'no', density: 'sparse' }]
];
const cache = new Map();
function plan(seed, options) {
  const key = JSON.stringify([seed, options]);
  if (!cache.has(key)) cache.set(key, Town.generate(seed, options));
  return cache.get(key);
}

test('street motif proof ignores bends and culdesacs when identifying ring-and-X faces', () => {
  const square = [[0, 0], [200, 0], [200, 200], [0, 200]];
  const fixture = (boundary, diagonals) => ({ unit: 1, walls: [], water: [], boundary, roads: [{ pts: boundary.concat([boundary[0]]) }, ...diagonals.map(pts => ({ pts }))] });
  const straight = fixture(square, [[square[0], [100, 100], square[2]], [square[3], [100, 100], square[1]]]);
  const bent = fixture([[0, 0], [100, -20], [200, 0], [220, 100], [200, 200], [100, 220], [0, 200], [-20, 100]], [
    [[0, 0], [50, 35], [100, 100], [145, 170], [200, 200]],
    [[0, 200], [60, 160], [100, 100], [165, 35], [200, 0]]
  ]);
  bent.roads.push({ pts: [[50, 35], [45, 70]] });
  for (const data of [straight, bent]) {
    const graph = streetTopology(data);
    assert.equal(graph.faces.length, 4);
    assert(graph.faces.every(face => face.sides === 3), 'curving the same graph or adding a dead end does not remove its four triangular divisions');
  }
});

test('street length proof ignores extra samples and small jitter along a ruler-straight route', () => {
  const ruler = [[0, 0], [300, 0]], jitter = Array.from({ length: 31 }, (_, i) => [i * 10, i === 0 || i === 30 ? 0 : i % 2 ? 1.5 : -1.5]);
  assert.deepEqual(straightRuns(ruler, 4), [300]);
  assert.deepEqual(straightRuns(jitter, 4), [300], 'extra vertices and small wiggles cannot disguise one long straight street');
  assert(straightRuns([[0, 0], [100, 30], [200, -20], [300, 0]], 4).every(length => length < 120), 'substantial changes of direction divide the route into actual street runs');
});

test('public-pocket shape proof recognizes rectangles at any rotation', () => {
  for (const angle of [0, .37, .83]) {
    const rectangle = [[-30, -20], [30, -20], [30, 20], [-30, 20]].map(([x, y]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]);
    assert(Math.abs(rectangularFill(rectangle) - 1) < 1e-10, 'rotating a rectangular pad does not make it an irregular public pocket');
  }
});

test('clustered neighborhood streets avoid six-way hubs', () => {
  for (const [seed, options] of fixtures) {
    const data = plan(seed, options), graph = streetTopology(data), tag = `${seed} ${options.size} ${options.water}`;
    assert(graph.faces.length >= 3, tag + ': the town retains actual closed street divisions');
    assert(graph.junctions.every(junction => junction.degree < 6), tag + ': neighborhoods use distributed junctions instead of repeated six-way or seven-way centers');
  }
});

test('clustered neighborhood blocks use distributed street divisions instead of repeated triangular fans', () => {
  for (const [seed, options] of fixtures) {
    const graph = streetTopology(plan(seed, options)), tag = `${seed} ${options.size} ${options.water}`;
    // Before the street revision, the reported seed had 16 triangular faces
    // among 35 dry faces, even after all degree-two bends were disregarded.
    assert(graph.faces.filter(face => face.sides === 3).length <= graph.faces.length * .25, tag + ': occasional bank/perimeter triangles do not dominate the neighborhoods');
    assert(graph.faces.filter(face => face.sides >= 4).length >= graph.faces.length * .6, tag + ': most blocks follow several distributed street junctions');
  }
});

test('clustered streets avoid a collection of long ruler-straight chords', () => {
  for (const [seed, options] of fixtures) {
    const data = plan(seed, options), tag = `${seed} ${options.size} ${options.water}`;
    const longRuns = data.roads.filter(road => road.kind !== 'primary' && road.kind !== 'approach').flatMap(road => straightRuns(road.pts, 4 * data.unit).filter(length => length > 210 * data.unit));
    // The reported seed had four such chords. Keep room for one direct local
    // collector; short lanes, countryside approaches and bridge roads can be
    // straight without reviving a whole neighborhood of ruler-drawn streets.
    assert(longRuns.length <= 1, tag + ': meaningful coarse bends limit repeated long straight street runs');
  }
});

test('clustered markets and neighborhood pockets reserve modest, irregular public land', () => {
  for (const [seed, options] of fixtures) {
    const data = plan(seed, options), tag = `${seed} ${options.size} ${options.water}`, u = data.unit;
    assert(data.plazas.length >= 3, tag + ': several neighborhoods retain actual public pockets');
    for (const square of data.plazas) {
      const area = Math.abs(signedArea(square.polygon)) / (u * u);
      assert(area >= 200 && area <= (square.id === 'market' ? 2200 : 900), tag + ': usable public pockets leave room for adjoining properties');
      assert(rectangularFill(square.polygon) < .95, tag + ': squares are not repeated rectangular pads with cosmetic rotation or extra vertices');
    }
  }
});

test('neighborhood public pockets adjoin actual branching street junctions', () => {
  for (const [seed, options] of fixtures) {
    const data = plan(seed, options), graph = streetTopology(data, false), tag = `${seed} ${options.size} ${options.water}`;
    for (const square of data.plazas.filter(square => square.id !== data.plaza.id)) {
      assert(graph.junctions.some(junction => junction.degree >= 3 && distance(junction.point, [square.x, square.y]) <= 18 * data.unit), tag + ': a neighborhood pocket belongs to a nearby real street junction, rather than an isolated bend or bank contact');
    }
  }
});

test('public squares and their through streets paint one open space without interior outline barriers', () => {
  const plaza = { id: 'market', x: 100, y: 60, polygon: [[60, 30], [140, 30], [140, 90], [60, 90]] };
  const data = { unit: 1, width: 200, height: 120, roads: [{ id: 'through-street', kind: 'street', width: 12, pts: [[20, 60], [180, 60]] }], plaza, plazas: [plaza], buildings: [], sites: [], gates: [], walls: [] };
  const probes = [[60, 60], [140, 60], [100, 54], [100, 66], [59.75, 40], [40, 53.7]];
  for (const legacy of [false, true]) {
    const fixture = { ...data };
    if (legacy) delete fixture.plazas;
    const colors = probes.map(() => 'paper'), stack = [], state = { fillStyle: 'paper', strokeStyle: 'ink', lineWidth: 1 };
    let path = [];
    // Only evaluate these few point probes against the polygon fills and line
    // strokes in this fixture. Canvas clipping, text, decoration and raster
    // antialiasing are irrelevant to the interior paint-order regression.
    const ctx = new Proxy(state, {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          if (key === 'save') stack.push({ ...target });
          if (key === 'restore') Object.assign(target, stack.pop());
          if (key === 'beginPath') path = [];
          if (key === 'moveTo' || key === 'lineTo') path.push(args.slice(0, 2));
          if (key === 'closePath' && path.length) path.push(path[0]);
          if (key === 'fill' || key === 'stroke') for (const [i, p] of probes.entries()) {
            const edgeGap = path.length > 1 ? Math.min(...path.slice(1).map((q, j) => pointSegmentGap(p, path[j], q))) : Infinity;
            if (key === 'fill' ? inside(p, path) || edgeGap < 1e-8 : edgeGap <= target.lineWidth / 2) colors[i] = key === 'fill' ? target.fillStyle : target.strokeStyle;
          }
        };
      },
      set(target, key, value) { target[key] = value; return true; }
    });
    Town.draw(ctx, fixture, { terrain: false, symbols: false, keys: false, text: false, style: { paper: 'paper', ink: 'ink', muted: 'muted' } });
    assert.deepEqual(colors.slice(0, 4), ['paper', 'paper', 'paper', 'paper'], 'both the street opening and the street borders within a public square remain open');
    assert(['muted', 'ink'].includes(colors[4]) && colors[5] === 'ink', 'the square and street retain their outlines outside their shared open space');
  }
});

test('market wells and stalls stay wholly within smaller public pockets and skip unusable imported squares', () => {
  const generated = plan('qexzcjcp', fixtureOptions);
  const tiny = { ...generated, plaza: { id: 'market', x: 100, y: 60, polygon: [[98, 58], [102, 58], [100, 62]] } };
  for (const [data, expectedFixtures] of [[generated, 4], [tiny, 0]]) {
    const shapes = [], stack = [], state = { strokeStyle: 'ink', lineWidth: 1 };
    let path = [];
    const ctx = new Proxy(state, {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          if (key === 'save') stack.push({ ...target });
          if (key === 'restore') Object.assign(target, stack.pop());
          if (key === 'beginPath') path = [];
          if (['moveTo', 'lineTo', 'arc', 'closePath'].includes(key)) path.push([key, ...args]);
          if (key === 'stroke' && target.strokeStyle === 'ink') shapes.push({ path: path.map(command => command.slice()), width: target.lineWidth });
        };
      },
      set(target, key, value) { target[key] = value; return true; }
    });
    // With other symbols and layers absent, the actual renderer's well and
    // stalls are the only shapes. This does not reproduce its fitting search.
    Town.draw(ctx, { ...data, buildings: [] }, { terrain: false, lines: false, keys: false, text: false, style: { ink: 'ink' } });
    assert.equal(shapes.length, expectedFixtures, 'a usable pocket keeps its well and three stalls; a tiny imported square leaves them out');
    const boundary = data.plaza.polygon;
    for (const shape of shapes) {
      const circle = shape.path.find(command => command[0] === 'arc');
      if (circle) {
        const center = circle.slice(1, 3), radius = circle[3] + shape.width / 2;
        assert(inside(center, boundary) && boundary.every((p, i) => pointSegmentGap(center, p, boundary[(i + 1) % boundary.length]) >= radius - 1e-7), 'the complete well and its outline fit inside the public land');
        continue;
      }
      const polygon = shape.path.filter(command => command[0] === 'moveTo' || command[0] === 'lineTo').map(command => command.slice(1, 3));
      assert.equal(polygon.length, 4, 'market stalls remain actual rectangular footprints');
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        for (const t of [0, .25, .5, .75, 1]) {
          const p = mix(a, b, t);
          assert(inside(p, boundary), 'all stall edges remain within the reserved market');
        }
        for (let j = 0; j < boundary.length; j++) {
          const p = boundary[j], q = boundary[(j + 1) % boundary.length];
          const gap = Math.min(pointSegmentGap(a, p, q), pointSegmentGap(b, p, q), pointSegmentGap(p, a, b), pointSegmentGap(q, a, b));
          assert(gap >= shape.width / 2 - 1e-7, 'stall outlines leave the edge of public land clear');
        }
      }
    }
  }
});

test('the reported clustered river town replays and serializes its revised street plan', () => {
  const data = plan('qexzcjcp', fixtureOptions);
  assert.equal(data.seed, 'qexzcjcp');
  assert.equal(data.layout, 'clustered');
  assert.deepEqual(Town.generate('qexzcjcp', fixtureOptions), data);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
  assert.deepEqual(data.options, { size: 'town', water: 'river', walls: 'yes', density: 'normal', layout: 'clustered' });
});
