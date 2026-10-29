'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Town = require('../town.js');
const G = Town.geometry;

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const squared = value => value * value;

// Record paint operations with the canvas state used by each operation, including
// save/restore. This catches colors that leak through individual renderer branches.
function recordingCanvas() {
  const calls = [], stack = [], state = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif', lineCap: 'round', lineJoin: 'round' };
  let path = [];
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        if (key === 'save') stack.push({ ...target });
        if (key === 'restore') Object.assign(target, stack.pop());
        if (key === 'beginPath') path = [];
        if (['moveTo', 'lineTo', 'arc', 'rect', 'closePath'].includes(key)) path.push([key, ...args]);
        const color = ['stroke', 'strokeText'].includes(key) ? target.strokeStyle : target.fillStyle;
        calls.push({ key, args, color, width: target.lineWidth, font: target.font, cap: target.lineCap, join: target.lineJoin, path: path.map(command => command.slice()) });
      };
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  return { ctx, calls };
}

const paintCalls = calls => calls.filter(call => ['fill', 'fillRect', 'fillText', 'stroke', 'strokeText'].includes(call.key));
const grayscale = color => {
  if (typeof color !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) return false;
  const rgb = color.length === 4 ? color.slice(1).split('').map(value => value + value) : [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)];
  return rgb.every(channel => channel.toLowerCase() === rgb[0].toLowerCase());
};

// Independent segment/polygon checks exercise the generated geometry rather
// than reproducing the generator's parcel acceptance decision.
function segmentDistance(point, a, b) {
  const d = squared(b[0] - a[0]) + squared(b[1] - a[1]);
  const t = d ? Math.max(0, Math.min(1, ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / d)) : 0;
  return Math.hypot(point[0] - a[0] - t * (b[0] - a[0]), point[1] - a[1] - t * (b[1] - a[1]));
}

function segmentGap(a, b, c, d) {
  const orientation = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = orientation(a, b, c), abD = orientation(a, b, d), cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return 0;
  return Math.min(segmentDistance(a, c, d), segmentDistance(b, c, d), segmentDistance(c, a, b), segmentDistance(d, a, b));
}

function rotatedBox(x, y, width, depth, angle) {
  return [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]].map(([u, v]) => [x + u * Math.cos(angle) - v * Math.sin(angle), y + u * Math.sin(angle) + v * Math.cos(angle)]);
}

function assertConnectedStreets(data, tag) {
  const connected = new Set(data.roads.filter(road => G.polygonRoadDistance(data.plaza.polygon, road) <= road.width / 2));
  for (;;) {
    const before = connected.size;
    for (const road of data.roads) if (!connected.has(road)) {
      const joins = [...connected].some(other => road.pts.slice(1).some((p, i) => other.pts.slice(1).some((q, j) => segmentGap(road.pts[i], p, other.pts[j], q) <= (road.width + other.width) / 2 + 1e-5)));
      if (joins) connected.add(road);
    }
    if (connected.size === before) break;
  }
  assert.equal(connected.size, data.roads.length, tag + ': all painted streets reach the market');
}

function assertFinitePoints(points, data, context) {
  assert(points.length >= 2, context + ': at least two points');
  for (const point of points) {
    assert(point.length === 2 && point.every(Number.isFinite), context + ': finite coordinate pair');
    assert(point[0] >= -1e-5 && point[0] <= data.width + 1e-5, context + ': x in map');
    assert(point[1] >= -1e-5 && point[1] <= data.height + 1e-5, context + ': y in map');
  }
}

test('deterministic, JSON-serializable towns preserve the seed and options', () => {
  const opts = { size: 'town', water: 'river', density: 'dense', walls: 'yes', width: 1000, height: 800 };
  const first = Town.generate('1661809745', opts);
  assert.deepEqual(first, Town.generate('1661809745', opts));
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.notDeepEqual(first, Town.generate('1661809746', opts));
  assert.deepEqual(first.options, { size: 'town', water: 'river', walls: 'yes', density: 'dense', layout: 'varied' });
  assert.equal(first.seed, '1661809745');
});

test('geometry helpers distinguish crossings, containment, and clearance', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert(G.pointInPolygon([5, 5], square));
  assert(!G.pointInPolygon([15, 5], square));
  assert(G.polygonsOverlap(square, [[9, 1], [12, 1], [12, 8], [9, 8]]));
  assert(!G.polygonsOverlap(square, [[11, 1], [12, 1], [12, 8], [11, 8]]));
  assert(G.polygonsOverlap(square, [[11, 1], [12, 1], [12, 8], [11, 8]], 2));
  assert.equal(G.polygonRoadDistance(square, { pts: [[-5, 5], [15, 5]] }), 0);
  assert.equal(G.polygonRoadDistance(square, { pts: [[-5, 15], [15, 15]] }), 5);
  assert(G.polygonIntersects(square, [[-1, 4], [11, 4], [11, 6], [-1, 6]]));
});

for (const seed of ['1661809745', 'old-road', '42']) {
  for (const size of ['village', 'town', 'city']) {
    for (const water of ['none', 'river', 'coast']) {
      test(`${seed}: ${size} / ${water} has usable, collision-free parcels and connected gates`, () => {
        const data = Town.generate(seed, { size, water, density: 'normal' });
        if (Array.isArray(data.parcels)) {
          // Count occupied properties, rather than allowing sheds to inflate a
          // roof total. Geometry, density and open space have separate proofs.
          const occupied = new Set(data.buildings.filter(building => building.role === 'main').map(building => building.parcelId));
          assert(occupied.size >= ({ village: 12, town: 20, city: 30 })[size], 'enough inhabited main-house properties');
        } else assert(data.buildings.length >= (size === 'village' ? 40 : 110), 'enough visible legacy building parcels');
        assert(data.districts.length >= 4);
        const ids = new Set();
        for (const object of [...data.buildings, ...data.roads, ...data.sites, ...data.gates]) {
          assert(!ids.has(object.id), 'stable unique object ids: ' + object.id);
          ids.add(object.id);
        }
        for (const [index, building] of data.buildings.entries()) {
          assertFinitePoints(building.polygon, data, building.id);
          assert(G.pointInPolygon([building.x, building.y], building.polygon));
          assert(!G.polygonsOverlap(building.polygon, data.plaza.polygon), building.id + ' leaves market square clear');
          assert(data.roads.some(road => road.id === building.roadId), 'frontage references a street');
          for (const body of data.water) assert(!G.polygonIntersects(building.polygon, body.polygon), building.id + ' is on dry land');
          for (const road of data.roads) assert(G.polygonRoadDistance(building.polygon, road) >= road.width / 2 + 1.49 * data.unit, building.id + ' leaves full street width clear');
          for (let j = index + 1; j < data.buildings.length; j++) assert(!G.polygonsOverlap(building.polygon, data.buildings[j].polygon, 2 * data.unit), 'houses have a gap: ' + building.id + '/' + data.buildings[j].id);
        }
        for (const road of data.roads) {
          assertFinitePoints(road.pts, data, road.id);
          assert(road.width > 0 && Number.isFinite(road.width));
        }
        const wall = data.walls[0].pts;
        for (const gate of data.gates) {
          const road = data.roads.find(r => r.id === gate.roadId);
          assert(road && road.kind === 'primary' && road.to === gate.id, 'actual gate has an interior access road');
          assert(distance(road.pts.at(-1), [gate.x, gate.y]) < .001);
          assert(Math.min(...wall.map((p, i) => segmentDistance([gate.x, gate.y], p, wall[(i + 1) % wall.length]))) < .001, 'gate is on finished wall');
          assert(!data.water.some(body => G.pointInPolygon([gate.x, gate.y], body.polygon)), 'gate stands on dry land');
        }
        for (const farm of data.farms) assert(!G.polygonIntersects(farm.polygon, wall), 'fields are outside settlement');
        assert(data.sites.length >= 6);
        const numbers = Town.siteNumberLayout(data);
        assert.equal(numbers.length, data.sites.length);
        for (const [i, site] of data.sites.entries()) {
          assert.equal(site.label, String(i + 1));
          assert(site.name.length > 3 && site.notes.includes('Contact:') && site.notes.includes('Adventure lead:'));
          assert.equal(site.gm, false);
          if (site.buildingId) assert(data.buildings.some(b => b.id === site.buildingId && b.siteId === site.id));
          assert.deepEqual(Town.hitTest(data, site.x, site.y), { kind: 'site', id: site.id, index: i });
          const number = numbers[i], box = number.box;
          assert.equal(number.id, site.id);
          const footprint = [[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]];
          assert(data.buildings.every(building => !G.polygonIntersects(footprint, building.polygon)), 'number leaves every building roof visible: ' + site.id);
          for (let j = i + 1; j < numbers.length; j++) {
            const other = numbers[j].box;
            assert(box.left >= other.right || box.right <= other.left || box.top >= other.bottom || box.bottom <= other.top, 'location numbers have separate text footprints');
          }
          assert.deepEqual(Town.hitTest(data, number.x, number.y), { kind: 'site', id: site.id, index: i }, 'displayed number remains selectable');
        }
        if (water === 'none') assert.equal(data.water.length + data.bridges.length + data.docks.length, 0);
        if (water === 'river') {
          for (const bridge of data.bridges) assert(data.roads.some(r => r.kind === 'primary' && r.id === bridge.roadId));
        }
        if (water === 'coast') assert.equal(data.docks.length, 3);
      });
    }
  }
}

test('river-side gate approaches do not resume as disconnected opposite-bank roads', () => {
  const data = Town.generate('release-town-2', { width: 1000, height: 800, water: 'river', size: 'village' });
  const gate = data.gates.find(gate => gate.id === 'gate-2');
  const approaches = data.roads.filter(road => road.kind === 'approach' && road.from === gate.id);
  assert.equal(approaches.length, 1, 'only the dry road attached to South Gate remains');
  assert(distance(approaches[0].pts[0], [gate.x, gate.y]) < .001, 'the approach starts at its real gate');
  for (const side of [-1, 1]) {
    const tower = rotatedBox(gate.x - Math.sin(gate.angle) * 10 * data.unit * side, gate.y + Math.cos(gate.angle) * 10 * data.unit * side, 11.2 * data.unit, 12.2 * data.unit, gate.angle);
    assert(data.water.every(body => !G.polygonIntersects(tower, body.polygon)), 'the full South Gate towers and outlines stand on dry land');
  }
  const end = approaches[0].pts.at(-1);
  assert(Math.min(Math.abs(end[0]), Math.abs(end[1]), Math.abs(data.width - end[0]), Math.abs(data.height - end[1])) < .001, 'South Gate reaches the actual sheet boundary rather than stopping inside the map');
  assert(data.water.every(body => G.polygonRoadDistance(body.polygon, approaches[0]) >= approaches[0].width / 2 + .9 * data.unit), 'the whole approach stays on its dry bank');
});

test('a gate approach detours around the river instead of clipping into disconnected fragments', () => {
  const data = Town.generate('regression-route-1', { layout: 'organic', water: 'river', size: 'village' });
  const gate = data.gates.find(gate => gate.id === 'gate-3');
  const routes = data.roads.filter(road => road.kind === 'approach' && road.from === gate.id);
  assert.equal(routes.length, 1, 'the gate has one continuous exterior route');
  const route = routes[0];
  assert(route.pts.length > 2, 'this fixture needs a genuine river-bank detour');
  assert(distance(route.pts[0], [gate.x, gate.y]) < .001);
  assert(data.water.every(body => G.polygonRoadDistance(body.polygon, route) >= route.width / 2 + .9 * data.unit), 'the entire detour and road edges stay dry');
  const end = route.pts.at(-1);
  assert(Math.min(Math.abs(end[0]), Math.abs(end[1]), Math.abs(end[0] - data.width), Math.abs(end[1] - data.height)) < .001, 'the detour reaches the actual sheet boundary');
});

test('river and coastal approaches remain attached to gates across seeds and map shapes', () => {
  for (const [width, height] of [[1000, 800], [600, 500], [3000, 500], [600, 3000]]) {
    for (const water of ['none', 'river', 'coast']) for (const size of ['village', 'city']) for (const seed of ['release-town-2', 'release-town-5', 'release-town-7']) {
      const data = Town.generate(seed, { width, height, water, size });
      const tag = `${seed} ${width}x${height} ${water} ${size}`;
      assert(data.gates.length >= 2, tag + ': usable land entrances remain');
      assert.equal(data.roads.filter(road => road.kind === 'approach').length, data.gates.length, tag + ': every gate has one countryside approach');
      assertConnectedStreets(data, tag);
      for (const gate of data.gates) {
        for (const side of [-1, 1]) {
          const tower = rotatedBox(gate.x - Math.sin(gate.angle) * 10 * data.unit * side, gate.y + Math.cos(gate.angle) * 10 * data.unit * side, 11.2 * data.unit, 12.2 * data.unit, gate.angle);
          assert(data.water.every(body => !G.polygonIntersects(tower, body.polygon)), tag + ': entire gate tower is dry');
          assert(data.buildings.every(building => !G.polygonIntersects(tower, building.polygon)), tag + ': gate towers do not overlap houses');
        }
        const inside = [gate.x - Math.cos(gate.angle) * 10 * data.unit, gate.y - Math.sin(gate.angle) * 10 * data.unit];
        const outside = [gate.x + Math.cos(gate.angle) * 10 * data.unit, gate.y + Math.sin(gate.angle) * 10 * data.unit];
        if (data.walls.length) {
          assert(G.pointInPolygon(inside, data.walls[0].pts), tag + ': gate points through the wall');
          assert(!G.pointInPolygon(outside, data.walls[0].pts), tag + ': gate points out of the wall');
        }
      }
      for (const road of data.roads.filter(road => road.kind === 'approach')) {
        const gate = data.gates.find(gate => gate.id === road.from);
        assert(gate, tag + ': countryside road has an actual gate');
        assert(distance(road.pts[0], [gate.x, gate.y]) < .001, tag + ': no detached opposite-bank fragment');
        const end = road.pts.at(-1);
        assert(Math.min(Math.abs(end[0]), Math.abs(end[1]), Math.abs(data.width - end[0]), Math.abs(data.height - end[1])) < .001, tag + ': access reaches the actual sheet boundary');
        assert(data.water.every(body => G.polygonRoadDistance(body.polygon, road) >= road.width / 2 + .9 * data.unit), tag + ': full approach width stays dry');
        for (let i = 1; i < road.pts.length; i++) {
          const a = road.pts[i - 1], b = road.pts[i], count = Math.max(1, Math.ceil(distance(a, b) / (4 * data.unit)));
          for (let sample = 0; sample <= count; sample++) {
            const point = [a[0] + (b[0] - a[0]) * sample / count, a[1] + (b[1] - a[1]) * sample / count];
            assert(data.water.every(body => !G.pointInPolygon(point, body.polygon)), tag + ': gate approach stays on dry ground');
          }
        }
      }
    }
  }
});

test('minimum and wide map sizes keep all lots and roads inside bounds', () => {
  for (const dimensions of [[600, 500], [1400, 700], [800, 1200]]) {
    const [width, height] = dimensions;
    const data = Town.generate('a', { width, height, size: 'city', water: 'river', density: 'dense', walls: 'no' });
    assert.deepEqual(data.bounds, { x: 0, y: 0, width, height });
    assert.equal(data.walls.length, 0);
    for (const building of data.buildings) assertFinitePoints(building.polygon, data, building.id);
    for (const road of data.roads) assertFinitePoints(road.pts, data, road.id);
  }
});

test('town crossings, bank streets, quays, and vegetation respect their complete footprints', () => {
  for (const [width, height] of [[1000, 800], [3000, 500], [600, 3000], [4000, 3200]]) for (const water of ['river', 'coast']) for (const size of ['village', 'city']) for (const seed of ['release-town-0', 'release-town-2', 'release-town-3']) {
    const data = Town.generate(seed, { width, height, water, size }), tag = `${seed} ${width}x${height} ${water} ${size}`;
    for (const road of data.roads) {
      if (road.kind !== 'primary') {
        assert(data.water.every(body => G.polygonRoadDistance(body.polygon, road) >= road.width / 2 + .7 * data.unit), tag + ': bank street edges stay dry: ' + road.id);
      } else for (let i = 1; i < road.pts.length; i++) {
        const a = road.pts[i - 1], b = road.pts[i], length = distance(a, b);
        if (!length) continue;
        const nx = -(b[1] - a[1]) / length, ny = (b[0] - a[0]) / length;
        for (let sample = 0; sample <= 24; sample++) for (const side of [-.5, 0, .5]) {
          const p = [a[0] + (b[0] - a[0]) * sample / 24 + nx * road.width * side, a[1] + (b[1] - a[1]) * sample / 24 + ny * road.width * side];
          if (!data.water.some(body => G.pointInPolygon(p, body.polygon))) continue;
          assert(data.bridges.some(bridge => bridge.roadId === road.id && bridge.pts.slice(1).some((q, j) => segmentDistance(p, bridge.pts[j], q) <= bridge.width / 2 + .001)), tag + ': every wet part of the paved road has a bridge deck');
        }
      }
      if (road.kind === 'quay' && data.walls.length) {
        const wall = data.walls[0].pts;
        const gap = Math.min(...wall.flatMap((p, i) => road.pts.slice(1).map((q, j) => segmentGap(p, wall[(i + 1) % wall.length], road.pts[j], q))));
        assert(road.pts.every(p => G.pointInPolygon(p, wall)) && gap > road.width / 2 + 5.9 * data.unit, tag + ': quays stay inside the perimeter without ungated wall crossings');
      }
    }
    for (const bridge of data.bridges) {
      assert(bridge.pts.length >= 2);
      for (const end of [bridge.pts[0], bridge.pts.at(-1)]) for (const body of data.water) {
        assert(!G.pointInPolygon(end, body.polygon), tag + ': bridge ends on a bank');
        assert(Math.min(...body.polygon.map((p, i) => segmentDistance(end, p, body.polygon[(i + 1) % body.polygon.length]))) >= bridge.width / 2 + 1.9 * data.unit, tag + ': the entire bridge end and railings clear the water');
      }
      for (const building of data.buildings) assert(G.polygonRoadDistance(building.polygon, bridge) >= bridge.width / 2 + 1.49 * data.unit, tag + ': bridge decks leave houses clear');
    }
    for (const dock of data.docks) {
      assert(data.roads.some(road => road.kind === 'quay' && G.polygonRoadDistance(dock.polygon, road) < road.width / 2), tag + ': piers attach to an actual quay');
      assert(data.water.some(body => G.polygonIntersects(dock.polygon, body.polygon)), tag + ': piers reach the water');
      assert(data.buildings.every(building => !G.polygonIntersects(building.polygon, dock.polygon)), tag + ': pier landings do not overlap houses');
    }
    for (const tree of data.trees) {
      const canopy = rotatedBox(tree.x, tree.y, tree.radius * 2 + .75 * data.unit, tree.radius * 2 + .75 * data.unit, 0);
      assert(data.water.every(body => !G.polygonIntersects(canopy, body.polygon)), tag + ': full tree canopy is on land');
      assert(data.farms.every(farm => !G.polygonIntersects(canopy, farm.polygon)), tag + ': tree canopies do not cover crop fields');
    }
    const site = data.sites.find(site => site.name === 'The River Crossing');
    if (site) assert(data.bridges.some(bridge => bridge.pts.slice(1).some((p, i) => segmentDistance([site.x, site.y], bridge.pts[i], p) < .001)), tag + ': river crossing key sits on the complete bridge');
  }
});

test('bent bridges draw and expose their complete polyline', () => {
  // Isolate the renderer's edited/imported polyline contract. The generated
  // bridge bank, width, and parcel invariants are exercised by the matrix above.
  const data = Town.generate('bent-bridge-renderer', { water: 'none', size: 'village' });
  const points = [[40, 40], [90, 65], [140, 65]];
  const road = { id: 'edited-crossing', kind: 'primary', width: 12, pts: points.map(point => point.slice()) };
  const bridge = { id: 'edited-bridge', roadId: road.id, width: 18, pts: points.map(point => point.slice()) };
  data.roads = [road]; data.bridges = [bridge];
  const { ctx, calls } = recordingCanvas();
  Town.draw(ctx, data, { text: false, keys: false, symbols: false });
  const expected = bridge.pts.map((p, i) => [i ? 'lineTo' : 'moveTo', ...p]);
  assert(calls.some(call => call.key === 'stroke' && call.width === bridge.width && call.color === '#fff' && JSON.stringify(call.path) === JSON.stringify(expected)), 'the full bridge deck is painted');
  for (let i = 1; i < bridge.pts.length; i++) {
    const a = bridge.pts[i - 1], b = bridge.pts[i], midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const hit = Town.hitTest(data, ...midpoint, { keys: false, symbols: false });
    assert.equal(hit.kind, 'road', 'all bridge spans remain selectable as streets');
    assert.equal(hit.id, bridge.roadId, 'bridge span selects its linked street');
    const nx = -(b[1] - a[1]) / distance(a, b), ny = (b[0] - a[0]) / distance(a, b);
    for (const side of [-1, 1]) {
      const rail = [a, b].map(p => [p[0] + nx * bridge.width / 2 * side, p[1] + ny * bridge.width / 2 * side]).map((p, j) => [j ? 'lineTo' : 'moveTo', ...p]);
      assert(calls.some(call => call.key === 'stroke' && call.color === '#000' && call.width === 1.2 * data.unit && JSON.stringify(call.path) === JSON.stringify(rail)), 'every bridge span has both railings');
    }
  }
});

test('rendered fortifications leave the full river channel open at every scale', () => {
  for (const [width, height] of [[1000, 800], [4000, 3200]]) {
    const data = Town.generate('release-town-2', { width, height, water: 'river' }), { ctx, calls } = recordingCanvas();
    Town.draw(ctx, data, { text: false, keys: false, symbols: false });
    const wall = data.walls[0];
    const strokes = calls.filter(call => call.key === 'stroke' && call.color === '#000' && call.width === wall.width + 2 * data.unit);
    assert(strokes.length >= 2, 'river bank openings split the rendered perimeter');
    for (const stroke of strokes) {
      const pts = stroke.path.filter(command => command[0] === 'moveTo' || command[0] === 'lineTo').map(command => command.slice(1));
      assert(data.water.every(body => G.polygonRoadDistance(body.polygon, { pts }) >= (wall.width + 2 * data.unit) / 2 - .001), 'wall outlines do not dam or overpaint the river');
    }
  }
});

test('open settlements retain countryside roads without fortress towers or gate labels', () => {
  for (const walls of ['yes', 'no']) {
    const data = Town.generate('open-settlement', { water: 'none', walls }), { ctx, calls } = recordingCanvas();
    Town.draw(ctx, data, { text: true });
    const gate = data.gates[0], u = data.unit;
    const tower = rotatedBox(gate.x - Math.sin(gate.angle) * 10 * u, gate.y + Math.cos(gate.angle) * 10 * u, 10 * u, 11 * u, gate.angle);
    const path = tower.map((p, i) => [i ? 'lineTo' : 'moveTo', ...p]).concat([['closePath']]);
    const hasTower = calls.some(call => call.key === 'fill' && call.color === '#dedede' && JSON.stringify(call.path) === JSON.stringify(path));
    assert.equal(hasTower, walls === 'yes', 'towers appear only at an actual fortified perimeter');
    assert(data.gates.every(gate => gate.name.endsWith(walls === 'yes' ? 'Gate' : 'Road')), 'entrance names describe the selected settlement type');
    assert.equal(data.roads.filter(road => road.kind === 'approach').length, data.gates.length, 'open settlement entrances retain all road connections');
  }
});

test('countryside roads meet the framed map edge with clipped square-ended strokes', () => {
  const data = Town.generate('coastal-village-variety-0', { size: 'village', water: 'coast', walls: 'no', density: 'sparse' });
  const framePath = path => {
    if (path.some(command => command[0] === 'rect' && command[1] === 0 && command[2] === 0 && command[3] === data.width && command[4] === data.height)) return true;
    const points = path.filter(command => command[0] === 'moveTo' || command[0] === 'lineTo').map(command => command.slice(1));
    const corners = [[0, 0], [data.width, 0], [data.width, data.height], [0, data.height]];
    return path.some(command => command[0] === 'closePath') && points.length >= 4 && points.length <= 5 && corners.every(corner => points.some(point => distance(point, corner) < .001)) && points.every(point => corners.some(corner => distance(point, corner) < .001));
  };
  const isFrame = call => call.key === 'strokeRect' && JSON.stringify(call.args) === JSON.stringify([0, 0, data.width, data.height]) || call.key === 'stroke' && framePath(call.path);
  for (const exporting of [false, true]) {
    const { ctx, calls } = recordingCanvas();
    Town.draw(ctx, data, { terrain: false, symbols: false, keys: false, text: false, exporting });
    assert.equal(ctx.lineCap, 'round', 'drawing restores the caller canvas cap');
    const clipIndex = calls.findIndex(call => call.key === 'clip' && framePath(call.path));
    assert(clipIndex >= 0, 'town drawing clips to the exact framed field bounds');
    let lastRoadIndex = -1;
    for (const road of data.roads.filter(road => road.kind === 'approach')) {
      const end = road.pts.at(-1);
      assert(Math.min(Math.abs(end[0]), Math.abs(end[1]), Math.abs(data.width - end[0]), Math.abs(data.height - end[1])) < .001, 'the road reaches the visible field frame');
      const path = JSON.stringify(road.pts.map((point, i) => [i ? 'lineTo' : 'moveTo', ...point]));
      const strokes = calls.map((call, index) => ({ call, index })).filter(({ call }) => call.key === 'stroke' && JSON.stringify(call.path) === path);
      assert.equal(strokes.length, 2, 'the complete approach has both an outline and a white street surface');
      assert(strokes.every(({ call, index }) => call.cap === 'butt' && call.join === 'round' && index > clipIndex), 'both street passes have square ends and smooth joins inside the sheet clip');
      assert(strokes.some(({ call }) => call.color === '#000' && call.width > road.width));
      assert(strokes.some(({ call }) => call.color === '#fff' && call.width === road.width));
      lastRoadIndex = Math.max(lastRoadIndex, ...strokes.map(stroke => stroke.index));
    }
    const internal = data.roads.find(road => road.kind !== 'approach');
    const internalPath = JSON.stringify(internal.pts.map((point, i) => [i ? 'lineTo' : 'moveTo', ...point]));
    const internalStrokes = calls.filter(call => call.key === 'stroke' && JSON.stringify(call.path) === internalPath);
    assert.equal(internalStrokes.length, 2, 'an interior street retains both paint passes');
    assert(internalStrokes.every(call => call.cap === 'round' && call.join === 'round'), 'interior streets retain round ends for their painted junction contacts');
    assert(calls.some((call, index) => isFrame(call) && index > lastRoadIndex), 'the neatline is drawn over the finished map so countryside routes visibly leave it');
  }
  const { ctx, calls } = recordingCanvas();
  Town.draw(ctx, data, { terrain: false, symbols: false, keys: false, text: false, lines: false });
  assert(!calls.some(isFrame), 'the map frame follows the line layer');
  const edited = JSON.parse(JSON.stringify(data)), route = edited.roads.find(road => road.kind === 'approach');
  const a = route.pts.at(-2), b = route.pts.at(-1);
  route.pts[route.pts.length - 1] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const before = JSON.stringify(edited), recorded = recordingCanvas();
  Town.draw(recorded.ctx, edited, { terrain: false, symbols: false, keys: false, text: false });
  const editedPath = JSON.stringify(route.pts.map((point, i) => [i ? 'lineTo' : 'moveTo', ...point]));
  assert.equal(recorded.calls.filter(call => call.key === 'stroke' && JSON.stringify(call.path) === editedPath).length, 2, 'an imported or manually shortened road retains its chosen endpoint');
  assert.equal(JSON.stringify(edited), before, 'rendering does not autoextend or rewrite saved road geometry');
});

test('settlement size and density create materially different town plans', () => {
  const village = Town.generate('example', { size: 'village', water: 'none' });
  const city = Town.generate('example', { size: 'city', water: 'none' });
  const occupiedCount = data => Array.isArray(data.parcels) ? data.buildings.filter(building => building.role === 'main').length : data.buildings.length;
  assert(occupiedCount(city) > occupiedCount(village) * 1.5, 'cities have substantially more inhabited properties than villages');
  const polygonArea = polygon => Math.abs(polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const occupation = data => Array.isArray(data.parcels) ? data.buildings.reduce((sum, building) => sum + polygonArea(building.polygon), 0) / data.parcels.reduce((sum, parcel) => sum + polygonArea(parcel.polygon), 0) : data.buildings.length;
  let sparse = 0, dense = 0;
  for (const seed of ['a', 'b', 'c', 'd']) {
    sparse += occupation(Town.generate(seed, { density: 'sparse', water: 'none' }));
    dense += occupation(Town.generate(seed, { density: 'dense', water: 'none' }));
  }
  assert(dense > sparse * 1.1, 'density increases actual property occupation');
});

test('hidden and disabled items cannot be hit in player view', () => {
  const data = Town.generate('selection', { water: 'none' });
  const site = data.sites[0];
  site.gm = true;
  assert.equal(Town.hitTest(data, site.x, site.y, { view: 'player', lines: false }), null);
  assert.equal(Town.hitTest(data, site.x, site.y, { keys: false, lines: false }), null);
  const building = data.buildings.find(b => !b.siteId);
  assert.equal(Town.hitTest(data, building.x, building.y).id, building.id);
  building.gm = true;
  assert.equal(Town.hitTest(data, building.x, building.y, { view: 'player' }), null);
  assert.equal(Town.hitTest(data, building.x, building.y, { symbols: false }), null);
});

test('street selection follows polyline geometry, visible layers, privacy, and foreground priority', () => {
  const data = {
    unit: 1,
    sites: [{ id: 'key', x: 80, y: 0 }],
    buildings: [{ id: 'house', polygon: [[30, -4], [40, -4], [40, 4], [30, 4]] }],
    roads: [
      { id: 'bend', width: 10, pts: [[0, 0], [100, 0], [100, 80]] },
      { id: 'parallel', width: 10, pts: [[0, 10], [100, 10]] }
    ]
  };
  assert.deepEqual(Town.hitTest(data, 99, 60), { kind: 'road', id: 'bend', index: 0 }, 'later polyline segment is selectable');
  assert.equal(Town.hitTest(data, 20, 1).id, 'bend', 'nearest street wins beside a parallel street');
  assert.equal(Town.hitTest(data, 20, -6).id, 'bend', 'visible street edge has a small hit margin');
  assert.equal(Town.hitTest(data, 20, -10), null, 'empty ground outside the street remains empty');
  assert.equal(Town.hitTest(data, 99, 60, { lines: false }), null);
  assert.equal(Town.hitTest(data, 35, 0).kind, 'building', 'building above the street remains selectable');
  assert.equal(Town.hitTest(data, 80, 0).kind, 'site', 'key above the street remains selectable');
  assert.equal(Town.hitTest(data, 80, 0, { keys: false }).kind, 'road', 'visible street can be selected below a disabled key layer');
  data.roads[0].gm = true;
  assert.equal(Town.hitTest(data, 99, 60, { view: 'player' }), null);
  assert.equal(Town.hitTest(data, 99, 60, { view: 'gm' }).id, 'bend');
});

test('street highlights are visible while editing and absent from exports and hidden layers', () => {
  const data = Town.generate('street-highlight', { water: 'river' });
  const road = data.roads[0], strokes = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return () => { if (key === 'stroke') strokes.push({ color: target.strokeStyle, width: target.lineWidth }); };
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  const highlights = () => strokes.filter(s => s.color === '#c9a227');
  Town.draw(ctx, data, { selectedId: road.id });
  assert.equal(highlights().length, 1, 'selected street has a gold outline around its white surface');
  assert.equal(highlights()[0].width, road.width + 3 * data.unit);
  for (const config of [{ exporting: true }, { lines: false }, { view: 'player' }]) {
    road.gm = config.view === 'player'; strokes.length = 0;
    Town.draw(ctx, data, { selectedId: road.id, ...config });
    assert.equal(highlights().length, 0, 'selection cannot leak into export or hidden street rendering');
  }
});

test('a private street hides its attached bridge in player view', () => {
  const data = Town.generate('private-bridge', { water: 'river' });
  const bridge = data.bridges[0], road = data.roads.find(r => r.id === bridge.roadId), { ctx, calls } = recordingCanvas();
  data.bridges = [bridge]; road.gm = true;
  const bridgePath = JSON.stringify([['moveTo', ...bridge.pts[0]], ['lineTo', ...bridge.pts[1]]]);
  const hasBridgeDeck = () => calls.some(call => call.key === 'stroke' && call.color === '#fff' && call.width === bridge.width && JSON.stringify(call.path) === bridgePath);
  Town.draw(ctx, data, { view: 'gm' });
  assert(hasBridgeDeck(), 'the bridge is visible to the GM');
  calls.length = 0;
  Town.draw(ctx, data, { view: 'player' });
  assert(!hasBridgeDeck(), 'the bridge does not reveal a hidden road');
});

test('renderer accepts edited/manual buildings, honors layers, and never paints private notes', () => {
  const data = Town.generate('render', { water: 'coast' });
  data.buildings.push({ id: 'manual', x: 50, y: 50, angle: 0, polygon: [[38, 41], [62, 41], [62, 59], [38, 59]] });
  const text = [], calls = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { calls.push(key); if (key === 'fillText' || key === 'strokeText') text.push(args[0]); for (const value of args) if (typeof value === 'number') assert(Number.isFinite(value), 'canvas receives finite geometry: ' + key); };
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  data.sites[0].gm = true;
  data.sites[1].notes = 'PRIVATE_SENTINEL';
  data.sites.splice(2, 1);
  Town.draw(ctx, data, { view: 'player', text: false });
  assert(!text.includes('1'), 'hidden first key is not drawn');
  assert(!text.includes('3')&&text.includes('4'), 'deleted keys leave a gap while surviving location numbers stay stable');
  assert(!text.some(value => String(value).includes('PRIVATE_SENTINEL')));
  text.length = 0; calls.length = 0;
  Town.draw(ctx, data, { terrain: false, symbols: false, lines: false, keys: false, text: false });
  assert.equal(calls.filter(name => name === 'fill' || name === 'stroke' || name === 'fillText' || name === 'fillRect').length, 0);
});


test('town location numbers have no filled badges and preserve private text and export guards', () => {
  const data = Town.generate('number-rendering', { water: 'none' });
  data.sites[0].name = 'PRIVATE_LOCATION_NAME'; data.sites[0].notes = 'PRIVATE_LOCATION_NOTES'; data.sites[1].gm = true;
  const calls = [], ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push({ key, args, color: target.fillStyle });
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  const config = { terrain: false, lines: false, symbols: false, text: false, view: 'player', selectedId: data.sites[0].id };
  Town.draw(ctx, data, config);
  assert(!calls.some(call => ['arc', 'fill', 'stroke', 'fillRect'].includes(call.key)), 'numbers draw only glyphs, with no circle or opaque badge');
  const printed = calls.filter(call => call.key === 'fillText');
  assert(printed.some(call => call.args[0] === '1'));
  assert(!printed.some(call => call.args[0] === '2'), 'private numbers stay hidden');
  assert(printed.every(call => /^\d+$/.test(call.args[0])), 'private names and notes never become map labels');
  assert(printed.some(call => call.color === '#c9a227'), 'the selected number has the shared editor text highlight');
  calls.length = 0; Town.draw(ctx, data, { ...config, exporting: true });
  assert(!calls.some(call => call.color === '#c9a227'), 'selection text color does not enter exports');
});

for (const water of ['none', 'river', 'coast']) {
  test(`monochrome ${water} towns keep every painted layer neutral in GM and player maps`, () => {
    const data = Town.generate('monochrome-' + water, { water });
    data.sites[0].gm = true; data.buildings[0].gm = true; data.roads[0].gm = true;
    const before = JSON.stringify(data);
    for (const view of ['gm', 'player']) for (const layers of [{}, { terrain: false }, { symbols: false }, { lines: false }, { keys: false, text: false }]) {
      const { ctx, calls } = recordingCanvas();
      Town.draw(ctx, data, { view, ...layers });
      const painted = paintCalls(calls);
      assert(painted.length > 0);
      for (const call of painted) assert(grayscale(call.color), `${view} ${JSON.stringify(layers)} ${call.key} paints ${call.color}`);
      if (layers.terrain !== false) assert.equal(painted[0].key + ':' + painted[0].color, 'fillRect:#fff', 'town paper matches the white dungeon and wilderness paper');
      for (const call of painted.filter(call => call.key === 'fillText')) {
        assert.match(call.font, /^\b(?:bold 11|italic 10)px Georgia,serif$/, 'town map labels use the shared serif face');
        assert.equal(call.color, '#000', 'normal numeric keys and public labels use black ink');
      }
    }
    assert.equal(JSON.stringify(data), before, 'style conversion does not mutate saved geometry, seed, or private annotations');
  });
}

test('town terrain and roofs use neutral line patterns on white paper', () => {
  const data = Town.generate('pattern-proof', { water: 'river' });
  const { ctx, calls } = recordingCanvas();
  Town.draw(ctx, data);
  assert(data.farms.length && data.water.length && data.buildings.length);
  const strokes = calls.filter(call => call.key === 'stroke');
  assert(calls.filter(call => call.key === 'clip').length >= data.farms.length + data.water.length, 'field rows and water ripples are clipped to their terrain');
  assert(strokes.some(call => call.color === '#777' && call.width === .7 * data.unit), 'fields retain fine crop rows');
  assert(strokes.some(call => call.color === '#777' && call.width === .65 * data.unit && call.path.length === 3), 'water retains fine ripple marks');
  assert(strokes.filter(call => call.color === '#777' && call.width === .5 * data.unit).length >= 3 * data.buildings.length, 'every roof has fine line courses in place of colored fill');
  assert(calls.some(call => call.key === 'fill' && call.color === '#c4c4c4'), 'water uses the same gray as wilderness water');
  const roofs = new Set(data.buildings.map(building => JSON.stringify([['moveTo', ...building.polygon[0]], ...building.polygon.slice(1).map(point => ['lineTo', ...point]), ['closePath']])));
  const roofFills = calls.filter(call => call.key === 'fill' && roofs.has(JSON.stringify(call.path)));
  assert.equal(roofFills.length, data.buildings.length * 2, 'each roof has a light offset shadow and a white surface');
  assert(roofFills.every(call => call.color === '#fff' || call.color === '#dedede'));
});

test('shared town style controls editor accents while all exports suppress selections', () => {
  const data = Town.generate('shared-style', { water: 'coast' });
  const style = { paper: '#ffffff', ink: '#111111', shade: '#dddddd', water: '#cccccc', muted: '#888888', selection: '#c9a227', labelFont: 'Georgia,serif', numberFont: 'Georgia,serif' };
  for (const object of [data.roads[0], data.buildings[0], data.sites[0]]) {
    const { ctx, calls } = recordingCanvas();
    Town.draw(ctx, data, { selectedId: object.id, style });
    const painted = paintCalls(calls);
    assert(painted.some(call => call.color === style.selection), 'road, roof, and numeric selections use the shared editor accent');
    assert(painted.every(call => grayscale(call.color) || call.color === style.selection));
    assert(painted.some(call => call.color === style.paper) && painted.some(call => call.color === style.ink));
    assert(painted.some(call => call.color === style.water), 'shared water shade reaches the renderer');
    for (const view of ['gm', 'player']) {
      calls.length = 0;
      Town.draw(ctx, data, { selectedId: object.id, exporting: true, view, style });
      assert(paintCalls(calls).every(call => grayscale(call.color)), 'exports stay monochrome even with an active editor selection');
    }
  }
});

test('number layout is deterministic, follows moved anchors, and respects visible layers', () => {
  const data = Town.generate('number-layout', { water: 'river' });
  const before = JSON.stringify(data), first = Town.siteNumberLayout(data);
  assert.deepEqual(Town.siteNumberLayout(data), first);
  assert.equal(JSON.stringify(data), before, 'label layout never rewrites saved town geometry');
  const site = data.sites.find(value => value.buildingId), building = data.buildings.find(value => value.id === site.buildingId), index = data.sites.indexOf(site);
  const old = first[index];
  assert(Math.hypot(old.x - site.x, old.y - site.y) > 1, 'a number in a building is moved beside the roof');
  assert.equal(Town.hitTest(data, old.x, old.y, { keys: false, symbols: false, lines: false }), null);
  assert.deepEqual(Town.siteNumberLayout(data, { keys: false }), []);
  assert.equal(Town.siteNumberLayout(data, { symbols: false })[index].x, site.x, 'disabled roofs do not displace the number');
  site.x = 50; site.y = 50;
  const moved = Town.siteNumberLayout(data)[index];
  assert(Math.hypot(moved.x - site.x, moved.y - site.y) < 32 * data.unit, 'an independently moved key follows its own anchor');
  assert(Math.hypot(moved.x - building.x, moved.y - building.y) > 100 * data.unit);
  site.gm = true;
  assert(!Town.siteNumberLayout(data, { view: 'player' }).some(number => number.id === site.id));
  assert.notEqual(Town.hitTest(data, moved.x, moved.y, { view: 'player' })?.id, site.id);
});
test('site numbers retain stable identities after deletion and reordering', () => {
  const data=Town.generate('stable-town-keys');
  const original=new Map(data.sites.map(site=>[site.id,site.n]));
  data.sites.shift();data.sites.reverse();
  const numbers=Town.siteNumberLayout(data);
  assert(numbers.every(number=>number.label===String(original.get(number.id))));
  const hidden=data.sites[0];hidden.gm=true;
  assert(!Town.siteNumberLayout(data,{view:'player'}).some(number=>number.id===hidden.id));
  assert(Town.siteNumberLayout(data,{view:'player'}).every(number=>number.label===String(original.get(number.id))));
});
