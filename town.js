/* Original, dependency-free settlement geometry and canvas cartography. */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  // The editor supplies the same palette used by dungeon and wilderness maps.
  // Standalone renders use those defaults too, without depending on the editor.
  const DEFAULT_STYLE = Object.freeze({
    paper: '#fff', ink: '#000', shade: '#dedede', water: '#c4c4c4', muted: '#777',
    selection: '#c9a227', labelFont: 'Georgia,serif', numberFont: 'Georgia,serif'
  });
  const EPS = 1e-7;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const mixPoint = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

  function randomSource(seed) {
    const str = String(seed == null ? '1' : seed);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return function () {
      h += 0x6d2b79f5;
      let x = h;
      x = Math.imul(x ^ x >>> 15, x | 1);
      x ^= x + Math.imul(x ^ x >>> 7, x | 61);
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }

  function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (pointSegmentDistance(p, a, b) < EPS) return true;
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  function pointSegmentDistance(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const den = dx * dx + dy * dy;
    const t = den ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den, 0, 1) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }

  function segmentIntersection(a, b, c, d) {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const wx = d[0] - c[0], wy = d[1] - c[1];
    const den = vx * wy - vy * wx;
    if (Math.abs(den) < EPS) return null;
    const dx = c[0] - a[0], dy = c[1] - a[1];
    const t = (dx * wy - dy * wx) / den;
    const u = (dx * vy - dy * vx) / den;
    return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? clamp(t, 0, 1) : null;
  }

  function segmentsDistance(a, b, c, d) {
    if (segmentIntersection(a, b, c, d) !== null) return 0;
    return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
  }

  function polygonsOverlap(a, b, margin) {
    const pad = margin || 0;
    // All buildings are convex. SAT also works against the convex market square.
    for (const poly of [a, b]) {
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const length = dist(p, q);
        if (!length) continue;
        const nx = -(q[1] - p[1]) / length, ny = (q[0] - p[0]) / length;
        let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
        for (const v of a) { const vdot = v[0] * nx + v[1] * ny; amin = Math.min(amin, vdot); amax = Math.max(amax, vdot); }
        for (const v of b) { const vdot = v[0] * nx + v[1] * ny; bmin = Math.min(bmin, vdot); bmax = Math.max(bmax, vdot); }
        if (amax + pad <= bmin + EPS || bmax + pad <= amin + EPS) return false;
      }
    }
    return true;
  }

  function polygonIntersects(a, b) {
    if (a.some(p => pointInPolygon(p, b)) || b.some(p => pointInPolygon(p, a))) return true;
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
      if (segmentIntersection(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]) !== null) return true;
    }
    return false;
  }

  function polygonRoadDistance(poly, road) {
    let nearest = Infinity;
    for (let j = 1; j < road.pts.length; j++) {
      const a = road.pts[j - 1], b = road.pts[j];
      if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return 0;
      for (let i = 0; i < poly.length; i++) nearest = Math.min(nearest, segmentsDistance(poly[i], poly[(i + 1) % poly.length], a, b));
    }
    return nearest;
  }

  function rectangle(x, y, width, depth, angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]].map(p => [x + p[0] * cos - p[1] * sin, y + p[0] * sin + p[1] * cos]);
  }

  function convexHull(points) {
    const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3) return sorted;
    const lower = [], upper = [];
    for (const p of sorted) { while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= EPS) lower.pop(); lower.push(p); }
    for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]; while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= EPS) upper.pop(); upper.push(p); }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  const signedArea = polygon => polygon.reduce((sum, p, i) => {
    const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;

  function polygonContains(outer, inner) {
    if (!inner.every(point => pointInPolygon(point, outer))) return false;
    // Vertices alone miss a rectangle cutting across a concave block's corner.
    return inner.every((point, i) => {
      const next = inner[(i + 1) % inner.length];
      const cuts = [0, 1];
      for (let j = 0; j < outer.length; j++) {
        const hit = segmentIntersection(point, next, outer[j], outer[(j + 1) % outer.length]);
        if (hit !== null) cuts.push(hit);
      }
      cuts.sort((a, b) => a - b);
      return cuts.slice(1).every((end, j) => pointInPolygon(mixPoint(point, next, (cuts[j] + end) / 2), outer));
    });
  }

  // Build the planar subdivision of the actual street network. Intersections
  // are split geometrically, including T junctions and the river banks. A lane
  // ending inside a neighborhood is a reservation inside that block, rather
  // than a fictional new block with a retraced boundary.
  function streetBlocks(roads, perimeter, water, unit) {
    const segments = [];
    const append = (a, b) => {
      if (dist(a, b) < .05 * unit) return;
      const cuts = [0, 1];
      for (let i = 0; i < perimeter.length; i++) {
        const t = segmentIntersection(a, b, perimeter[i], perimeter[(i + 1) % perimeter.length]);
        if (t !== null) cuts.push(t);
      }
      cuts.sort((x, y) => x - y);
      for (let i = 1; i < cuts.length; i++) if (cuts[i] - cuts[i - 1] > EPS && pointInPolygon(mixPoint(a, b, (cuts[i] + cuts[i - 1]) / 2), perimeter)) {
        segments.push({ a: mixPoint(a, b, cuts[i - 1]), b: mixPoint(a, b, cuts[i]), cuts: [0, 1] });
      }
    };
    for (let i = 0; i < perimeter.length; i++) append(perimeter[i], perimeter[(i + 1) % perimeter.length]);
    for (const road of roads) for (let i = 1; i < road.pts.length; i++) append(road.pts[i - 1], road.pts[i]);
    for (const body of water) for (let i = 0; i < body.polygon.length; i++) append(body.polygon[i], body.polygon[(i + 1) % body.polygon.length]);
    for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i], b = segments[j];
      const ab = segmentIntersection(a.a, a.b, b.a, b.b), ba = segmentIntersection(b.a, b.b, a.a, a.b);
      if (ab !== null && ba !== null) { a.cuts.push(ab); b.cuts.push(ba); }
      // Collinear overlaps and coincident endpoints also need common vertices.
      for (const point of [b.a, b.b]) if (pointSegmentDistance(point, a.a, a.b) < .001 * unit) a.cuts.push(dist(a.a, point) / dist(a.a, a.b));
      for (const point of [a.a, a.b]) if (pointSegmentDistance(point, b.a, b.b) < .001 * unit) b.cuts.push(dist(b.a, point) / dist(b.a, b.b));
    }
    const nodes = [], lookup = new Map(), edges = [], edgeKeys = new Set();
    const node = point => {
      const key = Math.round(point[0] / unit * 1000) + ':' + Math.round(point[1] / unit * 1000);
      if (!lookup.has(key)) { lookup.set(key, nodes.length); nodes.push({ point: point.slice(), edges: [] }); }
      return lookup.get(key);
    };
    for (const segment of segments) {
      segment.cuts.sort((a, b) => a - b);
      for (let i = 1; i < segment.cuts.length; i++) {
        if (segment.cuts[i] - segment.cuts[i - 1] < EPS) continue;
        const a = node(mixPoint(segment.a, segment.b, segment.cuts[i - 1])), b = node(mixPoint(segment.a, segment.b, segment.cuts[i]));
        const key = Math.min(a, b) + ':' + Math.max(a, b);
        if (a === b || edgeKeys.has(key)) continue;
        edgeKeys.add(key); const id = edges.length; edges.push({ a, b }); nodes[a].edges.push(id); nodes[b].edges.push(id);
      }
    }
    // Remove terminal branches, but retain a neck joining two cyclic parts of
    // the network. The surrounding face must follow that neck around the inner
    // loop and back; dropping every graph bridge would fill its hole, producing
    // an outer block that overlaps the separately emitted inner loop block.
    const degree = nodes.map(n => n.edges.length), leaves = [], deadEnds = new Set();
    for (let i = 0; i < nodes.length; i++) if (degree[i] === 1) leaves.push(i);
    for (const at of leaves) {
      if (degree[at] !== 1) continue;
      const id = nodes[at].edges.find(edge => !deadEnds.has(edge));
      const edge = edges[id], next = edge.a === at ? edge.b : edge.a;
      deadEnds.add(id); degree[at]--; degree[next]--;
      if (degree[next] === 1) leaves.push(next);
    }
    const outgoing = nodes.map((n, at) => n.edges.filter(id => !deadEnds.has(id)).map(id => {
      const edge = edges[id], to = edge.a === at ? edge.b : edge.a;
      return { id, to, angle: Math.atan2(nodes[to].point[1] - n.point[1], nodes[to].point[0] - n.point[0]) };
    }).sort((a, b) => a.angle - b.angle));
    const walked = new Set(), result = [];
    for (let start = 0; start < nodes.length; start++) for (const first of outgoing[start]) {
      const startKey = start + ':' + first.to;
      if (walked.has(startKey)) continue;
      const polygon = []; let at = start, to = first.to, guard = edges.length * 2 + 1;
      while (guard--) {
        const key = at + ':' + to;
        if (walked.has(key)) break;
        walked.add(key); polygon.push(nodes[at].point.slice());
        const list = outgoing[to], reverse = list.findIndex(edge => edge.to === at);
        if (reverse < 0) break;
        const next = list[(reverse + list.length - 1) % list.length];
        at = to; to = next.to;
        if (at === start && to === first.to) break;
      }
      if (polygon.length < 3 || signedArea(polygon) < 80 * unit * unit) continue;
      // A point just left of the first directed edge lies in this face, even
      // when its area centroid is outside a winding concave neighborhood.
      const a = polygon[0], b = polygon[1], length = dist(a, b);
      const sample = [(a[0] + b[0]) / 2 - (b[1] - a[1]) / length * .03 * unit, (a[1] + b[1]) / 2 + (b[0] - a[0]) / length * .03 * unit];
      if (!pointInPolygon(sample, perimeter) || water.some(body => pointInPolygon(sample, body.polygon))) continue;
      result.push({ id: 'block-' + (result.length + 1), polygon });
    }
    return result;
  }

  // Intersect a segment with a polygon's clearance envelope: offset edges and
  // vertex circles supply all possible transitions. Centerline-only clipping
  // leaves the outside half of a diagonal street hanging over its river bank.
  function bufferedIntervals(a, b, poly, radius, inside, inset) {
    const cuts = [0, 1], dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
    if (length2 < EPS) return [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], length = dist(p, q);
      if (length > EPS) for (const side of [-1, 1]) {
        const ox = -(q[1] - p[1]) / length * radius * side, oy = (q[0] - p[0]) / length * radius * side;
        const t = segmentIntersection(a, b, [p[0] + ox, p[1] + oy], [q[0] + ox, q[1] + oy]);
        if (t !== null) cuts.push(t);
      }
      const px = a[0] - p[0], py = a[1] - p[1], dot = px * dx + py * dy;
      const discriminant = dot * dot - length2 * (px * px + py * py - radius * radius);
      if (discriminant >= 0) for (const sign of [-1, 1]) {
        const t = (-dot + sign * Math.sqrt(discriminant)) / length2;
        if (t > 0 && t < 1) cuts.push(t);
      }
    }
    cuts.sort((x, y) => x - y);
    const result = [];
    for (let i = 1; i < cuts.length; i++) {
      const lo = cuts[i - 1], hi = cuts[i];
      if (hi - lo < EPS) continue;
      const p = mixPoint(a, b, (lo + hi) / 2);
      const onLand = pointInPolygon(p, poly), nearEdge = poly.some((v, j) => pointSegmentDistance(p, v, poly[(j + 1) % poly.length]) < radius);
      const near = inset ? onLand && !nearEdge : onLand || nearEdge;
      if (near !== inside) continue;
      const previous = result[result.length - 1];
      if (previous && Math.abs(previous[1] - lo) < EPS) previous[1] = hi;
      else result.push([lo, hi]);
    }
    return result;
  }

  function dryRoadParts(road, water, margin) {
    if (!water.length) return [road];
    let paths = [road.pts];
    for (const body of water) {
      const next = [];
      for (const path of paths) {
        let current = [];
        const finish = () => { if (current.length > 1) next.push(current); current = []; };
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i];
          const intervals = bufferedIntervals(a, b, body.polygon, road.width / 2 + (margin || 1), false);
          for (const pair of intervals) {
            const lo = pair[0], hi = pair[1];
            if (hi - lo < EPS) continue;
            const p = mixPoint(a, b, lo), q = mixPoint(a, b, hi);
            if (current.length && dist(current[current.length - 1], p) > .01) finish();
            if (!current.length) current.push(p);
            current.push(q);
            if (hi < 1 - EPS) finish();
          }
          if (!intervals.length) finish();
        }
        finish();
      }
      paths = next;
    }
    return paths.map((pts, index) => Object.assign({}, road, { id: road.id + '-' + index, pts }));
  }

  function polygonClearance(a, b) {
    return polygonIntersects(a, b) ? 0 : polygonRoadDistance(a, { pts: b.concat([b[0]]) });
  }

  function interiorRoadParts(road, perimeter, margin) {
    const result = []; let current = [];
    const finish = () => { if (current.length > 1) result.push(Object.assign({}, road, { id: road.id + '-' + result.length, pts: current })); current = []; };
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1], b = road.pts[i];
      const intervals = bufferedIntervals(a, b, perimeter, road.width / 2 + margin, true, true);
      for (const [lo, hi] of intervals) {
        const p = mixPoint(a, b, lo), q = mixPoint(a, b, hi);
        if (current.length && dist(current[current.length - 1], p) > .01) finish();
        if (!current.length) current.push(p);
        current.push(q);
        if (hi < 1 - EPS) finish();
      }
      if (!intervals.length) finish();
    }
    finish(); return result;
  }

  function roadClearOfWater(pts, width, water, margin) {
    return water.every(body => polygonRoadDistance(body.polygon, { pts }) > width / 2 + margin);
  }

  // A convex perimeter is fixed before streets and lots. Its offset supplies
  // dry, exterior waypoints when a gate's bearing would lead into the river.
  function offsetPerimeter(poly, amount) {
    return poly.map((p, i) => {
      const a = poly[(i + poly.length - 1) % poly.length], b = poly[(i + 1) % poly.length];
      const al = dist(a, p), bl = dist(p, b);
      const an = [(p[1] - a[1]) / al, -(p[0] - a[0]) / al], bn = [(b[1] - p[1]) / bl, -(b[0] - p[0]) / bl];
      const scale = amount / (1 + an[0] * bn[0] + an[1] * bn[1]);
      return [p[0] + (an[0] + bn[0]) * scale, p[1] + (an[1] + bn[1]) * scale];
    });
  }

  function exteriorApproach(gate, wall, water, width, height, unit) {
    const p = [gate.x, gate.y], direction = [Math.cos(gate.angle), Math.sin(gate.angle)];
    const roadWidth = 10 * unit;
    const start = [p[0] + direction[0] * 26 * unit, p[1] + direction[1] * 26 * unit];
    if (!roadClearOfWater([p, start], roadWidth, water, unit)) return null;
    // The countryside continues beyond the mapped field. End on its actual
    // boundary, rather than drawing a cul-de-sac inside an invisible inset.
    const limits = [direction[0] > 0 ? (width - p[0]) / direction[0] : -p[0] / direction[0], direction[1] > 0 ? (height - p[1]) / direction[1] : -p[1] / direction[1]].filter(v => Number.isFinite(v) && v > 0);
    const end = [clamp(p[0] + direction[0] * Math.min(...limits), 0, width), clamp(p[1] + direction[1] * Math.min(...limits), 0, height)];
    if (roadClearOfWater([p, end], roadWidth, water, unit)) return [p, end];
    const goals = [end, [0, start[1]], [width, start[1]], [start[0], 0], [start[0], height], [0, 0], [width, 0], [width, height], [0, height]];
    const usable = point => point[0] >= 0 && point[0] <= width && point[1] >= 0 && point[1] <= height && roadClearOfWater([point, point], roadWidth, water, unit);
    const nodes = [start].concat(goals.filter(usable).map(point => Object.assign(point, { goal: true })), offsetPerimeter(wall, 26 * unit).filter(usable));
    const scores = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set(); scores[0] = 0;
    for (;;) {
      let at = -1;
      for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (at < 0 || scores[i] < scores[at])) at = i;
      if (at < 0 || !Number.isFinite(scores[at])) return null;
      if (nodes[at].goal) {
        const result = [];
        for (let i = at; i >= 0; i = previous[i]) result.push([nodes[i][0], nodes[i][1]]);
        return [p].concat(result.reverse());
      }
      visited.add(at);
      for (let i = 1; i < nodes.length; i++) {
        if (visited.has(i)) continue;
        const pts = [nodes[at], nodes[i]];
        if (!roadClearOfWater(pts, roadWidth, water, unit) || polygonRoadDistance(wall, { pts }) < roadWidth / 2 + unit) continue;
        const score = scores[at] + dist(...pts);
        if (score < scores[i]) { scores[i] = score; previous[i] = at; }
      }
    }
  }

  function generate(seed, options) {
    const opts = options || {};
    const width = clamp(Number(opts.width) || 1000, 600, 4000);
    const height = clamp(Number(opts.height) || 800, 500, 3200);
    const size = ['village', 'town', 'city'].includes(opts.size) ? opts.size : 'town';
    const waterKind = ['none', 'river', 'coast'].includes(opts.water) ? opts.water : 'river';
    const density = ['sparse', 'normal', 'dense'].includes(opts.density) ? opts.density : 'normal';
    const walled = opts.walls !== 'no';
    const layouts = ['organic', 'linear', 'clustered', 'radial', 'planned'];
    const requestedLayout = layouts.includes(opts.layout) ? opts.layout : 'varied';
    // Resolving an automatic plan must not consume the geometry stream: selecting
    // its displayed family explicitly reproduces precisely the same settlement.
    const layoutRandom = randomSource(String(seed == null ? '1' : seed) + '|town-layout');
    const layout = requestedLayout === 'varied' ? layouts[Math.floor(layoutRandom() * layouts.length)] : requestedLayout;
    const random = randomSource(seed);
    const choose = values => values[Math.floor(random() * values.length)];
    const unit = Math.min(width / 1000, height / 800);
    const cx = width * (waterKind === 'coast' ? .405 : .49);
    const cy = height * (.49 + random() * .025);
    const factor = size === 'village' ? .78 : size === 'city' ? 1.1 : 1;
    const rx = width * .325 * factor * (layout === 'linear' ? 1.07 : 1);
    const ry = height * .335 * factor * (layout === 'linear' ? .83 : 1);
    const phase = random() * TAU;
    // Roads and terrain inherit a recognizable but asymmetric growth envelope:
    // a planned town has clipped corners; older settlements have broader and
    // narrower quarters. The convex hull preserves safe perimeter approaches.
    const outlineTemplate = layout === 'planned' ? [[-1, -.62], [-.69, -.94], [.59, -.88], [.96, -.55], [.91, .61], [.58, .95], [-.64, .86], [-.98, .43]] :
      layout === 'linear' ? [[-1, -.40], [-.78, -.81], [-.13, -.92], [.66, -.77], [1.01, -.27], [.92, .49], [.38, .88], [-.61, .79], [-1.01, .20]] :
      layout === 'clustered' ? [[-1.03, -.29], [-.72, -.86], [-.09, -.96], [.65, -.71], [.91, -.15], [.99, .49], [.40, .91], [-.21, 1.04], [-.91, .70]] :
        layout === 'radial' ? [[-1.02, -.32], [-.81, -.78], [-.17, -1.03], [.63, -.81], [.99, -.11], [.76, .72], [.13, .92], [-.63, .94], [-.96, .35]] :
          [[-.99, -.36], [-.63, -.94], [.04, -.86], [.71, -.69], [1.01, -.13], [.84, .57], [.30, .98], [-.41, .85], [-.91, .43]];
    const outline = convexHull(outlineTemplate.map(point => {
      const scale = .94 + random() * .13;
      return [point[0] * scale, point[1] * (.93 + random() * .14)];
    }));
    const outerPoint = angle => {
      const far = [Math.cos(angle) * 4, Math.sin(angle) * 4]; let hit = Infinity;
      for (let i = 0; i < outline.length; i++) {
        const t = segmentIntersection([0, 0], far, outline[i], outline[(i + 1) % outline.length]);
        if (t !== null) hit = Math.min(hit, t);
      }
      return [cx + far[0] * hit * rx, cy + far[1] * hit * ry];
    };
    const boundary = outline.map(point => [cx + point[0] * rx, cy + point[1] * ry]);
    const wallPoints = convexHull(boundary);
    const water = [];
    const docks = [];
    const waterPhase = random() * TAU;
    const shoreline = [];
    if (waterKind === 'river') {
      const riverWidth = (size === 'village' ? 33 : 39) * unit;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const y = height * i / 12;
        const x = cx + rx * .48 + Math.sin(i * .61 + waterPhase) * 12 * unit + Math.sin(i * .24 + phase) * 12 * unit;
        pts.push([x, y]);
      }
      const left = pts.map(p => [p[0] - riverWidth / 2, p[1]]);
      const right = pts.map(p => [p[0] + riverWidth / 2, p[1]]);
      water.push({ id: 'river', kind: 'river', width: riverWidth, pts, polygon: left.concat(right.slice().reverse()) });
    } else if (waterKind === 'coast') {
      for (let i = 0; i <= 12; i++) {
        const y = height * i / 12;
        shoreline.push([cx + rx * .77 + Math.sin(i * .47 + waterPhase) * 18 * unit, y]);
      }
      water.push({ id: 'coast', kind: 'coast', pts: shoreline, polygon: shoreline.concat([[width, height], [width, 0]]) });
    }
    const inWater = point => water.some(body => pointInPolygon(point, body.polygon));
    const plazaAngle = (random() - .5) * .22;
    const plaza = { id: 'market', x: cx, y: cy, polygon: rectangle(cx, cy, 73 * unit, 53 * unit, plazaAngle) };
    const plazas = [plaza];
    const gates = [];
    const roads = [];
    const gateReservations = [];
    const perimeterPoint = angle => {
      const outside = outerPoint(angle), far = [cx + (outside[0] - cx) * 8, cy + (outside[1] - cy) * 8];
      let hit = Infinity;
      for (let i = 0; i < wallPoints.length; i++) {
        const t = segmentIntersection([cx, cy], far, wallPoints[i], wallPoints[(i + 1) % wallPoints.length]);
        if (t !== null && t > EPS) hit = Math.min(hit, t);
      }
      return mixPoint([cx, cy], far, hit);
    };
    const perimeterBearing = point => {
      let nearest = Infinity, bearing = 0;
      for (let i = 0; i < wallPoints.length; i++) {
        const a = wallPoints[i], b = wallPoints[(i + 1) % wallPoints.length], distance = pointSegmentDistance(point, a, b);
        if (distance < nearest) { nearest = distance; bearing = Math.atan2(a[0] - b[0], b[1] - a[1]); }
      }
      return bearing;
    };
    const addRoad = (pts, roadWidth, kind, extra) => {
      const road = Object.assign({ id: 'road-' + (roads.length + 1), pts, width: roadWidth * unit, kind }, extra);
      // The editor moves objects independently. Shared graph coordinates are
      // junction values, never shared mutable vertices (including loop closure).
      road.pts = road.pts.map(point => point.slice());
      roads.push(road);
      return road;
    };
    let streetSerial = 0;
    const street = (pts, roadWidth, kind, extra) => {
      const road = Object.assign({ id: 'street-' + (++streetSerial), pts, width: roadWidth * unit, kind: kind || 'street' }, extra);
      road.pts = road.pts.map(point => point.slice());
      // Only designated main roads cross a river, with a complete bridge added
      // below. Secondary streets terminate on dry banks; coastal roads never
      // continue into the sea regardless of the family that proposed them.
      roads.push(...(kind === 'primary' && waterKind !== 'coast' ? [road] : dryRoadParts(road, water, unit)));
      return road;
    };
    const dryJunction = point => {
      if (!water.length || roadClearOfWater([point, point], 26 * unit, water, unit)) return point;
      const body = water[0];
      let bank = body.pts[0];
      for (let i = 1; i < body.pts.length; i++) if (body.pts[i][1] >= point[1]) {
        bank = mixPoint(body.pts[i - 1], body.pts[i], (point[1] - body.pts[i - 1][1]) / (body.pts[i][1] - body.pts[i - 1][1])); break;
      }
      const candidates = (waterKind === 'river' ? [-1, 1] : [-1]).map(side => [bank[0] + side * ((body.width || 0) / 2 + 18 * unit), point[1]]);
      const usable = candidates.filter(p => pointInPolygon(p, wallPoints) && wallPoints.every((v, i) => pointSegmentDistance(p, v, wallPoints[(i + 1) % wallPoints.length]) > 14 * unit));
      usable.sort((a, b) => dist(a, point) - dist(b, point));
      return usable[0] || point;
    };
    // A graph edge may cross water, but its junction belongs on a bank. Splitting
    // a crossing at a wet junction would otherwise create two half-bridges with
    // endpoints in the river, and permit side lanes to join a bridge midstream.
    const world = point => {
      let p = [cx + point[0] * rx, cy + point[1] * ry];
      const bearing = Math.atan2(point[1], point[0]), edge = outerPoint(bearing);
      const limit = Math.max(0, dist([cx, cy], edge) - 19 * unit), length = dist([cx, cy], p);
      if (length > limit) p = mixPoint([cx, cy], p, limit / length);
      return dryJunction(p);
    };
    const bounded = (x, y) => {
      const length = Math.hypot(x, y), scale = length > .84 ? .84 / length : 1;
      return world([x * scale, y * scale]);
    };
    const entrancePlans = [];
    const entrance = (anchor, angle, from) => entrancePlans.push({ anchor, angle, from: from || 'neighborhood' });
    const angleAt = point => Math.atan2((point[1] - cy) / ry, (point[0] - cx) / rx);
    const bend = () => (random() - .5) * .1;
    const center = [cx, cy];
    if (layout === 'radial') {
      const spokeCount = (size === 'city' ? 4 : 3) + Math.floor(random() * (size === 'village' ? 3 : 4));
      const turn = -.28 + bend();
      const radii = size === 'village' ? [.39, .76] : size === 'city' ? [.25, .47, .68, .84] : [.32, .61, .83];
      const spokes = [];
      for (let i = 0; i < spokeCount; i++) {
        const angle = turn + i * TAU / spokeCount + bend(), sway = bend();
        const nodes = radii.map(r => {
          const p = outerPoint(angle + sway * Math.sin(r * Math.PI));
          return dryJunction([lerp(cx, p[0], r), lerp(cy, p[1], r)]);
        });
        street([center].concat(nodes), 13, 'primary', { from: 'market' });
        entrance(nodes.at(-1), angle, 'radial-street-' + i);
        spokes.push({ angle, nodes });
      }
      const rings = [];
      for (let ri = 0; ri < radii.length; ri++) {
        const ring = [];
        for (let i = 0; i < spokes.length; i++) {
          const a = spokes[i], b = spokes[(i + 1) % spokes.length];
          const angleB = b.angle <= a.angle ? b.angle + TAU : b.angle;
          const outside = outerPoint((a.angle + angleB) / 2);
          const middle = [lerp(cx, outside[0], radii[ri]), lerp(cy, outside[1], radii[ri])];
          ring.push(middle);
          street([a.nodes[ri], middle, b.nodes[ri]], ri === 0 ? 9 : 7.8);
        }
        rings.push(ring);
      }
      for (let i = 0; i < spokeCount; i++) {
        if (size === 'village' && i % 2) continue;
        street(rings.map(ring => ring[i]), 5.5, 'lane');
      }
    } else if (layout === 'linear') {
      const count = (size === 'village' ? 5 : size === 'city' ? 9 : 7) + Math.floor(random() * 2);
      const slope = bend() * 1.6, offset = .23 + random() * .035;
      const xs = Array.from({ length: count }, (_, i) => -.76 + i * 1.52 / (count - 1));
      // The market is a side square along a high street, rather than the
      // obligatory intersection of every road entering the settlement.
      const main = xs.map(x => world([x, offset + x * slope + bend() * .3]));
      const marketJoin = mixPoint(main[Math.floor((count - 1) / 2)], main[Math.ceil((count - 1) / 2)], .5);
      street(main, 13, 'primary', { from: 'high-street-west', to: 'high-street-east' });
      street([center, marketJoin], 8, 'street', { from: 'market', to: 'high-street' });
      const sides = [[], []];
      for (let i = 1; i < main.length - 1; i++) for (const side of [-1, 1]) {
        const x = (main[i][0] - cx) / rx;
        // Leave the side square's frontage open instead of running the nearest
        // northbound lanes through it and recreating a four-way market junction.
        if (side === -1 && Math.abs(x) * rx < 51 * unit) continue;
        const mid = bounded(x + side * (.035 + random() * .06), side * (.31 + random() * .06));
        const end = bounded(x + side * (.055 + random() * .08), side * (.64 + random() * .08));
        street([main[i], mid, end], 7.2 + random() * 1.3);
        sides[side === -1 ? 0 : 1].push({ mid, end });
      }
      for (const side of sides) for (let i = 1; i < side.length; i++) {
        if (random() < .68) street([side[i - 1].mid, side[i].mid], 5.5, 'lane');
        if (size !== 'village' && random() < .4) street([side[i - 1].end, side[i].end], 5.5, 'lane');
      }
      entrance(main[0], Math.PI + Math.atan(slope), 'high-street-west');
      entrance(main.at(-1), Math.atan(slope), 'high-street-east');
      if (waterKind === 'coast' || size === 'city' || random() < .4) {
        const side = sides[random() < .5 ? 0 : 1], branch = side[Math.floor(random() * side.length)];
        entrance(branch.end, angleAt(branch.end), 'side-street');
      }
    } else if (layout === 'planned') {
      const count = (size === 'village' ? 3 : size === 'city' ? 5 : 4) + (random() < .3 ? 1 : 0);
      const step = 1.18 / (count - 1), shiftX = bend() * .8, shiftY = -.06 + bend() * .7;
      const xs = Array.from({ length: count }, (_, i) => -.59 + i * step + shiftX);
      const ys = Array.from({ length: count }, (_, i) => -.59 + i * step + shiftY);
      const grid = ys.map(y => xs.map(x => bounded(x, y)));
      const mainRow = Math.floor(count / 2), mainColumn = Math.floor((count - 1) / 2);
      for (let row = 0; row < count; row++) street(grid[row], row === mainRow ? 12 : 8, row === mainRow ? 'primary' : 'street');
      for (let column = 0; column < count; column++) street(grid.map(row => row[column]), column === mainColumn ? 9 : 7.5);
      const marketJoin = [world([xs[mainColumn], 0])[0], cy];
      street([center, marketJoin], 8, 'street', { from: 'market', to: 'civic-street' });
      entrance(grid[mainRow][0], Math.PI, 'west-grid');
      entrance(grid[mainRow].at(-1), 0, 'east-grid');
      entrance(grid[0][mainColumn], -Math.PI / 2 + bend(), 'north-grid');
      if (size !== 'village' || random() < .6) entrance(grid.at(-1)[Math.min(count - 1, mainColumn + 1)], Math.PI / 2 + bend(), 'south-grid');
      if (size === 'city' && random() < .5) entrance(grid[count - 2][0], Math.PI * .85, 'old-grid');
    } else if (layout === 'clustered') {
      // Neighborhood lanes follow older property boundaries. Cross lanes meet
      // them at staggered T junctions: no repeated boxes with an X through each
      // square, and no single hub receiving every district and gate road.
      const rowCount = (size === 'village' ? 3 : size === 'city' ? 5 : 4) + Math.floor(random() * 2);
      const columns = size === 'city' ? 7 : 6, rows = [], rowWidths = [], rowJoins = [];
      const mainRow = Math.floor((rowCount - 1) / 2);
      for (let r = 0; r < rowCount; r++) {
        const y = -.70 + r * 1.40 / (rowCount - 1);
        const extent = .80 * Math.sqrt(1 - (y / 1.02) ** 2);
        const drift = Math.sin(r * 1.3 + phase) * .075;
        const row = Array.from({ length: columns }, (_, c) => {
          const t = c / (columns - 1);
          const x = lerp(-extent, extent, t) + drift + (c && c < columns - 1 ? bend() * .85 : 0);
          return bounded(x, y + Math.sin(t * Math.PI * 1.4 + phase + r * .8) * .075 + bend() * .55);
        });
        rows.push(row);
        rowWidths.push(r === mainRow ? 12 : 6.5 + random() * 2);
        rowJoins.push([]);
      }
      // A connector joins the actual piecewise street, not a nearby sample.
      // Its next neighbor lands elsewhere, leaving long usable block fronts
      // instead of making a four-way crossing at every road bend.
      const onRow = (row, fraction) => {
        const at = clamp(fraction, 0, 1) * (row.length - 1), i = Math.min(row.length - 2, Math.floor(at));
        return mixPoint(row[i], row[i + 1], at - i);
      };
      const joins = [];
      for (let r = 1; r < rows.length; r++) {
        const fractions = r % 2 ? [.12, .46, .85] : [.23, .61, .93];
        if (random() < .28) fractions.splice(random() < .5 ? 0 : 2, 1);
        for (let i = 0; i < fractions.length; i++) {
          const fraction = fractions[i] + bend() * .7;
          const nextFraction = fraction + (i % 2 ? -.045 : .045);
          const a = onRow(rows[r - 1], fraction), b = onRow(rows[r], nextFraction);
          // Keep a simple dry-bank connection; street() clips any proposal
          // crossing water and the shared connectivity pass drops fragments.
          street([a, b], i === 1 ? 7 : 5.5, 'lane');
          joins.push({ point: a, row: r - 1, fraction });
          joins.push({ point: b, row: r, fraction: nextFraction });
          rowJoins[r - 1].push(fraction); rowJoins[r].push(nextFraction);
        }
      }
      for (let r = 0; r < rows.length; r++) {
        // Local streets finish at their last junction, rather than leaving
        // rounded strips of paving projecting into otherwise empty land.
        const lo = r === mainRow ? 0 : Math.min(...rowJoins[r]);
        const hi = r === mainRow ? 1 : Math.max(...rowJoins[r]);
        const pts = [onRow(rows[r], lo)].concat(rows[r].filter((p, i) => i / (columns - 1) > lo && i / (columns - 1) < hi), [onRow(rows[r], hi)]);
        street(pts, rowWidths[r], r === mainRow ? 'primary' : 'street', { from: 'neighborhood-' + r });
      }
      const marketJoin = onRow(rows[mainRow], .49);
      street([center, marketJoin], 8, 'street', { from: 'market', to: 'old-road' });
      const pocket = (id, point, breadth, depth) => {
        const x = point[0], y = point[1] - depth * .24;
        const polygon = convexHull([[-.52, -.30], [.12, -.53], [.54, -.13], [.38, .45], [-.43, .39]].map(([dx, dy]) => [x + dx * breadth, y + dy * depth]));
        if (polygon.every(p => pointInPolygon(p, boundary)) && water.every(body => polygonClearance(polygon, body.polygon) > 3 * unit)) {
          return { id, x, y, polygon };
        }
        return null;
      };
      const marketPocket = pocket('market', center, 56 * unit, 42 * unit);
      if (marketPocket) Object.assign(plaza, marketPocket);
      // Modest public pockets belong beside different neighborhood junctions,
      // rather than identical large rectangular pads stamped over the roads.
      for (const join of joins) {
        if (join.row !== mainRow && (join.fraction <= Math.min(...rowJoins[join.row]) + .01 || join.fraction >= Math.max(...rowJoins[join.row]) - .01)) continue;
        if (dist(join.point, center) < 90 * unit || plazas.some(p => dist(join.point, [p.x, p.y]) < 125 * unit)) continue;
        const square = pocket('local-square-' + (plazas.length - 1), join.point, (25 + random() * 8) * unit, (21 + random() * 6) * unit);
        if (square) plazas.push(square);
        if (plazas.length >= (size === 'village' ? 3 : 4)) break;
      }
      entrance(rows[mainRow][0], Math.PI + bend(), 'old-road-west');
      entrance(rows[mainRow].at(-1), bend(), 'old-road-east');
      entrance(onRow(rows[0], rowJoins[0][Math.floor(rowJoins[0].length / 2)]), -Math.PI / 2 + bend(), 'north-neighborhood');
      if (size !== 'village' || waterKind === 'coast') entrance(onRow(rows.at(-1), rowJoins.at(-1)[Math.floor(rowJoins.at(-1).length / 2)]), Math.PI / 2 + bend(), 'south-neighborhood');
    } else {
      // Irregular neighborhoods branch off an older winding route. Selective
      // local links make loops without imposing concentric rings or a star.
      const count = (size === 'village' ? 5 : size === 'city' ? 8 : 7) + Math.floor(random() * 2);
      const main = Array.from({ length: count }, (_, i) => {
        const x = -.74 + i * 1.48 / (count - 1);
        return world([x, Math.sin(i * 1.7 + phase) * (.07 + random() * .055)]);
      });
      street(main, 12, 'primary', { from: 'old-road-west', to: 'old-road-east' });
      const join = main[Math.floor(count / 2)];
      street([center, join], 7, 'street', { from: 'market', to: 'old-road' });
      const branches = [[], []];
      for (let i = 1; i < count - 1; i++) for (const side of [-1, 1]) {
        const x = (main[i][0] - cx) / rx;
        const mid = bounded(x + bend() * 1.5, side * (.28 + random() * .11));
        const end = bounded(x + bend() * 1.8, side * (.61 + random() * .12));
        street([main[i], mid, end], 7 + random() * 2);
        branches[side === -1 ? 0 : 1].push({ mid, end });
        if (random() < .75) {
          const spur = bounded((mid[0] - cx) / rx + (random() < .5 ? -1 : 1) * (.15 + random() * .08), side * (.43 + random() * .13));
          street([mid, spur], 5.5, 'lane');
        }
      }
      for (const side of branches) for (let i = 1; i < side.length; i++) {
        if (random() < .7) street([side[i - 1].mid, side[i].end], 6, 'lane');
      }
      entrance(main[0], Math.PI + bend(), 'old-road-west');
      entrance(main.at(-1), bend(), 'old-road-east');
      for (const side of branches) {
        const branch = side[Math.floor(random() * side.length)];
        entrance(branch.end, angleAt(branch.end), 'neighborhood-lane');
      }
      if (size === 'city' && random() < .5) {
        const branch = branches[0].at(-1);
        entrance(branch.end, angleAt(branch.end) + .25, 'hill-lane');
      }
    }
    for (const plan of entrancePlans) {
      const originalAngle = plan.angle;
      let planned = null;
      // Reserve the finished gate, both towers and its complete dry outside
      // approach before any lots exist. Family anchors replace the market star.
      for (let trial = 0; trial <= 24; trial++) {
        const offset = trial ? Math.ceil(trial / 2) * .025 * (trial % 2 ? -1 : 1) : 0;
        const point = perimeterPoint(originalAngle + offset), bearing = perimeterBearing(point);
        if (gates.some(gate => dist(point, [gate.x, gate.y]) < 48 * unit)) continue;
        const footprint = rectangle(point[0], point[1], 23 * unit, 34 * unit, bearing);
        if (water.some(body => polygonClearance(footprint, body.polygon) < 2 * unit)) continue;
        const candidate = { x: point[0], y: point[1], angle: bearing };
        const approach = exteriorApproach(candidate, wallPoints, water, width, height, unit);
        if (!approach) continue;
        const inner = [point[0] - Math.cos(bearing) * 23 * unit, point[1] - Math.sin(bearing) * 23 * unit];
        const pts = [plan.anchor, inner, point];
        if (waterKind === 'coast' && !roadClearOfWater(pts, 13 * unit, water, unit)) continue;
        planned = { point, bearing, footprint, approach, pts }; break;
      }
      if (!planned) continue;
      const gate = { id: 'gate-' + (gates.length + 1), x: planned.point[0], y: planned.point[1], angle: planned.bearing, name: '', roadId: '' };
      const road = addRoad(planned.pts, 13, 'primary', { from: plan.from, to: gate.id });
      gate.roadId = road.id;
      gates.push(gate);
      gateReservations.push(planned.footprint);
      roads.push({ id: 'approach-' + gate.id, pts: planned.approach, width: 10 * unit, kind: 'approach', from: gate.id, to: 'countryside' });
    }
    if (waterKind !== 'none') {
      const body = water[0];
      const quays = waterKind === 'river' ? [-1, 1] : [-1];
      for (const side of quays) {
        const pts = body.pts.filter(p => p[1] >= cy - ry * .87 && p[1] <= cy + ry * .87).map(p => [p[0] + side * ((body.width || 0) / 2 + 12 * unit), p[1]]);
        if (pts.length > 1) roads.push(...interiorRoadParts({ id: 'quay-' + side, pts, width: 7 * unit, kind: 'quay' }, wallPoints, 6 * unit));
      }
      if (waterKind === 'coast') {
        const shoreY = cy + 28 * unit;
        let shore = shoreline[0];
        for (let i = 1; i < shoreline.length; i++) if (shoreline[i][1] >= shoreY) { shore = mixPoint(shoreline[i - 1], shoreline[i], (shoreY - shoreline[i - 1][1]) / (shoreline[i][1] - shoreline[i - 1][1])); break; }
        const harborPoint = [shore[0] - 12 * unit, shore[1]];
        addRoad([[cx, cy], [cx + (harborPoint[0] - cx) * .65, shoreY], harborPoint], 12, 'primary', { from: 'market', to: 'harbor' });
        for (let i = -1; i <= 1; i++) {
          const y = shoreY + i * 29 * unit;
          let bank = shoreline[0];
          for (let j = 1; j < shoreline.length; j++) if (shoreline[j][1] >= y) { bank = mixPoint(shoreline[j - 1], shoreline[j], (y - shoreline[j - 1][1]) / (shoreline[j][1] - shoreline[j - 1][1])); break; }
          // Each pier begins on the quay at its own latitude, including on a
          // curved coast; its landward end is never left floating offshore.
          docks.push({ id: 'pier-' + (i + 2), polygon: rectangle(bank[0] + 6 * unit, y, 44 * unit, 7 * unit, 0) });
        }
      }
    }
    // Remove clipped bank fragments that do not connect to the market network.
    // Painted street widths count at junctions, rather than requiring coincident nodes.
    const connected = new Set(roads.filter(road => road.pts.some(p => dist(p, [cx, cy]) < .01)));
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const road of roads) {
        if (connected.has(road)) continue;
        const touches = [...connected].some(other => road.pts.slice(1).some((p, i) => other.pts.slice(1).some((q, j) => segmentsDistance(road.pts[i], p, other.pts[j], q) <= (road.width + other.width) / 2 + EPS)));
        if (touches) { connected.add(road); expanded = true; }
      }
    }
    for (let i = roads.length - 1; i >= 0; i--) if (!connected.has(roads[i])) roads.splice(i, 1);
    // Roads exist first. Their complete paved widths remain clear of every lot.
    const bridges = [];
    for (const road of roads.filter(r => r.kind === 'primary')) for (const body of water) {
      let current = [];
      const bridgeWidth = road.width + 3 * unit;
      const finish = () => {
        if (current.length > 1 && polygonRoadDistance(body.polygon, { pts: current }) < road.width / 2 - EPS) bridges.push({ id: 'bridge-' + (bridges.length + 1), roadId: road.id, width: bridgeWidth, pts: current });
        current = [];
      };
      for (let i = 1; i < road.pts.length; i++) {
        const a = road.pts[i - 1], b = road.pts[i];
        const intervals = bufferedIntervals(a, b, body.polygon, bridgeWidth / 2 + 2 * unit, true);
        for (const [lo, hi] of intervals) {
          const p = mixPoint(a, b, lo), q = mixPoint(a, b, hi);
          if (current.length && dist(current[current.length - 1], p) > .01) finish();
          if (!current.length) current.push(p);
          current.push(q);
          if (hi < 1 - EPS) finish();
        }
        if (!intervals.length) finish();
      }
      finish();
    }
    const districtNames = ['Market Ward', 'Temple Quarter', 'Artisans’ Ward', waterKind === 'none' ? 'Orchard Ward' : 'Riverside', 'Old Town', 'North Ward', 'Garden Quarter'];
    if (waterKind === 'coast') districtNames[3] = 'Harbor Ward';
    // District labels describe sectors independently of the street blueprint;
    // a two-ended high street still has several recognizable neighborhoods.
    const districtCount = size === 'city' ? 7 : size === 'village' ? 4 : 6;
    const districtTurn = -.28;
    const districts = Array.from({ length: districtCount }, (_, i) => {
      const angle = districtTurn + i * TAU / districtCount, next = angle + TAU / districtCount;
      const mid = (angle + next) / 2, location = outerPoint(mid);
      return { id: 'district-' + (i + 1), name: districtNames[i], x: lerp(cx, location[0], .57), y: lerp(cy, location[1], .57), polygon: [center, perimeterPoint(angle), outerPoint(mid), perimeterPoint(next)] };
    });
    const districtAt = (x, y) => {
      const angle = (Math.atan2((y - cy) / ry, (x - cx) / rx) - districtTurn + TAU) % TAU;
      return districts[Math.min(districtCount - 1, Math.floor(angle / TAU * districtCount))].id;
    };
    const buildings = [];
    const roadSegments = roads.concat(bridges).flatMap(road => road.pts.slice(1).map((point, i) => ({ a: road.pts[i], b: point, road })));
    const roadAabbs = roadSegments.map(segment => ({ segment, minX: Math.min(segment.a[0], segment.b[0]) - segment.road.width / 2 - 2 * unit, maxX: Math.max(segment.a[0], segment.b[0]) + segment.road.width / 2 + 2 * unit, minY: Math.min(segment.a[1], segment.b[1]) - segment.road.width / 2 - 2 * unit, maxY: Math.max(segment.a[1], segment.b[1]) + segment.road.width / 2 + 2 * unit }));
    const cells = new Map();
    const cellSize = 42 * unit;
    const boxFor = polygon => ({ minX: Math.min(...polygon.map(p => p[0])), maxX: Math.max(...polygon.map(p => p[0])), minY: Math.min(...polygon.map(p => p[1])), maxY: Math.max(...polygon.map(p => p[1])) });
    const cellKeys = box => {
      const keys = [];
      for (let x = Math.floor((box.minX - 2 * unit) / cellSize); x <= Math.floor((box.maxX + 2 * unit) / cellSize); x++) for (let y = Math.floor((box.minY - 2 * unit) / cellSize); y <= Math.floor((box.maxY + 2 * unit) / cellSize); y++) keys.push(x + ':' + y);
      return keys;
    };
    const canPlace = polygon => {
      if (!polygon.every(p => pointInPolygon(p, boundary))) return false;
      if (polygonRoadDistance(polygon, { pts: wallPoints.concat([wallPoints[0]]) }) < 7 * unit) return false;
      if (plazas.some(square => polygonsOverlap(polygon, square.polygon, 3 * unit)) || water.some(body => polygonClearance(polygon, body.polygon) < 2.5 * unit)) return false;
      if (gateReservations.some(reservation => polygonsOverlap(polygon, reservation, 2 * unit)) || docks.some(dock => polygonIntersects(polygon, dock.polygon))) return false;
      const box = boxFor(polygon);
      for (const item of roadAabbs) {
        if (box.maxX < item.minX || box.minX > item.maxX || box.maxY < item.minY || box.minY > item.maxY) continue;
        if (polygonRoadDistance(polygon, { pts: [item.segment.a, item.segment.b] }) < item.segment.road.width / 2 + 1.5 * unit - EPS) return false;
      }
      const seen = new Set();
      for (const key of cellKeys(box)) for (const index of cells.get(key) || []) {
        if (seen.has(index)) continue;
        seen.add(index);
        if (polygonsOverlap(polygon, buildings[index].polygon, 2.2 * unit)) return false;
      }
      return true;
    };
    const blocks = streetBlocks(roads, wallPoints, water, unit);
    const parcels = [], yards = [];
    const blockAt = point => blocks.find(block => pointInPolygon(point, block.polygon));
    const zoneAt = point => {
      const radius = Math.hypot((point[0] - cx) / rx, (point[1] - cy) / ry);
      const bank = water.length ? Math.min(...water.map(body => polygonRoadDistance(body.polygon, { pts: [point, point] }))) : Infinity;
      const intensity = clamp(.24 + .76 * Math.exp(-radius * radius / .24), .24, 1);
      const compact = density === 'dense' ? .08 : density === 'sparse' ? -.07 : 0;
      const centerRadius = (size === 'city' ? .54 : size === 'village' ? .29 : .40) + compact;
      const gardenRadius = (size === 'city' ? .85 : size === 'village' ? .62 : .74) + compact;
      return { density: intensity, landUse: radius < centerRadius ? 'commercial' : bank < 42 * unit && radius < .86 ? 'craft' : radius > gardenRadius ? 'garden' : 'residential' };
    };
    for (const block of blocks) {
      const average = block.polygon.reduce((p, q) => [p[0] + q[0] / block.polygon.length, p[1] + q[1] / block.polygon.length], [0, 0]);
      Object.assign(block, zoneAt(average));
    }
    const parcelCells = new Map();
    const parcelClear = polygon => {
      if (!canPlace(polygon)) return false;
      const seen = new Set();
      for (const key of cellKeys(boxFor(polygon))) for (const index of parcelCells.get(key) || []) {
        if (seen.has(index)) continue; seen.add(index);
        if (polygonsOverlap(polygon, parcels[index].polygon, 1.2 * unit)) return false;
      }
      return true;
    };
    const insertBuilding = (parcel, point, frontage, depth, angle, role, parentId) => {
      const polygon = rectangle(point[0], point[1], frontage, depth, angle);
      if (!polygonContains(parcel.polygon, polygon) || !canPlace(polygon)) return null;
      const building = { id: 'building-' + (buildings.length + 1), x: point[0], y: point[1], width: frontage, depth, angle, polygon, district: districtAt(...point), roof: Math.floor(random() * 4), roadId: parcel.roadId, parcelId: parcel.id, role };
      if (parentId) building.parentId = parentId;
      const index = buildings.length; buildings.push(building); parcel.buildingIds.push(building.id);
      for (const key of cellKeys(boxFor(polygon))) { if (!cells.has(key)) cells.set(key, []); cells.get(key).push(index); }
      return building;
    };
    // Property is allocated before houses. Each frontage belongs to one actual
    // street, its rear stops at the block, a neighboring plot or a natural bank.
    // Compact central shops give way to houses, workshops and deeper garden lots.
    const frontageRoads = roads.filter(road => road.kind !== 'approach').slice().sort((a, b) => {
      const priority = { primary: 0, street: 1, quay: 2, lane: 3 };
      return (priority[a.kind] ?? 2) - (priority[b.kind] ?? 2);
    });
    for (const road of frontageRoads) for (let si = 1; si < road.pts.length; si++) {
      const a = road.pts[si - 1], b = road.pts[si], length = dist(a, b), angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (length < 22 * unit) continue;
      const ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length;
      for (const side of [-1, 1]) {
        let at = (5 + random() * 10) * unit;
        while (at < length - 15 * unit) {
          const streetPoint = mixPoint(a, b, Math.min(1, (at + 13 * unit) / length));
          const zone = zoneAt(streetPoint), rural = zone.landUse === 'garden', commercial = zone.landUse === 'commercial';
          const frontage = (commercial ? 17 + random() * 8 : rural ? 27 + random() * 15 : 22 + random() * 13) * unit * (density === 'sparse' ? 1.17 : density === 'dense' ? .87 : 1);
          if (at + frontage > length - 3 * unit) break;
          const frontOffset = road.width / 2 + 2.3 * unit;
          const local = (x, y) => [a[0] + ux * (at + x) - uy * (frontOffset + y) * side, a[1] + uy * (at + x) + ux * (frontOffset + y) * side];
          const frontageEdge = [local(0, 0), local(frontage, 0)];
          const sample = local(frontage / 2, 3 * unit), block = blockAt(sample);
          let chosen = null;
          if (block) {
            let preferred = (commercial ? 31 + random() * 13 : rural ? 52 + random() * 22 : 35 + random() * 17) * unit * (density === 'dense' ? .88 : density === 'sparse' ? 1.12 : 1);
            // Leave room for the opposite street frontage. Greedy deep plots on
            // primary streets must not consume an entire urban block first.
            const frontMid = local(frontage / 2, .05 * unit), far = local(frontage / 2, Math.max(width, height) * 2);
            let available = Infinity;
            for (let edge = 0; edge < block.polygon.length; edge++) {
              const t = segmentIntersection(frontMid, far, block.polygon[edge], block.polygon[(edge + 1) % block.polygon.length]);
              if (t !== null && t > EPS) available = Math.min(available, dist(frontMid, mixPoint(frontMid, far, t)));
            }
            preferred = Math.min(preferred, Math.max(23 * unit, available * (rural ? .60 : .48) - 3 * unit));
            const taper = (random() - .25) * frontage * .12;
            for (let depth = preferred; depth >= 23 * unit; depth -= 3 * unit) {
              const backDepth = depth * (.91 + random() * .09);
              const polygon = [frontageEdge[0], frontageEdge[1], local(frontage - taper, backDepth), local(taper, depth)];
              if (polygonContains(block.polygon, polygon) && parcelClear(polygon)) { chosen = { polygon, depth, backDepth }; break; }
            }
          }
          if (!chosen) { at += (8 + random() * 5) * unit; continue; }
          const parcel = { id: 'parcel-' + (parcels.length + 1), blockId: block.id, polygon: chosen.polygon, roadId: road.id, frontage: frontageEdge.map(point => point.slice()), landUse: zone.landUse, buildingIds: [], gm: false };
          const plotDepth = chosen.depth, compactness = density === 'sparse' ? .83 : density === 'dense' ? 1.12 : 1;
          const frontSetback = Math.min(Math.max(1, plotDepth / unit - 24), commercial ? .8 + random() * 1.0 : rural ? 4 + random() * 5 : density === 'dense' ? 1.1 + random() * 1.2 : 2 + random() * 3) * unit;
          const houseWidth = Math.max(9 * unit, Math.min(frontage - 2.5 * unit, frontage * (commercial ? .94 : rural ? .61 + random() * .12 : .75 + random() * .12) * compactness));
          const houseDepth = Math.max(9 * unit, Math.min(plotDepth * (commercial ? .69 : rural ? .40 : .55) * compactness, (commercial ? 32 : 27) * unit, chosen.backDepth - frontSetback - 9 * unit));
          const houseX = frontage / 2 + (random() - .5) * Math.max(0, frontage - houseWidth - 5 * unit);
          const house = insertBuilding(parcel, local(houseX, frontSetback + houseDepth / 2), houseWidth, houseDepth, angle, 'main');
          if (!house) { at += 9 * unit; continue; }
          const parcelIndex = parcels.length; parcels.push(parcel);
          for (const key of cellKeys(boxFor(parcel.polygon))) { if (!parcelCells.has(key)) parcelCells.set(key, []); parcelCells.get(key).push(parcelIndex); }
          const rearStart = frontSetback + houseDepth + 2.4 * unit, rearDepth = chosen.backDepth - rearStart - 1.2 * unit;
          let yardStartX = frontage * .1, yardWidth = frontage * .78;
          if (rearDepth > 5 * unit && random() < (zone.landUse === 'craft' ? .65 : rural ? .48 : commercial ? .12 : .28)) {
            const annexWidth = Math.min(11 * unit, frontage * .27), annexDepth = Math.min(15 * unit, rearDepth * .86);
            const annex = insertBuilding(parcel, local(frontage * .12 + annexWidth / 2, rearStart + annexDepth / 2), annexWidth, annexDepth, angle, 'outbuilding', house.id);
            if (annex) { yardStartX = frontage * .16 + annexWidth; yardWidth = frontage * .85 - yardStartX; }
          }
          if (rearDepth > 5 * unit && yardWidth > 5 * unit) {
            const polygon = rectangle(...local(yardStartX + yardWidth / 2, rearStart + rearDepth / 2), yardWidth, rearDepth, angle);
            if (polygonContains(parcel.polygon, polygon) && !parcel.buildingIds.some(id => polygonIntersects(polygon, buildings.find(building => building.id === id).polygon))) {
              yards.push({ id: 'yard-' + (yards.length + 1), parcelId: parcel.id, polygon, kind: zone.landUse === 'craft' ? 'workyard' : commercial ? 'court' : 'garden', gm: false });
            }
          }
          at += frontage + (commercial ? 1.3 + random() * .9 : 2 + random() * 3) * unit;
        }
      }
    }
    const walls = walled ? [{ id: 'town-wall', pts: wallPoints, closed: true, width: 7 * unit }] : [];
    const entryKind = walled ? 'Gate' : 'Road';
    const gateNames = ['East ', 'South ', 'West ', 'North '].map(direction => direction + entryKind);
    for (const gate of gates) {
      const locationAngle = Math.atan2((gate.y - cy) / ry, (gate.x - cx) / rx);
      const quadrant = ((Math.round(locationAngle / (Math.PI / 2)) % 4) + 4) % 4;
      gate.name = gateNames[quadrant];
      if (gates.some(other => other !== gate && other.name === gate.name)) gate.name = choose(['Pilgrims’ ', 'Mill ', 'King’s ', 'Hawthorn ']) + entryKind;
    }
    const farms = [], farmGroups = [];
    const trees = [];
    // Cultivation follows the countryside roads. Neighboring strips share an
    // agricultural access lane; random rectangles no longer orbit the wall.
    const approaches = roads.filter(road => road.kind === 'approach');
    for (const road of approaches) {
      const target = farmGroups.length && random() < .38 ? 0 : random() < .66 ? 1 : 2;
      let made = 0;
      for (let si = 1; si < road.pts.length && made < target; si++) {
        const a = road.pts[si - 1], b = road.pts[si], length = dist(a, b);
        if (length < 75 * unit) continue;
        const ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length, angle = Math.atan2(uy, ux);
        const positions = [.48, .72, .30], preferredSide = random() < .5 ? -1 : 1;
        for (const fraction of positions) for (const side of [preferredSide, -preferredSide]) {
          if (made >= target) continue;
          const base = mixPoint(a, b, fraction);
          if (gates.some(gate => dist(base, [gate.x, gate.y]) < 53 * unit)) continue;
          const span = (91 + random() * 30) * unit, depth = (42 + random() * 26) * unit, offset = road.width / 2 + 13 * unit;
          const fieldAngle = angle + (random() - .5) * .28, fx = Math.cos(fieldAngle), fy = Math.sin(fieldAngle);
          const local = (x, y) => [base[0] - uy * offset * side + fx * x - fy * y * side, base[1] + ux * offset * side + fy * x + fx * y * side];
          const shift = (random() - .5) * span * .25, leftDepth = depth * (.78 + random() * .25), rightDepth = depth * (.78 + random() * .25);
          const polygon = [local(-span / 2, 0), local(span / 2, 0), local(span / 2 + shift, rightDepth), local(-span / 2 + shift, leftDepth)];
          if (!polygon.every(point => point[0] > 22 * unit && point[0] < width - 22 * unit && point[1] > 22 * unit && point[1] < height - 22 * unit)) continue;
          if (polygonClearance(polygon, wallPoints) < 7 * unit || water.some(body => polygonClearance(polygon, body.polygon) < 2 * unit)) continue;
          if (roads.some(other => polygonRoadDistance(polygon, other) < other.width / 2 + 4 * unit)) continue;
          if (farmGroups.some(group => polygonsOverlap(polygon, group.polygon, 7 * unit))) continue;
          const access = [base.slice(), local(0, 0)];
          if (!roadClearOfWater(access, 3 * unit, water, unit) || polygonRoadDistance(wallPoints, { pts: access }) < 7 * unit) continue;
          if (roads.some(other => other !== road && polygonRoadDistance(polygon, other) < other.width / 2 + 5 * unit)) continue;
          const group = { id: 'farm-group-' + (farmGroups.length + 1), roadId: road.id, polygon, access, gm: false };
          farmGroups.push(group); made++;
          const strips = 2 + Math.floor(random() * 4), stripWidth = span / strips;
          for (let strip = 0; strip < strips; strip++) {
            const t0 = strip / strips, t1 = (strip + 1) / strips;
            const inset = 1.2 * unit / span;
            const front0 = mixPoint(polygon[0], polygon[1], t0 + inset), front1 = mixPoint(polygon[0], polygon[1], t1 - inset);
            const rear0 = mixPoint(polygon[3], polygon[2], t0 + inset), rear1 = mixPoint(polygon[3], polygon[2], t1 - inset);
            // Small headlands keep every field strictly inside its holding;
            // each individual entrance branches off the shared front track.
            const field = [mixPoint(front0, rear0, .025), mixPoint(front1, rear1, .025), mixPoint(front1, rear1, .975), mixPoint(front0, rear0, .975)];
            const front = mixPoint(field[0], field[1], .5), track = mixPoint(front0, front1, .5);
            const center = mixPoint(front, mixPoint(field[2], field[3], .5), .5);
            farms.push({ id: 'field-' + (farms.length + 1), x: center[0], y: center[1], width: stripWidth - 2.4 * unit, depth, angle: fieldAngle, polygon: field, crop: Math.floor(random() * 3), groupId: group.id, roadId: road.id, access: access.map(point => point.slice()).concat([track, front]), gm: false });
          }
        }
      }
    }
    for (let i = 0; i < 65; i++) {
      const angle = random() * TAU, scale = 1.1 + random() * .29;
      const p = outerPoint(angle), point = [cx + (p[0] - cx) * scale, cy + (p[1] - cy) * scale];
      if (point[0] < 18 * unit || point[0] > width - 18 * unit || point[1] < 18 * unit || point[1] > height - 18 * unit || inWater(point)) continue;
      const canopy = rectangle(point[0], point[1], 13 * unit, 13 * unit, 0);
      if (polygonClearance(canopy, wallPoints) < 5 * unit || water.some(body => polygonClearance(canopy, body.polygon) < unit) || farms.some(farm => polygonClearance(canopy, farm.polygon) < unit) || roads.some(road => polygonRoadDistance(canopy, road) < road.width / 2 + 2 * unit)) continue;
      trees.push({ x: point[0], y: point[1], radius: (3 + random() * 3) * unit });
    }
    const prefixes = ['Alder', 'Ash', 'Bell', 'Briar', 'Copper', 'Elder', 'Fox', 'Grey', 'Hearth', 'Lark', 'Moss', 'Oak', 'Raven', 'Silver', 'Thorn', 'Willow'];
    const suffixes = waterKind === 'coast' ? ['haven', 'port', 'wick', 'mouth'] : waterKind === 'river' ? ['ford', 'bridge', 'brook', 'wick'] : ['bury', 'stead', 'hollow', 'field'];
    const title = choose(prefixes) + choose(suffixes);
    const tension = choose(['a disputed inheritance has divided its leading families', 'a missing caravan has made the merchants nervous', 'a sealed cellar has begun ringing like a bell each midnight', 'the council is hiding the cost of its new defenses', 'a counterfeit toll seal is circulating through the market', 'the harvest tithe has vanished on the road']);
    const economy = choose(waterKind === 'coast' ? ['salt fish and coastal trade', 'ship repairs and imported spices', 'sailcloth and salt'] : ['wool and barley', 'pottery and orchard fruit', 'leatherwork and grain', 'copperwork and dyed cloth']);
    const synopsis = 'A ' + (size === 'village' ? 'close-knit village' : size === 'city' ? 'busy chartered city' : 'market town') + ' known for ' + economy + '; ' + tension + '.';
    const names = ['Mara Venn', 'Orrin Pike', 'Tamsin Reed', 'Edda Vale', 'Bram Holt', 'Sella Finch', 'Ivo Rook', 'Nessa Grey', 'Jory Ash', 'Petra Wren'];
    const siteTemplates = [
      ['Market Square', 'Stalls offer local food, rope, lamps, and everyday equipment. A public well and notice post stand beside the weighing stones.', 'A trader has a map showing an unmarked ruin, but wants help recovering a stolen strongbox first.'],
      ['The Lantern & Lark', 'A welcoming inn with a common room, six private beds, a stable, and a secure chest for guests. Supper brings travelers and residents to the same table.', 'The innkeeper knows which local guide will brave the old road; a guest upstairs is using a false name.'],
      ['Wayside Sanctuary', 'A modest sanctuary offers shelter, healing, and burial rites. Offerings pay for a small public kitchen.', 'Its keeper needs discreet help finding a missing novice; tracks lead away from the settlement after dark.'],
      ['Forge & Wheel', 'A smith and wheelwright repair armor, tools, and wagons. Unusual commissions take several days and a deposit.', 'A customer left a strangely cold iron key as payment and has not returned.'],
      ['The Watch House', 'The watch handles disputes, keeps a small holding cell, and registers visiting sellswords. Its captain can authorize local bounties.', 'A patrol found fresh bootprints inside a locked storehouse; the captain suspects someone on the council.'],
      ['Herbalist’s Garden', 'An apothecary sells simple remedies, field dressings, and reliable information about local plants. A fenced garden supplies the workshop.', 'The next delivery of a rare marsh herb is overdue; its collector had discovered an entrance beneath an old causeway.'],
      ['Carters’ Guild', 'Merchants can arrange wagons, pack animals, storage, and introductions to local guides. Prices rise when roads become unsafe.', 'Two guild members offer contradictory accounts of the same vanished caravan. Both will pay to learn the truth.'],
      ['The Old Ledger', 'A scrivener copies maps, reads unfamiliar documents, and keeps records of local debts and boundaries.', 'An old deed places a valuable spring inside an abandoned estate. Someone has recently altered its newer copy.'],
      ['The Copper Cup', 'A noisy tavern serves workers, boat crews, and passing adventurers. News moves quickly across its long tables.', 'A regular is selling information about a hidden route into a nearby stronghold; a rival wants the deal stopped.'],
      ['Pilgrims’ Hospice', 'A communal lodging house gives travelers a safe roof and directions to surrounding shrines. Donations support its kitchen.', 'The warden recognizes a symbol carried by a recent arrival and quietly asks the party to follow them.']
    ];
    const sites = [];
    const used = new Set();
    const addSite = (template, point, buildingId) => {
      const number = sites.length + 1;
      const keeper = names[(number + Math.floor(random() * names.length)) % names.length];
      const site = { id: 'site-' + number, x: point[0], y: point[1], n: number, label: String(number), name: template[0], notes: template[1] + '\n\nContact: ' + keeper + '.\n\nAdventure lead: ' + template[2], gm: false };
      if (buildingId) site.buildingId = buildingId;
      sites.push(site);
      return site;
    };
    addSite(siteTemplates[0], [cx, cy]);
    const desired = size === 'village' ? 6 : size === 'city' ? 10 : 8;
    for (let i = 1; i < desired && i < buildings.filter(b => b.role !== 'outbuilding').length; i++) {
      let candidates = buildings.filter(b => b.role !== 'outbuilding' && !used.has(b.id));
      const hasStable = building => buildings.some(other => other.parentId === building.id && other.role === 'outbuilding' && other.width >= 7 * unit && other.depth >= 8 * unit);
      if (i === 1) {
        const withStable = candidates.filter(hasStable);
        if (withStable.length) candidates = withStable;
      } else if (i === 5) {
        // Service briefs describe real property. A herbalist's fenced garden
        // must be an actual reserved garden, not a workyard selected by distance.
        const withGarden = candidates.filter(building => yards.some(yard => yard.parcelId === building.parcelId && yard.kind === 'garden'));
        const withYard = candidates.filter(building => yards.some(yard => yard.parcelId === building.parcelId));
        if (withGarden.length) candidates = withGarden;
        else if (withYard.length) candidates = withYard;
      }
      // Public services favor the center, while workshops and guild yards sit farther out.
      const target = i === 1 ? .22 : i === 2 ? .42 : i === 3 ? .7 : .4 + random() * .38;
      const targetAngle = districtTurn + (i + 1) * TAU / districtCount + .35;
      const targetPoint = [cx + Math.cos(targetAngle) * rx * target, cy + Math.sin(targetAngle) * ry * target];
      candidates.sort((a, b) => (dist([a.x, a.y], targetPoint) - a.width * a.depth / (170 * unit)) - (dist([b.x, b.y], targetPoint) - b.width * b.depth / (170 * unit)));
      const building = candidates[0];
      let template = siteTemplates[i];
      if (i === 1 && !hasStable(building)) template = [template[0], 'A welcoming inn has a common room, guest beds, and a secure chest for guests. Supper brings travelers and residents to the same table.', template[2]];
      if (i === 5) {
        const garden = yards.find(yard => yard.parcelId === building.parcelId);
        if (garden) garden.kind = 'garden';
        else template = ['Herbalist’s Shop', 'An apothecary sells simple remedies, field dressings, and reliable information about local plants. Local collectors supply the workshop.', template[2]];
      }
      used.add(building.id);
      building.landmark = i === 2 ? 'temple' : i === 4 ? 'watch' : 'hall';
      const site = addSite(template, [building.x, building.y], building.id);
      building.siteId = site.id;
    }
    if (waterKind === 'coast') {
      const dock = docks[1];
      const p = dock.polygon[0];
      addSite(['Harbor Office', 'The harbor master arranges passage, records cargo, and knows the coastal weather. Small vessels tie up at three timber piers.', 'A fishing crew has brought in a sealed bronze vessel and is now afraid to leave port.'], [p[0] - 21 * unit, p[1] + 3 * unit]);
    } else if (waterKind === 'river' && bridges.length) {
      const bridge = bridges[Math.floor(bridges.length / 2)];
      let remaining = bridge.pts.slice(1).reduce((length, point, i) => length + dist(bridge.pts[i], point), 0) / 2;
      let p = bridge.pts[0];
      for (let i = 1; i < bridge.pts.length; i++) {
        const length = dist(bridge.pts[i - 1], bridge.pts[i]);
        if (remaining <= length) { p = mixPoint(bridge.pts[i - 1], bridge.pts[i], remaining / length); break; }
        remaining -= length;
      }
      addSite(['The River Crossing', 'This bridge carries the main road across the river. A posted toll funds repairs; pedestrians may cross free on market day.', 'The toll keeper has been accepting an unfamiliar silver coin that bears tomorrow’s date.'], p);
    }
    return { version: 1, seed: String(seed == null ? '1' : seed), width, height, bounds: { x: 0, y: 0, width, height }, options: { size, water: waterKind, walls: walled ? 'yes' : 'no', density, layout: requestedLayout }, layout, unit, title, synopsis, center: [cx, cy], boundary, plaza, plazas, roads, water, bridges, buildings, blocks, parcels, yards, gates, walls, districts, farms, farmGroups, trees, docks, sites };
  }

  function trace(ctx, points, close) {
    if (!points || !points.length) return;
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    if (close) ctx.closePath();
  }

  function strokeLine(ctx, points, color, width) {
    trace(ctx, points, false); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }

  function isBuildingVisible(data, building, view, lookup) {
    if (view !== 'player') return true;
    if (building.gm) return false;
    if (building.role === 'outbuilding' && building.parentId) {
      const parent = lookup ? lookup.get(building.parentId) : (data.buildings || []).find(other => other.id === building.parentId && other.role !== 'outbuilding');
      if (parent && parent.gm) return false;
    }
    return true;
  }

  function siteNumberLayout(data, config) {
    const cfg = config || {}, u = data.unit || 1;
    if (cfg.keys === false) return [];
    const visible = object => cfg.view !== 'player' || !object.gm;
    const buildingLookup = new Map((data.buildings || []).map(building => [building.id, building]));
    const roofs = cfg.symbols === false ? [] : (data.buildings || []).filter(building => isBuildingVisible(data, building, cfg.view, buildingLookup)).map(building => {
      const xs = building.polygon.map(p => p[0]), ys = building.polygon.map(p => p[1]);
      return { polygon: building.polygon, left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    });
    const result = [], pad = 1.8 * u;
    const extent = (x, y, hw, hh) => ({ left: x - hw, right: x + hw, top: y - hh, bottom: y + hh });
    const overlaps = (a, b) => a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
    const boxPolygon = box => [[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]];
    for (let i = 0; i < (data.sites || []).length; i++) {
      const site = data.sites[i]; if (!visible(site)) continue;
      const label = String(Number.isSafeInteger(site.n)&&site.n>0&&site.n<=1e9?site.n:i + 1), halfWidth = Math.max(3.8, label.length * 3.5) * u, halfHeight = 6 * u;
      const candidates = [[site.x, site.y]];
      // Try the nearest roof sides first. Normal generated locations live at a building's center;
      // moved keys retain their own anchor rather than being pulled back to their old building.
      for (const roof of roofs) if (pointInPolygon([site.x, site.y], roof.polygon)) {
        candidates.push([roof.right + halfWidth + pad, site.y], [site.x, roof.top - halfHeight - pad],
          [roof.left - halfWidth - pad, site.y], [site.x, roof.bottom + halfHeight + pad],
          [roof.right + halfWidth + pad, roof.top - halfHeight - pad], [roof.left - halfWidth - pad, roof.top - halfHeight - pad],
          [roof.right + halfWidth + pad, roof.bottom + halfHeight + pad], [roof.left - halfWidth - pad, roof.bottom + halfHeight + pad]);
      }
      // Search locally when a dense row of houses occupies those first choices. Rounded rings
      // provide stable, short offsets while allowing labels to use the street and courtyard gaps.
      for (let radius = 8; radius <= 128; radius += 4) for (let direction = 0; direction < 16; direction++) {
        const angle = -Math.PI / 4 + direction * TAU / 16;
        candidates.push([site.x + Math.cos(angle) * radius * u, site.y + Math.sin(angle) * radius * u]);
      }
      let chosen = null;
      for (const [x, y] of candidates) {
        const box = extent(x, y, halfWidth, halfHeight);
        if ((Number.isFinite(data.width) && (box.left < pad || box.right > data.width - pad)) || (Number.isFinite(data.height) && (box.top < pad || box.bottom > data.height - pad))) continue;
        if (result.some(other => overlaps(box, other.box))) continue;
        const polygon = boxPolygon(box);
        if (roofs.some(roof => overlaps(box, roof) && polygonIntersects(polygon, roof.polygon))) continue;
        chosen = { id: site.id, index: i, label, x, y, box }; break;
      }
      // An edited map can cover every nearby open space. Plain text is still less intrusive than
      // the former filled badge, and the original anchor remains available for selection.
      result.push(chosen || { id: site.id, index: i, label, x: site.x, y: site.y, box: extent(site.x, site.y, halfWidth, halfHeight) });
    }
    return result;
  }

  function draw(ctx, data, config) {
    const cfg = config || {}, u = data.unit || 1;
    const style = { ...DEFAULT_STYLE, ...cfg.style }, INK = style.ink, PAPER = style.paper;
    const terrain = cfg.terrain !== false, lines = cfg.lines !== false, symbols = cfg.symbols !== false, keys = cfg.keys !== false;
    const visible = object => cfg.view !== 'player' || !object.gm;
    const selectedId = cfg.exporting ? null : cfg.selectedId;
    const parcelMap = new Map((data.parcels || []).map(parcel => [parcel.id, parcel]));
    const buildingLookup = new Map((data.buildings || []).map(building => [building.id, building])), propertyVisibility = new Map();
    const propertyVisible = parcel => {
      if (propertyVisibility.has(parcel.id)) return propertyVisibility.get(parcel.id);
      const shown = visible(parcel) && (cfg.view !== 'player' || !parcel.buildingIds || !parcel.buildingIds.length || parcel.buildingIds.some(id => {
        const building = buildingLookup.get(id);
        return building && isBuildingVisible(data, building, cfg.view, buildingLookup);
      }));
      propertyVisibility.set(parcel.id, shown); return shown;
    };
    const fill = PAPER;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, data.width, data.height); ctx.clip();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (terrain) {
      let decorationBudget = 2000;
      ctx.fillStyle = fill; ctx.fillRect(0, 0, data.width, data.height);
      for (const farm of data.farms || []) {
        if (!visible(farm)) continue;
        trace(ctx, farm.polygon, true); ctx.fillStyle = PAPER; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = .7 * u; ctx.stroke();
        ctx.save(); trace(ctx, farm.polygon, true); ctx.clip();
        const a = farm.polygon[0], b = farm.polygon[1], c = farm.polygon[3];
        if (farm.crop === 1) {
          for (let t = .18; t < 1 && decorationBudget > 0; t += .24) for (let x = .2; x < 1 && decorationBudget > 0; x += .3) {
            decorationBudget--;
            const p = mixPoint(mixPoint(a, c, t), mixPoint(b, farm.polygon[2], t), x);
            ctx.beginPath(); ctx.arc(p[0], p[1], 1.6 * u, 0, TAU); ctx.strokeStyle = style.muted; ctx.lineWidth = .6 * u; ctx.stroke();
          }
        } else if (farm.crop === 2) {
          for (let t = .25; t < 1 && decorationBudget > 0; t += .32) {
            decorationBudget--;
            const p = mixPoint(mixPoint(a, c, t), mixPoint(b, farm.polygon[2], t), .35 + t * .25);
            strokeLine(ctx, [[p[0] - 1.5 * u, p[1]], [p[0], p[1] - 2 * u], [p[0] + u, p[1]]], style.muted, .7 * u);
          }
        } else {
          for (let t = .1; t < 1 && decorationBudget > 0; t += .12) { decorationBudget--; strokeLine(ctx, [mixPoint(a, c, t), mixPoint(b, farm.polygon[2], t)], style.muted, .7 * u); }
        }
        ctx.restore();
      }
      for (const tree of data.trees || []) {
        ctx.beginPath(); ctx.arc(tree.x, tree.y, tree.radius, 0, TAU); ctx.fillStyle = PAPER; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = .75 * u; ctx.stroke();
        strokeLine(ctx, [[tree.x, tree.y - tree.radius * .55], [tree.x, tree.y + tree.radius * .5]], style.muted, .6 * u);
      }
      for (const body of data.water || []) {
        trace(ctx, body.polygon, true); ctx.fillStyle = style.water; ctx.fill();
        ctx.save(); trace(ctx, body.polygon, true); ctx.clip();
        ctx.strokeStyle = style.muted; ctx.lineWidth = .65 * u;
        for (let y = 9 * u; y < data.height; y += 15 * u) {
          for (let x = ((Math.floor(y / (15 * u)) % 3) * 13 + 2) * u; x < data.width; x += 45 * u) {
            trace(ctx, [[x, y], [x + 12 * u, y], [x + 17 * u, y - 1.3 * u]], false); ctx.stroke();
          }
        }
        ctx.restore();
        if (body.kind === 'river') {
          const left = body.pts.map(p => [p[0] - body.width / 2, p[1]]), right = body.pts.map(p => [p[0] + body.width / 2, p[1]]);
          strokeLine(ctx, left, INK, 1.2 * u); strokeLine(ctx, right, INK, 1.2 * u);
        } else strokeLine(ctx, body.pts, INK, 1.2 * u);
      }
      for (const yard of data.yards || []) {
        const parcel = parcelMap.get(yard.parcelId);
        if (!visible(yard) || (parcel && !propertyVisible(parcel))) continue;
        ctx.save(); trace(ctx, yard.polygon, true); ctx.clip();
        const a = yard.polygon[0], b = yard.polygon[1], c = yard.polygon.at(-1);
        const depth = dist(a, c);
        if (yard.kind === 'garden') {
          for (let at = 3 * u; at < depth - u && decorationBudget > 0; at += 6 * u) {
            decorationBudget--;
            const t = at / depth;
            strokeLine(ctx, [mixPoint(a, c, t), mixPoint(b, yard.polygon[2], t)], style.muted, 1.2 * u);
            strokeLine(ctx, [mixPoint(a, c, Math.min(1, t + u / depth)), mixPoint(b, yard.polygon[2], Math.min(1, t + u / depth))], PAPER, .45 * u);
          }
        } else if (yard.kind === 'workyard') {
          const center = mixPoint(mixPoint(a, b, .5), mixPoint(c, yard.polygon[2], .5), .5);
          const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
          for (const shift of [-2, 2]) {
            if (decorationBudget <= 0) break;
            decorationBudget--;
            const pile = rectangle(center[0] - Math.sin(angle) * shift * u, center[1] + Math.cos(angle) * shift * u, 7 * u, 2 * u, angle);
            trace(ctx, pile, true); ctx.strokeStyle = style.muted; ctx.lineWidth = .7 * u; ctx.stroke();
          }
        } else {
          const bounds = { left: Math.max(0, Math.min(...yard.polygon.map(p => p[0]))), right: Math.min(data.width, Math.max(...yard.polygon.map(p => p[0]))), top: Math.max(0, Math.min(...yard.polygon.map(p => p[1]))), bottom: Math.min(data.height, Math.max(...yard.polygon.map(p => p[1]))) };
          for (let y = bounds.top + 3 * u; y < bounds.bottom && decorationBudget > 0; y += 6 * u) for (let x = bounds.left + 3 * u; x < bounds.right && decorationBudget > 0; x += 7 * u) {
            decorationBudget--;
            ctx.beginPath(); ctx.arc(x, y, .35 * u, 0, TAU); ctx.fillStyle = style.muted; ctx.fill();
          }
        }
        ctx.restore();
      }
    }
    if (lines) {
      ctx.save(); ctx.setLineDash([3 * u, 2 * u]);
      for (const farm of data.farms || []) if (visible(farm) && farm.access) strokeLine(ctx, farm.access, style.muted, 1 * u);
      ctx.restore();
      for (const parcel of data.parcels || []) if (propertyVisible(parcel)) {
        trace(ctx, parcel.polygon, true); ctx.strokeStyle = style.muted; ctx.lineWidth = .55 * u; ctx.stroke();
      }
      // Streets and public spaces form one open surface. Paint all outlines
      // before either interior, so a square's edge cannot close a through road
      // and a road edge cannot cut a dark stripe across the square.
      for (const square of data.plazas || [data.plaza]) {
        trace(ctx, square.polygon, true); ctx.strokeStyle = INK; ctx.lineWidth = 1.1 * u; ctx.stroke();
      }
      for (const road of data.roads) if (visible(road)) {
        ctx.lineCap = road.kind === 'approach' ? 'butt' : 'round';
        strokeLine(ctx, road.pts, selectedId === road.id ? style.selection : INK, road.width + (selectedId === road.id ? 3 : 1.1) * u);
      }
      for (const square of data.plazas || [data.plaza]) {
        trace(ctx, square.polygon, true); ctx.fillStyle = PAPER; ctx.fill();
      }
      for (const road of data.roads) if (visible(road)) {
        ctx.lineCap = road.kind === 'approach' ? 'butt' : 'round';
        strokeLine(ctx, road.pts, PAPER, road.width);
      }
      ctx.lineCap = 'round';
      for (const dock of data.docks || []) {
        trace(ctx, dock.polygon, true); ctx.fillStyle = PAPER; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = .9 * u; ctx.stroke();
        for (let t = .13; t < 1; t += .14) strokeLine(ctx, [mixPoint(dock.polygon[0], dock.polygon[1], t), mixPoint(dock.polygon[3], dock.polygon[2], t)], style.muted, .6 * u);
      }
      const hiddenRoads = new Set(data.roads.filter(road => !visible(road)).map(road => road.id));
      for (const bridge of data.bridges || []) {
        if (!visible(bridge) || hiddenRoads.has(bridge.roadId)) continue;
        strokeLine(ctx, bridge.pts, PAPER, bridge.width);
        for (let i = 1; i < bridge.pts.length; i++) {
          const a = bridge.pts[i - 1], b = bridge.pts[i], length = dist(a, b);
          if (length < EPS) continue;
          const nx = -(b[1] - a[1]) / length, ny = (b[0] - a[0]) / length;
          for (const side of [-1, 1]) strokeLine(ctx, [a, b].map(p => [p[0] + nx * bridge.width / 2 * side, p[1] + ny * bridge.width / 2 * side]), INK, 1.2 * u);
          for (let t = .08; t < 1; t += 5 * u / length) { const p = mixPoint(a, b, t); strokeLine(ctx, [[p[0] - nx * bridge.width * .43, p[1] - ny * bridge.width * .43], [p[0] + nx * bridge.width * .43, p[1] + ny * bridge.width * .43]], style.muted, .6 * u); }
        }
      }
      for (const wall of data.walls || []) {
        const pts = wall.pts.concat([wall.pts[0]]);
        const parts = dryRoadParts({ id: wall.id, pts, width: wall.width, kind: 'wall' }, data.water || [], u);
        for (const part of parts) { strokeLine(ctx, part.pts, INK, wall.width + 2 * u); strokeLine(ctx, part.pts, style.shade, wall.width); strokeLine(ctx, part.pts, PAPER, wall.width * .42); }
      }
      if (data.walls && data.walls.length) for (const gate of data.gates) {
        const p = [gate.x, gate.y], dx = Math.cos(gate.angle), dy = Math.sin(gate.angle);
        strokeLine(ctx, [[p[0] - dx * 10 * u, p[1] - dy * 10 * u], [p[0] + dx * 10 * u, p[1] + dy * 10 * u]], PAPER, 13 * u);
        for (const side of [-1, 1]) {
          const tower = rectangle(p[0] - dy * 10 * u * side, p[1] + dx * 10 * u * side, 10 * u, 11 * u, gate.angle);
          trace(ctx, tower, true); ctx.fillStyle = style.shade; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2 * u; ctx.stroke();
          const inner = tower.map(q => [lerp(p[0] - dy * 10 * u * side, q[0], .57), lerp(p[1] + dx * 10 * u * side, q[1], .57)]);
          trace(ctx, inner, true); ctx.strokeStyle = INK; ctx.lineWidth = .7 * u; ctx.stroke();
        }
      }
    }
    if (symbols) {
      for (const building of data.buildings) {
        if (!isBuildingVisible(data, building, cfg.view, buildingLookup)) continue;
        const selected = selectedId === building.id;
        const width = Number.isFinite(building.width) ? building.width : dist(building.polygon[0], building.polygon[1]);
        const depth = Number.isFinite(building.depth) ? building.depth : dist(building.polygon[1], building.polygon[2]);
        const angle = Number.isFinite(building.angle) ? building.angle : Math.atan2(building.polygon[1][1] - building.polygon[0][1], building.polygon[1][0] - building.polygon[0][0]);
        ctx.save(); ctx.translate(1.4 * u, 1.8 * u); trace(ctx, building.polygon, true); ctx.fillStyle = style.shade; ctx.fill(); ctx.restore();
        trace(ctx, building.polygon, true); ctx.fillStyle = PAPER; ctx.fill(); ctx.strokeStyle = selected ? style.selection : INK; ctx.lineWidth = (selected ? 2.4 : 1.05) * u; ctx.stroke();
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const p = (x, y) => [building.x + x * cos - y * sin, building.y + x * sin + y * cos];
        const half = width / 2, halfDepth = depth / 2;
        const ridge = Math.min(halfDepth * .55, half * .48);
        strokeLine(ctx, [p(-half + ridge, 0), p(half - ridge, 0)], INK, .85 * u);
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) strokeLine(ctx, [p(sx * half, sy * halfDepth), p(sx * (half - ridge), 0)], style.muted, .65 * u);
        // Fine roof courses carry detail in print without colored roof fills.
        // Vary the shaded slope using the existing deterministic roof variant.
        const slope = (building.roof || 0) % 2 ? -1 : 1;
        for (let t = .28; t < .95; t += .28) {
          const edge = half - ridge * (1 - t);
          strokeLine(ctx, [p(-edge, slope * halfDepth * t), p(edge, slope * halfDepth * t)], style.muted, .5 * u);
        }
        if (building.landmark === 'temple') {
          const top = p(0, -halfDepth * .2); ctx.beginPath(); ctx.arc(top[0], top[1], 2 * u, 0, TAU); ctx.fillStyle = PAPER; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = .6 * u; ctx.stroke();
        }
      }
      // A well and a few stalls make the reserved market space legible at any zoom.
      const cx = data.plaza.x, cy = data.plaza.y;
      let marketFixtures = null;
      for (const scale of [1, .85, .7, .55]) {
        const s = u * scale, well = { x: cx - 17 * s, y: cy + 9 * s, radius: 4 * s };
        const stalls = [-1, 0, 1].map(i => rectangle(cx + i * 15 * s, cy - 16 * s, 9 * s, 5 * s, 0));
        // Keep the complete well and stall footprints inside the reserved
        // public land, including smaller irregular or imported market places.
        const wellBox = rectangle(well.x, well.y, well.radius * 2 + u, well.radius * 2 + u, 0);
        if ([wellBox, ...stalls].every(polygon => polygonContains(data.plaza.polygon, polygon))) { marketFixtures = { well, stalls }; break; }
      }
      if (marketFixtures) {
        const well = marketFixtures.well;
        ctx.beginPath(); ctx.arc(well.x, well.y, well.radius, 0, TAU); ctx.fillStyle = style.shade; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = .8 * u; ctx.stroke();
      }
      for (const stall of marketFixtures?.stalls || []) {
        trace(ctx, stall, true); ctx.fillStyle = PAPER; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = .6 * u; ctx.stroke();
        strokeLine(ctx, [mixPoint(stall[0], stall[1], .5), mixPoint(stall[3], stall[2], .5)], style.muted, .6 * u);
      }
    }
    if (keys) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + (11 * u) + 'px ' + style.numberFont;
      for (const number of siteNumberLayout(data, cfg)) {
        ctx.strokeStyle = PAPER; ctx.lineWidth = 1.8 * u; ctx.strokeText(number.label, number.x, number.y);
        ctx.fillStyle = selectedId === number.id ? style.selection : INK; ctx.fillText(number.label, number.x, number.y);
      }
    }
    if (cfg.text !== false) {
      ctx.font = 'italic ' + 10 * u + 'px ' + style.labelFont; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const district of data.districts || []) {
        if (!visible(district) || !district.name) continue;
        ctx.strokeStyle = PAPER; ctx.lineWidth = 3.2 * u; ctx.strokeText(district.name, district.x, district.y);
        ctx.fillStyle = INK; ctx.fillText(district.name, district.x, district.y);
      }
      for (const gate of data.gates) {
        const dx = gate.x - data.center[0], dy = gate.y - data.center[1], length = Math.hypot(dx, dy) || 1;
        const x = gate.x + dx / length * 27 * u, y = gate.y + dy / length * 27 * u;
        ctx.strokeStyle = PAPER; ctx.lineWidth = 3 * u; ctx.strokeText(gate.name, x, y); ctx.fillStyle = INK; ctx.fillText(gate.name, x, y);
      }
    }
    // A neatline makes the crop explicit: roads and waterways continue off-map,
    // while the editor's title, compass and scale remain in the paper margins.
    if (lines) { ctx.strokeStyle = INK; ctx.lineWidth = 2 * u; ctx.strokeRect(0, 0, data.width, data.height); }
    ctx.restore();
  }

  function hitTest(data, x, y, config) {
    const cfg = config || {}, u = data.unit || 1;
    const numbers = siteNumberLayout(data, cfg);
    for (let i = numbers.length - 1; i >= 0; i--) {
      const number = numbers[i], site = data.sites[number.index], box = number.box, margin = 2 * u;
      if ((x >= box.left - margin && x <= box.right + margin && y >= box.top - margin && y <= box.bottom + margin) || Math.hypot(site.x - x, site.y - y) <= 11 * u) return { kind: 'site', id: site.id, index: number.index };
    }
    for (let i = cfg.symbols === false ? -1 : data.buildings.length - 1; i >= 0; i--) {
      const building = data.buildings[i];
      if (!isBuildingVisible(data, building, cfg.view)) continue;
      if (pointInPolygon([x, y], building.polygon)) return { kind: 'building', id: building.id, index: i };
    }
    let nearest = null, distance = Infinity;
    for (let i = cfg.lines === false ? -1 : data.roads.length - 1; i >= 0; i--) {
      const road = data.roads[i];
      if (cfg.view === 'player' && road.gm) continue;
      for (let j = 1; j < road.pts.length; j++) {
        const d = pointSegmentDistance([x, y], road.pts[j - 1], road.pts[j]);
        if (d <= Math.max(4 * u, road.width / 2 + 2 * u) && d < distance) {
          distance = d; nearest = { kind: 'road', id: road.id, index: i };
        }
      }
    }
    return nearest;
  }

  const api = { generate, draw, hitTest, siteNumberLayout, isBuildingVisible, geometry: { pointInPolygon, polygonsOverlap, polygonIntersects, polygonRoadDistance, pointSegmentDistance } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TownGenerator = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
