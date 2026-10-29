'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the production inline generator, PRNG, room stocking, and route-note
// formatter without a browser. Only UI/render/storage effects and canvas text
// measurement are mocked. This suite does not claim raster or interaction QA.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `production source section: ${start}`);
  return html.slice(a, b);
}
function declaration(name) {
  const found = html.match(new RegExp(`const ${name}=[^\\n]+`));
  assert.ok(found, `production declaration: ${name}`);
  return found[0];
}
const context = vm.createContext({
  window: {}, console, Math,
  document: { getElementById: () => null }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'icons.js'), 'utf8'), context);
const source = `
const ICONS=window.ICONS, BY={dungeon:Object.fromEntries(ICONS.dungeon.map(i=>[i.n,i]))};
${declaration('DUN_OPTS_DEF')}
${declaration('PPI')}
${declaration('DUN_CELL')}
${declaration('WILD_HEX')}
${declaration('LEG_W')}
${declaration('WILD_MIN')}
${declaration('MODE_FIELDS')}
${declaration('modeFields')}
${declaration('mapScale')}
const M={mode:'dun',cols:28,rows:36,colsD:28,rowsD:36,view:'gm',title:'Fixture',feetPerSquare:10,showLegend:true,syms:[],cells:{},dunOpts:{}};
let _pre=null;
const noop=()=>{};
const beginChange=noop,clearSel=noop,render=noop,save=noop,commitChange=noop,buildTools=noop,maybeFit=noop;
const toast=noop;
const titleIsAuto=()=>false;
${declaration('MAX_KEY_NUMBER')}
${section('function validKeyNumber(', '// generate-option defaults')}
const MAP_STYLE={labelFont:'Georgia,serif'};
const ctx={save:noop,restore:noop,measureText:text=>({width:String(text).length*6})};
${section('function layout(){', '// ---------- primitives ----------')}
${section('function pageW(', 'function fitCanvas(){')}
${section('function fmtScale(', '// key box with a FIXED footprint')}
${section('const legendInMarginDun=', '// what the dungeon key lists')}
${section('let _rng=Math.random;', '// features read as landmarks')}
${section('function dnm(', '// hex distance')}
${section('function makeHeap(', 'function intoHex(')}
${section('const isSecretDoor=', '// symbol snap:')}
${section('const DUN_THEMES=', 'function updateRoomKey(')}
${section('const hexId=', 'function selDesc(')}
${section('function gmRoomKeyText(){', 'function exportRoomKey(){')}
${section('let lastDunRooms=', 'function mapIsEmpty(){')}
window.generate=(seed,options={})=>{
  const {cols=28,rows=36,...opts}=options;
  M.cols=M.colsD=cols;M.rows=M.rowsD=rows;M.view='gm';M.showLegend=true;
  M.dunOpts={...DUN_OPTS_DEF,...opts};genDun(seed);
  const result=JSON.parse(JSON.stringify({model:M,rooms:lastDunRooms,routes:lastDunRoutes,layout:layout(),reserve:[...dunReserve(layout())],gmText:gmRoomKeyText()}));
  M.view='player';result.playerText=gmRoomKeyText();M.view='gm';
  return result;
};
window.numberKeys=(model,legacy=false)=>{if(!ensureKeyNumbers(model,null,legacy))return null;return JSON.parse(JSON.stringify(model));};
window.allocateProbe=model=>{Object.assign(M,JSON.parse(JSON.stringify(model)));const before=JSON.stringify(M),n=allocateKeyNumber('dun');return {n,unchanged:before===JSON.stringify(M)};};
window.numberHeaders=(model,mode)=>{Object.assign(M,JSON.parse(JSON.stringify(model)),{mode,view:'gm'});return gmRoomKeyText();};
window.appendKey=(model,mode)=>{Object.assign(M,JSON.parse(JSON.stringify(model)),{mode});const n=allocateKeyNumber(mode),group=keyGroups(M).find(g=>g.mode===mode);const key={n,type:'key',name:'New location',notes:''};if(mode==='dun')M.syms.push(key);else if(mode==='wild')M.sites.push(key);else M.town.sites.push(key);ensureKeyNumbers();return JSON.parse(JSON.stringify(M));};`;
vm.runInContext(source, context, { filename: 'production-dungeon-generator.js' });
const generate = (seed, opts) => JSON.parse(JSON.stringify(context.window.generate(seed, opts)));
const numberKeys=(...args)=>JSON.parse(JSON.stringify(context.window.numberKeys(...args)));
const appendKey=(...args)=>JSON.parse(JSON.stringify(context.window.appendKey(...args)));
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function inspect(map) {
  const { model: M, rooms, layout: L } = map;
  const floor = (c, r) => M.cells[`${c},${r}`] === 'floor';
  const roomAt = (c, r) => rooms.findIndex(m => c >= m.x && c < m.x + m.w && r >= m.y && r < m.y + m.h);
  const cellAt = o => [Math.floor((o.x - L.ox) / L.cell), Math.floor((o.y - L.oy) / L.cell)];
  const node = (c, r) => { const i = roomAt(c, r); return i >= 0 ? `r${i}` : `${c},${r}`; };
  const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const nodes = new Set(), edges = new Set();
  for (const key of Object.keys(M.cells)) {
    if (M.cells[key] !== 'floor') continue;
    const [c, r] = key.split(',').map(Number), a = node(c, r);
    nodes.add(a);
    for (const [dc, dr] of [[1, 0], [0, 1]]) {
      if (!floor(c + dc, r + dr)) continue;
      const b = node(c + dc, r + dr);
      if (a !== b) edges.add(edgeKey(a, b));
    }
  }
  const graph = blocked => {
    const adj = new Map([...nodes].map(n => [n, new Set()]));
    for (const edge of edges) {
      if (blocked.has(edge)) continue;
      const [a, b] = edge.split('|'); adj.get(a).add(b); adj.get(b).add(a);
    }
    const walk = start => {
      const seen = new Set(), stack = [start];
      while (stack.length) {
        const a = stack.pop();
        if (seen.has(a) || !adj.has(a)) continue;
        seen.add(a);for (const b of adj.get(a)) if (!seen.has(b)) stack.push(b);
      }
      return seen;
    };
    const reached = walk('r0'), seen = new Set();let components = 0;
    for (const a of adj.keys()) {
      if (seen.has(a)) continue;
      components++;for (const n of walk(a)) seen.add(n);
    }
    const reachableEdges = [...edges].filter(edge => !blocked.has(edge) && edge.split('|').every(n => reached.has(n))).length;
    return { adj, reached, components, cycles: edges.size - blocked.size - nodes.size + components, accessibleCycles: reachableEdges - reached.size + (reached.size ? 1 : 0) };
  };
  const blocked = new Set();
  for (const door of M.syms.filter(s => /DoorSecret|DoorConcealed|DoorRevolve1way/.test(s.icon || ''))) {
    const gx = (door.x - L.ox) / L.cell, gy = (door.y - L.oy) / L.cell;
    const cells = Math.abs(gx - Math.round(gx)) < .01
      ? [[Math.round(gx) - 1, Math.floor(gy)], [Math.round(gx), Math.floor(gy)]]
      : [[Math.floor(gx), Math.round(gy) - 1], [Math.floor(gx), Math.round(gy)]];
    const edge = edgeKey(node(...cells[0]), node(...cells[1]));
    if (edges.has(edge)) blocked.add(edge);
  }
  const doors = new Set(M.syms.filter(s => /^Door/.test(s.icon || '')).map(s => `${Math.round(s.x * 100)},${Math.round(s.y * 100)}`));
  let blobs = 0, doorless = 0, unflanked = 0;
  for (const key of Object.keys(M.cells)) {
    if (M.cells[key] !== 'floor') continue;
    const [c, r] = key.split(',').map(Number);
    if (roomAt(c, r) >= 0) continue;
    if ([[0, 0], [1, 0], [0, 1], [1, 1]].every(([dc, dr]) => floor(c + dc, r + dr) && roomAt(c + dc, r + dr) < 0)) blobs++;
    for (const [dx, dy] of DIRS) {
      if (roomAt(c + dx, r + dy) < 0) continue;
      const x = L.ox + (c + .5 + dx * .5) * L.cell, y = L.oy + (r + .5 + dy * .5) * L.cell;
      if (!doors.has(`${Math.round(x * 100)},${Math.round(y * 100)}`)) doorless++;
      const pc = dy ? 1 : 0, pr = dx ? 1 : 0;
      const wall = sign => floor(c + dx + sign * pc, r + dy + sign * pr) !== floor(c + sign * pc, r + sign * pr);
      if (!((wall(1) && wall(-1)) || (!floor(c + pc, r + pr) && !floor(c - pc, r - pr)))) unflanked++;
    }
  }
  const keys = M.syms.filter(s => s.type === 'key');
  const keyedRooms = new Map(keys.map((key, index) => [roomAt(...cellAt(key)), { key, area: index + 1 }]));
  return { floor, roomAt, cellAt, node, keys, keyedRooms, complete: graph(new Set()), public: graph(blocked), blobs, doorless, unflanked };
}

function checkGeometry(map, jq = true) {
  const p = inspect(map), M = map.model;
  assert.ok(map.rooms.length, 'at least one chamber');
  assert.equal(p.complete.components, 1, 'all floor belongs to one network');
  assert.equal(p.blobs, 0, 'no 2x2 corridor blobs');
  assert.equal(p.doorless, 0, 'every room opening has a door');
  assert.equal(p.unflanked, 0, 'doorways keep their wall flanks');
  assert.ok(map.reserve.every(k => M.cells[k] !== 'floor'), 'legend and ruler reserves remain rock');
  assert.equal(p.keys.length, map.rooms.length, 'every chamber retains a numbered key');
  const solid=new Set(M.syms.filter(s=>s.furnishing||/^(Chest|Altar|Fountain|Statue|Cask|Table|Bookcase|Coffin|Grave)/.test(s.icon||'')).map(s=>p.cellAt(s).join(',')));
  const walkable=new Set(Object.keys(M.cells).filter(k=>M.cells[k]==='floor'&&!solid.has(k))),seen=new Set(),stack=[...walkable].slice(0,1);
  while(stack.length){const k=stack.pop();if(seen.has(k))continue;seen.add(k);const[c,r]=k.split(',').map(Number);for(const[dx,dy]of DIRS){const n=(c+dx)+','+(r+dy);if(walkable.has(n)&&!seen.has(n))stack.push(n);}}
  assert.equal(seen.size,walkable.size,'all usable floor stays connected after treating furniture and columns as solid');
  const stamps=M.syms.filter(s=>!/^Door/.test(s.icon||''));
  assert.equal(new Set(stamps.map(s=>p.cellAt(s).join(','))).size,stamps.length,'keys, stairs, exits and furnishing footprints never stack');
  assert.ok(stamps.every(s=>p.floor(...p.cellAt(s))),'every fixture and route endpoint stands on actual floor');
  assert.ok(stamps.filter(s=>!solid.has(p.cellAt(s).join(','))).every(s=>seen.has(p.cellAt(s).join(','))),'all keys, stairs and route endpoints remain approachable');
  if (jq) assert.ok(map.rooms.every((_, i) => p.public.reached.has(`r${i}`)), 'ordinary routes reach all rooms with secret and one-way doors blocked');
  if (jq && map.rooms.length >= 2) {
    assert.ok(p.complete.accessibleCycles >= 1, 'an actual circuit survives contraction of open room interiors');
    assert.ok(p.public.accessibleCycles >= 1, 'at least one circuit is accessible without any secret or one-way door');
  }
  if (jq||M.dunOpts.stairs==='no') {
    const exits = M.syms.filter(s => s.exit && !s.gm);
    assert.equal(exits.length,jq?2:1,'Jaquays has two edge entrances; an ordinary stairless map has one');
    const edgeCells = exits.map(p.cellAt);
    assert.equal(new Set(edgeCells.map(c => c.join(','))).size, exits.length, 'entrances are distinct');
    for (const [c, r] of edgeCells) {
      assert.ok(p.floor(c, r), 'entrance lands on floor');
      assert.ok(c === 0 || r === 0 || c === M.cols - 1 || r === M.rows - 1, 'entrance reaches the map edge');
    }
    const entries = map.routes.filter(r => r.kind === 'entrance' && r.method === 'tunnel');
    assert.equal(entries.length, exits.length, 'every edge entrance has a runnable GM description');
    if (jq&&map.rooms.length >= 2) assert.ok(new Set(entries.map(r => r.a)).size >= 2, 'entrances reach different starting rooms');
    assert.equal(p.roomAt(...p.cellAt(p.keys[0])),entries[0].a,'the first key names the actual primary entry room');
    assert.match(p.keys[0].name,/^Entrance ·/,'primary entrance retains its entrance title');
    for (const entry of entries) {
      assert.ok(Number.isInteger(entry.c) && Number.isInteger(entry.r), 'entry has concrete edge coordinates');
      assert.match(p.keyedRooms.get(entry.a).key.notes, /Entrance:/);
      const reached=new Set(),touches=new Set(),stack=[[entry.c,entry.r]];
      while(stack.length){const[c,r]=stack.pop(),k=c+','+r;if(reached.has(k))continue;reached.add(k);for(const[dx,dy]of DIRS){const nc=c+dx,nr=r+dy;if(!p.floor(nc,nr))continue;const i=p.roomAt(nc,nr);if(i>=0)touches.add(i);else if(!reached.has(nc+','+nr))stack.push([nc,nr]);}}
      assert.deepEqual([...touches],[entry.a],'an independent entrance tunnel reaches exactly its described first chamber');
    }
  }
  return p;
}

function checkRoutes(map) {
  const p = inspect(map), { model: M, routes } = map;
  checkAccess(map);
  for (const key of p.keys) assert.ok(key.notes && key.notes.length <= 8000 && key.name, 'real stocking supplies bounded private notes and names');
  if(M.dunOpts.jaquay==='yes')assert.ok(!p.keys.some(k => /Lead: evidence here points toward area/.test(k.notes)), 'Jaquays uses real routes instead of a sequential clue chain');
  for (const route of routes.filter(r => ['vertical', 'crawl', 'chute'].includes(r.kind))) {
    assert.notEqual(route.a, route.b, `route ${route.id} endpoints are different rooms`);
    const a = p.keyedRooms.get(route.a), b = p.keyedRooms.get(route.b);
    assert.ok(a && b, `route ${route.id} has two numbered destination rooms`);
    const source = a.key.notes.split('\n\n').find(s => s.startsWith(`Route ${route.id} `));
    const destination = b.key.notes.split('\n\n').find(s => s.startsWith(`Route ${route.id} `));
    assert.ok(source && destination, `route ${route.id} is explained at both ends`);
    assert.match(source, new RegExp(`area ${b.area}\\b`));
    assert.match(destination, new RegExp(`area ${a.area}\\b`));
    const labels = M.labels.filter(l => l.text === route.id);
    assert.equal(labels.length, 2, `route ${route.id} has two map endpoint letters`);
    assert.ok(labels.every(l => l.gm === true), `route ${route.id} endpoint letters stay private`);
    const endpointRooms = labels.map(l => p.roomAt(...p.cellAt({ x: l.x - 8, y: l.y + 9 }))).sort((x, y) => x - y);
    assert.deepEqual(endpointRooms, [route.a, route.b].sort((x, y) => x - y), `route ${route.id} letters identify its actual symbols`);
    if (route.kind === 'chute') assert.match(source + destination, /one-way/);
    if (route.kind === 'crawl') assert.match(source + destination, /2-ft-wide/);
  }
  assert.equal(map.playerText, '', 'Player view cannot export the private adventure key');
  assert.match(map.gmText, /GM ONLY/);
  for (const key of p.keys) assert.ok(map.gmText.includes(key.notes), 'GM markdown preserves all route notes');
  const backup = JSON.parse(JSON.stringify(M));
  assert.deepEqual(backup.syms.filter(s => s.type === 'key').map(s => s.notes), p.keys.map(s => s.notes), 'JSON round-trip preserves route instructions');
}

function checkAccess(map) {
  const p=inspect(map),{model:M,layout:L}=map,edge=(a,b)=>[a.join(','),b.join(',')].sort().join('|');
  const doorCells=s=>{const gx=(s.x-L.ox)/L.cell,gy=(s.y-L.oy)/L.cell;return Math.abs(gx-Math.round(gx))<.01?[[Math.round(gx)-1,Math.floor(gy)],[Math.round(gx),Math.floor(gy)]]:[[Math.floor(gx),Math.round(gy)-1],[Math.floor(gx),Math.round(gy)]];};
  const doors=M.syms.filter(s=>/^Door/.test(s.icon||'')).map(s=>({s,cells:doorCells(s)}));
  const blocked=new Set(doors.filter(({s})=>/DoorLocked|DoorSecret|DoorConcealed|DoorRevolve1way/.test(s.icon)).map(d=>edge(...d.cells)));
  const fixtures=new Set(M.syms.filter(s=>s.furnishing||/^(Chest|Altar|Fountain|Statue|Cask|Table|Bookcase|Coffin|Grave)/.test(s.icon||'')).map(s=>p.cellAt(s).join(',')));
  const entry=M.syms.find(s=>s.exit&&!s.gm)||p.keys[0];
  const walk=(start=p.cellAt(entry))=>{const seen=new Set(),stack=[start];while(stack.length){const a=stack.pop(),k=a.join(',');if(seen.has(k)||fixtures.has(k))continue;seen.add(k);for(const[dx,dy]of DIRS){const b=[a[0]+dx,a[1]+dy];if(p.floor(...b)&&!blocked.has(edge(a,b))&&!seen.has(b.join(',')))stack.push(b);}}return seen;};
  assert.ok(walk().has(p.cellAt(p.keys[0]).join(',')),'the primary outside entrance never needs a secret or a key kept inside');
  for(const route of map.routes.filter(r=>r.kind==='entrance'&&r.method==='tunnel'))assert.ok(walk([route.c,route.r]).has(p.cellAt(p.keyedRooms.get(route.a).key).join(',')),'every outside access can enter its described room with all locks and secret doors shut');
  const locks=doors.filter(d=>d.s.icon==='DoorLocked1x1'),gates=doors.filter(d=>d.s.icon==='DoorPortcullis1x1');
  const notes=p.keys.flatMap(key=>key.notes.split('\n\n').map(text=>({key,text})));
  assert.equal(notes.filter(n=>/^Access L\d+ · Locked/.test(n.text)).length,locks.length,'every lock has concrete private access instructions');
  assert.equal(notes.filter(n=>/^Access P\d+ · Portcullis/.test(n.text)).length,gates.length,'every portcullis has concrete private control instructions');
  const pending=locks.map(d=>{
    const [c,r]=d.cells.find(cell=>p.roomAt(...cell)>=0),room=p.roomAt(c,r),owner=p.keyedRooms.get(room).key;
    const note=notes.find(n=>n.key.n===owner.n&&/^Access L\d+ · Locked/.test(n.text)&&n.text.includes(`(column ${c+1}, row ${r+1})`));
    assert.ok(note,'lock notes name its actual room-wall cell');
    const id=note.text.match(/^Access (L\d+)/)[1],cache=notes.find(n=>n.text.startsWith(`Key ${id} ·`));
    assert.ok(cache&&note.text.includes(`area ${cache.key.n}.`),'lock points to its actual numbered key cache');
    assert.ok(cache.text.includes(`area ${owner.n} (column ${c+1}, row ${r+1})`),'key cache identifies the actual lock and stable destination number');
    assert.match(note.text,/thumb latch|corridor-side release/,'a party cannot be locked inside');
    return {...d,note:note.text,cache:cache.key};
  });
  const collect=()=>{while(pending.length){const reached=walk(),i=pending.findIndex(d=>reached.has(p.cellAt(d.cache).join(','))||(/corridor-side release/.test(d.note)&&d.cells.some(cell=>reached.has(cell.join(',')))));
    if(i<0)break;const [d]=pending.splice(i,1);blocked.delete(edge(...d.cells));}};collect();
  if(M.dunOpts.jaquay==='yes'){
    assert.equal(pending.length,0,'all public-route lock keys can be collected before passing their locks');
    const reached=walk();assert.ok(p.keys.every(k=>reached.has(p.cellAt(k).join(','))),'keys and two-sided winches open all ordinary rooms without a secret or one-way prerequisite');
  }else{
    // Secret chambers are intentional in the ordinary layout. Discovering their
    // doors must still leave their locks solvable without a key behind that lock.
    for(const d of doors.filter(d=>/DoorSecret|DoorConcealed/.test(d.s.icon)))blocked.delete(edge(...d.cells));collect();
    assert.equal(pending.length,0,'discovering optional secret areas never leaves an unsolvable lock');
  }
  for(const d of gates){const [c,r]=d.cells.find(cell=>p.roomAt(...cell)>=0),key=p.keyedRooms.get(p.roomAt(c,r)).key,note=notes.find(n=>n.key.n===key.n&&/^Access P\d+ · Portcullis/.test(n.text)&&n.text.includes(`(column ${c+1}, row ${r+1})`));assert.ok(note);assert.match(note.text,/winch.*each side/);assert.match(note.text,/raises and latches/);}
  return {locks:locks.length,gates:gates.length,pending:pending.length};
}

for(const seed of ['dungeon-access-1','dungeon-access-3'])test(`generated obstacles ${seed}: reachable keys and two-sided gate controls`,()=>{
  const map=generate(seed,{layout:'compact',jaquay:'no',stairs:'no'}),access=checkAccess(map);
  assert.ok(access.locks+access.gates>0,'regression actually contains locked obstacles');
  assert.equal(access.pending,0,'this regression opens every lock from an accessible key cache');
});
for(const layout of ['compact','scattered'])test(`Jaquays Off, Stairs No ${layout}: a real primary entrance replaces vertical access`,()=>{
  for(const[cols,rows]of [[8,8],[8,48],[48,8],[28,36]]){
    const map=generate('dungeon-sealed-regression',{cols,rows,layout,jaquay:'no',stairs:'no'}),p=inspect(map),entries=map.routes.filter(r=>r.kind==='entrance'&&r.method==='tunnel'),exits=map.model.syms.filter(s=>s.exit);
    assert.equal(entries.length,1,'a single real outside entrance is required when stairs are disabled');assert.equal(exits.length,1);
    assert.equal(p.roomAt(...p.cellAt(p.keys[0])),entries[0].a,'area 1 is the actual primary entry chamber');assert.match(p.keys[0].name,/^Entrance ·/);
    assert.match(p.keys[0].notes,new RegExp(`Entrance:.*column ${entries[0].c+1}, row ${entries[0].r+1}`));
    assert.ok(p.floor(...p.cellAt(exits[0])));assert.ok(!map.model.syms.some(s=>/Stair|Ladder|Trapdoor|PitSquare/.test(s.icon||'')),'the entry is a same-level tunnel, not a vertical symbol');
    assert.ok(!map.routes.some(r=>r.kind!=='entrance'),'ordinary maps do not gain optional Jaquays routes');
    checkGeometry(map,false);checkRoutes(map);
  }
});
for(const [cols,rows]of [[8,8],[8,48],[48,8]])for(const layout of ['compact','scattered'])for(const jaquay of ['yes','no'])test(`usable dungeon ${cols}x${rows} ${layout} Jaquays ${jaquay}: fixtures and access`,()=>{
  for(const stairs of ['yes','no']){const map=generate('dungeon-logical-7',{cols,rows,layout,jaquay,stairs,density:'packed',roomSize:'small',corridors:'straight'});checkGeometry(map,jaquay==='yes');checkRoutes(map);}
});

const regressions = ['jq-probe-9', 'jq-probe-8', 'jq-probe-11', 'jq-probe-15', '1661809745'];
for (const [cols, rows] of [[12, 14], [18, 24], [28, 36]]) {
  for (const layout of ['compact', 'scattered']) {
    for (const seed of regressions) {
      test(`Jaquays ${cols}x${rows} ${layout} ${seed}: real topology, entrances and private paired routes`, () => {
        const map = generate(seed, { cols, rows, layout, jaquay: 'yes' });
        checkGeometry(map);checkRoutes(map);
      });
    }
    test(`Jaquays ${cols}x${rows} ${layout}, Stairs No: floor routes and crawls survive`, () => {
      const map = generate('jq-no-stairs', { cols, rows, layout, jaquay: 'yes', stairs: 'no' });
      checkGeometry(map);checkRoutes(map);
      assert.ok(!map.model.syms.some(s => /Stair|Ladder|Trapdoor|PitSquare/.test(s.icon || '')), 'Stairs No suppresses every vertical symbol');
      assert.ok(!map.routes.some(r => ['vertical', 'chute'].includes(r.kind)), 'Stairs No suppresses vertical route records');
      assert.ok(!map.model.syms.filter(s => s.type === 'key').some(k => /Route [AC] ·|Lower service passage:|Chute landing:|Concealed one-way chute:/.test(k.notes)), 'Stairs No suppresses vertical route prose');
      if (map.rooms.length >= 2) assert.ok(map.routes.some(r => r.kind === 'crawl'), 'same-level narrow bypass remains available');
    });
  }
}
for (const layout of ['compact', 'scattered']) {
  for (const settings of [
    { density: 'packed', roomSize: 'small', corridors: 'straight' },
    { density: 'sparse', roomSize: 'large', corridors: 'maze' }
  ]) {
    test(`Jaquays 45x60 ${layout} ${settings.density}/${settings.roomSize}/${settings.corridors}: usable topology`, () => {
      const map = generate('jq-geometry-stress', { cols: 45, rows: 60, layout, jaquay: 'yes', ...settings });
      checkGeometry(map);checkRoutes(map);
    });
  }
  test(`Jaquays Off ${layout}: no optional route letters or route prose`, () => {
    const map = generate('jq-off-regression', { layout, jaquay: 'no' });
    checkGeometry(map, false);
    assert.deepEqual(map.routes, []);
    assert.ok(!map.model.labels.some(l => /^[ABC]$/.test(l.text)), 'no optional endpoint letters');
    assert.ok(!map.model.syms.filter(s => s.type === 'key').some(k => /Route [ABC] ·|Mapped loop:|Entrance: follow the mapped tunnel/.test(k.notes)), 'no optional route notes');
  });
}
test('Jaquays route letters A/B/C each have exactly one actual pair on the default map', () => {
  const map = generate('1661809745', { jaquay: 'yes' });checkRoutes(map);
  for (const [kind, id] of [['vertical', 'A'], ['crawl', 'B'], ['chute', 'C']]) {
    assert.equal(map.routes.filter(r => r.kind === kind && r.id === id).length, 1, `${id} ${kind}`);
  }
});
test('Jaquays generation and private route text reproduce from the same seed and options', () => {
  const options = { jaquay: 'yes', layout: 'compact', density: 'dense', theme: 'crypt' };
  const a = generate('jq-deterministic', options), b = generate('jq-deterministic', options);
  assert.deepEqual(a, b);
});
test('deleting an early Jaquays key preserves route destinations and exported numbers', () => {
  const map=generate('1661809745',{jaquay:'yes'}),original=map.model.syms.filter(s=>s.type==='key'),notes=original.map(k=>k.notes);
  const removed=original[0];map.model.syms=map.model.syms.filter(s=>s!==removed);
  const repaired=numberKeys(map.model),keys=repaired.syms.filter(s=>s.type==='key');
  assert.deepEqual(keys.map(k=>k.n),original.slice(1).map(k=>k.n));
  assert.deepEqual(keys.map(k=>k.notes),notes.slice(1));
  const headers=context.window.numberHeaders(repaired,'dun');
  assert.ok(!headers.includes('## 1. '));for(const key of keys)assert.ok(headers.includes('## '+key.n+'. '));
  const route=map.routes.find(r=>r.id==='A'),p=inspect(map),a=p.keyedRooms.get(route.a).key,b=p.keyedRooms.get(route.b).key;
  assert.ok(a.notes.includes('area '+b.n));assert.ok(b.notes.includes('area '+a.n));
});
test('legacy numbers migrate without changing notes, preserve private gaps, and repair duplicates idempotently', () => {
  const model={sites:[{label:'One',notes:'Lead: area 3'},{kind:'place',label:'Lake'},{label:'Private',gm:true},{label:'Three'}],syms:[{type:'key',notes:'area 2'},{type:'key',notes:'area 1'}],town:{sites:[{name:'Inn',notes:'Room 2'},{name:'Smith'}]}};
  const n=numberKeys(model,true);assert.deepEqual(n.sites.filter(s=>s.kind!=='place').map(k=>k.n),[1,2,3]);assert.deepEqual(n.syms.map(k=>k.n),[1,2]);assert.deepEqual(n.town.sites.map(k=>k.n),[1,2]);
  assert.equal(n.sites[0].notes,'Lead: area 3');assert.equal(n.syms[1].notes,'area 1');
  assert.deepEqual(numberKeys(n),n);
  const damaged={sites:[{n:8},{n:8},{n:-1},{n:NaN}],syms:[],nextKeyW:20};const fixed=numberKeys(damaged);
  assert.deepEqual(fixed.sites.map(k=>k.n),[8,20,21,22]);assert.equal(fixed.nextKeyW,23);assert.deepEqual(numberKeys(fixed),fixed);
});
for(const mode of ['wild','dun','town'])test(mode+' key numbers survive deletion/reordering and never reuse a deleted highest number',()=>{
  const model={sites:[],syms:[],town:{sites:[]},title:'Stable fixture'},list=mode==='wild'?model.sites:mode==='dun'?model.syms:model.town.sites;
  list.push({type:'key',c:1,r:1,name:'First',notes:'Keep area 3'},{type:'key',c:2,r:2,name:'Private',gm:true},{type:'key',c:3,r:3,name:'Last'});
  const numbered=numberKeys(model,true),key=mode==='wild'?'sites':mode==='dun'?'syms':null,current=key?numbered[key]:numbered.town.sites;
  current.pop();current.reverse();const added=appendKey(numbered,mode),result=key?added[key]:added.town.sites;
  assert.deepEqual(result.map(k=>k.n),[2,1,4]);assert.equal(result[1].notes,'Keep area 3');
  const headers=context.window.numberHeaders(added,mode);for(const n of [1,2,4])assert.ok(headers.includes('## '+n+'. '));assert.ok(!headers.includes('## 3. '));
  assert.deepEqual(numberKeys(JSON.parse(JSON.stringify(added))),added);
});
test('numeric extremes repair in bounded time without unsafe integer increments',()=>{
  const result=vm.runInContext('ensureKeyNumbers({sites:[{n:Number.MAX_SAFE_INTEGER},{},{}],syms:[],town:null,nextKeyW:Number.MAX_SAFE_INTEGER})',context,{timeout:200});
  assert.deepEqual(JSON.parse(JSON.stringify(result.sites.map(key=>key.n))),[1,2,3]);
  const model={sites:[{n:NaN},{n:Infinity},{n:Number.MAX_SAFE_INTEGER},{n:Number.MAX_SAFE_INTEGER+1},{n:2},{n:2}],syms:[],town:null,nextKeyW:Number.MAX_SAFE_INTEGER};
  const fixed=numberKeys(model);assert.deepEqual(fixed.sites.map(key=>key.n),[3,4,5,6,2,7]);assert.equal(fixed.nextKeyW,8);assert.deepEqual(numberKeys(fixed),fixed);
  for(const counter of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER]){const repaired=numberKeys({sites:[],syms:[{type:'key',n:3},{type:'key'}],nextKeyD:counter});assert.deepEqual(repaired.syms.map(key=>key.n),[3,4]);assert.equal(repaired.nextKeyD,5);}
});
test('exhausted numbering rejects new or damaged keys atomically instead of recycling a historical number',()=>{
  const exhausted=numberKeys({sites:[],syms:[{type:'key',n:1e9}],town:null,nextKeyD:1e9+1});
  const allocation=JSON.parse(JSON.stringify(context.window.allocateProbe(exhausted)));assert.equal(allocation.n,null);assert.equal(allocation.unchanged,true);
  const damaged=JSON.parse(JSON.stringify(exhausted));damaged.syms.push({type:'key'});const before=JSON.stringify(damaged);assert.equal(numberKeys(damaged),null);assert.equal(JSON.stringify(damaged),before);
});
