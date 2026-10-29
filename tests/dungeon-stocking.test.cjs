'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the shipped inline code. Canvas measurement and UI/storage side
// effects are mocked; these checks do not claim browser or raster coverage.
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
const M={mode:'dun',cols:28,rows:36,colsD:28,rowsD:36,view:'gm',title:'B/X fixture',feetPerSquare:10,showLegend:true,syms:[],cells:{},dunOpts:{}};
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
${section('let lastDunRooms=', 'function mapIsEmpty(){')}
window.generate=(seed,options={})=>{
  const {cols=28,rows=36,...opts}=options;
  M.cols=M.colsD=cols;M.rows=M.rowsD=rows;M.view='gm';M.showLegend=true;
  M.dunOpts={...DUN_OPTS_DEF,...opts};genDun(seed);
  const stock=makeDungeonStock(seed,lastDunRooms);
  const out={model:M,rooms:lastDunRooms,routes:lastDunRoutes,layout:layout(),stock,gmText:gmRoomKeyText()};
  const result=JSON.parse(JSON.stringify(out));
  M.view='player';result.playerText=gmRoomKeyText();
  result.playerSymbols=JSON.parse(JSON.stringify(M.syms.filter(symVis)));
  result.playerLegend=legendDunNames();M.view='gm';
  return result;
};
window.stock=(seed,rooms,opts={})=>{M.dunOpts={...DUN_OPTS_DEF,...opts};return makeDungeonStock(seed,rooms);};
window.rngIsolation=()=>{
  const saved=_rng;try{
    _rng=mulberry32(123456);const expected=mulberry32(123456)();
    const stock=makeDungeonStock('bx-rng-isolation',lastDunRooms);
    stockDungeonKeys('bx-rng-isolation',lastDunRooms,lastDunRooms.map((_,i)=>i),stock);
    return _rng()===expected;
  }finally{_rng=saved;}
};
`, context, { filename: 'production-bx-stocking.js' });
const plain = value => JSON.parse(JSON.stringify(value));
const call = (name, ...args) => plain(context[name](...args));
const generate = (seed, opts) => plain(context.window.generate(seed, opts));
function dice(steps) {
  let count = 0;
  const rng = () => {
    assert.ok(count < steps.length, 'no unplanned die roll or treasure retry');
    const [sides, face] = steps[count++];
    assert.ok(face >= 1 && face <= sides);
    return (face - .5) / sides;
  };
  rng.done = () => assert.equal(count, steps.length, 'every prescribed die was rolled exactly once');
  return rng;
}

test('B/X room contents and treasure checks cover every pair of d6 faces', () => {
  for (let contents = 1; contents <= 6; contents++) for (let treasure = 1; treasure <= 6; treasure++) {
    const kind = ['monster','monster','trap','special','empty','empty'][contents - 1];
    const rng = dice([[6, contents], ...(kind === 'special' ? [] : [[6, treasure]])]);
    assert.deepEqual(call('bxRoomContents', rng), {
      kind, contentRoll: contents, treasureRoll: kind === 'special' ? null : treasure,
      hasTreasure: kind !== 'special' && treasure <= ({monster:3,trap:2,empty:1}[kind])
    });
    rng.done();
  }
});

test('dungeon depth accepts numeric imports, clamps to 1–9, and safely defaults malformed values', () => {
  for (const [value, expected] of [[1,1],[9,9],[4.9,4],[-2,1],[0,1],[100,9],[' 7 ',7],['2.8',2],['',1],[' ',1],['bad',1],[NaN,1],[Infinity,1],[null,1],[true,1],[{},1],[[],1],[{toString:'broken'},1]]) {
    assert.equal(context.bxDungeonLevel({level:value}), expected, `input type ${typeof value}`);
  }
  for (const value of [undefined, null, false, {}, {level:undefined}]) assert.equal(context.bxDungeonLevel(value), 1);
});

// Fixed B/X Basic/Expert table expectations, kept independent of production data.
const bands = [
  {levels:[1],spDie:6,spScale:100,gpChance:50,gpScale:10,gemChance:5,jewelChance:2,magicChance:2,quantity:6},
  {levels:[2,3],spDie:12,spScale:100,gpChance:50,gpScale:100,gemChance:10,jewelChance:5,magicChance:8,quantity:6},
  {levels:[4,5],spDie:6,spScale:1000,gpChance:100,gpScale:200,gemChance:20,jewelChance:10,magicChance:10,quantity:6},
  {levels:[6,7],spDie:6,spScale:2000,gpChance:100,gpScale:500,gemChance:30,jewelChance:15,magicChance:15,quantity:6},
  {levels:[8,9],spDie:6,spScale:5000,gpChance:100,gpScale:1000,gemChance:40,jewelChance:20,magicChance:20,quantity:12}
];
for (const b of bands) test(`unguarded treasure levels ${b.levels.join('/')} use the B/X quantities and independent chance boundaries`, () => {
  for (const level of b.levels) {
    const high = call('bxUnguardedTreasure', level, () => .999999);
    assert.deepEqual(high, {coins:{sp:b.spDie*b.spScale,gp:b.gpChance===100?6*b.gpScale:0},gems:[],jewellery:[],magicItems:0});
    const low = call('bxUnguardedTreasure', level, () => 0);
    assert.deepEqual(low, {coins:{sp:b.spScale,gp:b.gpScale},gems:[10],jewellery:[300],magicItems:1});
    for (const component of ['gp','gems','jewellery','magic']) for (const success of [true,false]) {
      if (component === 'gp' && b.gpChance === 100) continue;
      const steps = [[b.spDie,1]], wanted = key => component === key && success;
      const boundary = (key, chance) => component === key ? chance + (success ? 0 : 1) : 100;
      if (b.gpChance < 100) steps.push([100,boundary('gp',b.gpChance)]);
      if (wanted('gp') || b.gpChance === 100) steps.push([6,6]);
      steps.push([100,boundary('gems',b.gemChance)]);
      if (wanted('gems')) steps.push([b.quantity,b.quantity], ...Array.from({length:b.quantity},()=>[20,20]));
      steps.push([100,boundary('jewellery',b.jewelChance)]);
      if (wanted('jewellery')) steps.push([b.quantity,b.quantity], ...Array.from({length:b.quantity*3},()=>[6,6]));
      steps.push([100,boundary('magic',b.magicChance)]);
      const rng = dice(steps), loot = call('bxUnguardedTreasure', level, rng);rng.done();
      assert.deepEqual(loot, {
        coins:{sp:b.spScale,gp:(wanted('gp')||b.gpChance===100)?6*b.gpScale:0},
        gems:wanted('gems')?Array(b.quantity).fill(1000):[],
        jewellery:wanted('jewellery')?Array(b.quantity).fill(1800):[],magicItems:wanted('magic')?1:0
      }, `${component} ${success?'at':'above'} its boundary at level ${level}`);
    }
  }
});

test('gem valuation covers every value boundary and jewellery rolls three dice for each piece', () => {
  const faces = [1,4,5,9,10,15,16,19,20,1,10,20];
  const rng = dice([[6,1],[6,1],[100,1],[12,12],...faces.map(face=>[20,face]),[100,1],[12,1],[6,1],[6,3],[6,6],[100,100]]);
  const loot = call('bxUnguardedTreasure', 9, rng);rng.done();
  assert.deepEqual(loot.gems, [10,10,50,50,100,100,500,500,1000,10,100,1000]);
  assert.deepEqual(loot.jewellery, [1000]);
});

const lairTypes = {
  B:{coins:{cp:[50,1,8],sp:[25,1,6],ep:[25,1,4],gp:[25,1,3]},gems:[25,1,6],jewellery:[25,1,6],magic:[10,1]},
  C:{coins:{cp:[20,1,12],sp:[30,1,4],ep:[10,1,4]},gems:[25,1,4],jewellery:[25,1,4],magic:[10,2]},
  D:{coins:{cp:[10,1,8],sp:[15,1,12],gp:[60,1,6]},gems:[30,1,8],jewellery:[30,1,8],magic:[15,3]},
  E:{coins:{cp:[5,1,10],sp:[30,1,12],ep:[25,1,4],gp:[25,1,8]},gems:[10,1,10],jewellery:[10,1,10],magic:[25,4]},
  F:{coins:{sp:[10,2,10],ep:[20,1,8],gp:[45,1,12],pp:[30,1,3]},gems:[20,2,12],jewellery:[10,1,12],magic:[30,5]}
};
for (const [type, table] of Object.entries(lairTypes)) test(`B/X lair treasure ${type}: each component rolls independently at its exact boundary`, () => {
  const empty = call('bxLairTreasure', type, () => .999999);
  assert.deepEqual(empty, {coins:{cp:0,sp:0,ep:0,gp:0,pp:0},gems:[],jewellery:[],magicItems:0,magicNotes:[]});
  assert.equal(context.bxTreasureText(empty), 'No treasure.');
  for (const component of [...Object.keys(table.coins),'gems','jewellery','magic']) for (const success of [true,false]) {
    const steps = [], selected = name => name === component && success;
    const boundary = (name, percent) => name === component ? percent + (success?0:1) : 100;
    const expected = {coins:{cp:0,sp:0,ep:0,gp:0,pp:0},gems:[],jewellery:[],magicItems:0};
    for (const [coin,[percent,count,sides]] of Object.entries(table.coins)) {
      steps.push([100,boundary(coin,percent)]);
      if (selected(coin)) {steps.push(...Array.from({length:count},()=>[sides,sides]));expected.coins[coin]=count*sides*1000;}
    }
    for (const category of ['gems','jewellery']) {
      const [percent,count,sides] = table[category];steps.push([100,boundary(category,percent)]);
      if (selected(category)) {
        steps.push(...Array.from({length:count},()=>[sides,sides]));
        const amount=count*sides;expected[category]=Array(amount).fill(category==='gems'?1000:1800);
        steps.push(...Array.from({length:amount*(category==='gems'?1:3)},()=>category==='gems'?[20,20]:[6,6]));
      }
    }
    steps.push([100,boundary('magic',table.magic[0])]);expected.magicItems=selected('magic')?table.magic[1]:0;
    const rng = dice(steps), loot = call('bxLairTreasure', type, rng);rng.done();
    const {magicNotes,...values}=loot;assert.deepEqual(values,expected,`${component} ${success?'at':'above'} its boundary`);
    assert.equal(magicNotes.length>0,selected('magic'));
    if(selected('magic'))assert.ok(magicNotes.every(note=>/B\/X/.test(note)), 'magic outcomes name their required B/X table');
  }
});

test('lair magic bundles preserve B–F restrictions and group bonus gold is added once', () => {
  const texts = Object.fromEntries(Object.keys(lairTypes).map(type=>[type,context.bxTreasureText(call('bxLairTreasure',type,()=>0))]));
  assert.match(texts.B,/sword, suit of armour, or weapon/);
  assert.match(texts.C,/2 items: roll each/);
  assert.match(texts.D,/2 items: roll each.*1 potion/);
  assert.match(texts.E,/3 items: roll each.*1 scroll/);
  assert.match(texts.F,/3 non-weapon items.*excluding swords and other weapons.*1 potion.*1 scroll/);
  for(const bonus of [0,1000,2500])assert.equal(call('bxLairTreasure','C',()=>.999999,bonus).coins.gp,bonus);
  assert.equal(call('bxLairTreasure','B',()=>0,1000).coins.gp,2000);
  assert.equal(call('bxLairTreasure','B',()=>.999999,-1000).coins.gp,0);
  assert.throws(()=>context.bxLairTreasure('A',()=>0),/Unsupported B\/X treasure type/);
});

test('treasure text names every denomination, each gem and jewel value, and magic table work', () => {
  const text=context.bxTreasureText({coins:{cp:1,sp:2,ep:3,gp:4,pp:5},gems:[10,1000],jewellery:[300,1800],magicItems:1});
  for(const phrase of ['1 cp','2 sp','3 ep','4 gp','5 pp','2 gems (10 gp, 1000 gp)','2 pieces of jewellery (300 gp, 1800 gp)','1 magic item: roll on B/X magic-item tables'])assert.ok(text.includes(phrase),phrase);
});

function inspect(map) {
  const {model,rooms,layout:L}=map;
  const at = object => [Math.floor((object.x-L.ox)/L.cell),Math.floor((object.y-L.oy)/L.cell)];
  const roomAt = object => {const[c,r]=at(object);return rooms.findIndex(m=>c>=m.x&&c<m.x+m.w&&r>=m.y&&r<m.y+m.h);};
  const keys=model.syms.filter(s=>s.type==='key');
  return {at,roomAt,keys,byArea:new Map(keys.map(key=>[key.n,key]))};
}
function geometry(map) {
  return {cells:map.model.cells,syms:map.model.syms.map(({name,notes,...symbol})=>symbol),labels:map.model.labels,rooms:map.rooms,routes:map.routes};
}
function checkTrapLocations(map) {
  const p=inspect(map),coverage=new Set();
  for(const key of p.keys) {
    const stock=map.stock[p.roomAt(key)];if(stock.kind!=='trap')continue;
    const markers=map.model.syms.filter(s=>s.stockArea===key.n&&s.stocking);
    const locations=key.notes.split('\n\n').filter(text=>text.startsWith('Trap location:'));
    assert.equal(locations.length,1,'every trap has one unambiguous location');
    assert.ok(markers.length<=1,'a trapped cache has a single marker for its chest and trigger');
    const location=locations[0],marker=markers[0];
    if(stock.hasTreasure) {
      assert.ok(!markers.some(s=>s.stocking==='trap'),'a trapped strongbox has no separate floor-trap marker');
      if(marker) {
        assert.equal(marker.icon,'Chest1x1');assert.equal(marker.stockTrap,true);
        assert.match(location,/strongbox latch/);coverage.add('cache marker');
      }else {
        assert.match(location,/wall.*strongbox.*latch.*no separate floor trigger/);
        assert.match(key.notes,/Cache location:.*wall recess/);coverage.add('wall cache');continue;
      }
    }else {
      if(marker){assert.equal(marker.stocking,'trap');assert.equal(marker.icon,'Trap1x1');coverage.add('room marker');}
      else coverage.add('keyed floor trigger');
      const description=key.notes.split('\n\n').find(text=>text.startsWith('Trap:'));
      assert.ok(!/north wall|room[’']s entrance|entrance-side/i.test(description),'the trigger description uses its keyed position');
    }
    const coordinates=location.match(/column (\d+), row (\d+)/);assert.ok(coordinates,'the trigger has concrete grid coordinates');
    const [c,r]=p.at(marker||key);
    assert.deepEqual(coordinates.slice(1).map(Number),[c+1,r+1],'trigger coordinates match the actual marker or unoccupied keyed floor square');
  }
  return coverage;
}

for (const layout of ['compact','scattered']) test(`${layout} generation: B/X notes, private treasure/trap markers and saves agree`, () => {
  for (const seed of ['bx-stock-a','bx-stock-b','bx-stock-c']) {
    const map=generate(seed,{layout,jaquay:'yes',level:3}),p=inspect(map);
    assert.equal(p.keys.length,map.rooms.length);
    assert.equal(map.stock.length,map.rooms.length);
    for(const key of p.keys) {
      const room=p.roomAt(key),stock=map.stock[room];assert.ok(stock);
      const title=stock.kind[0].toUpperCase()+stock.kind.slice(1);
      assert.ok(key.notes.startsWith('B/X contents: '+title+'.'), 'notes start with the actual contents roll');
      assert.ok(key.notes.length<=8000);
      if(stock.kind==='monster')assert.match(key.notes,/\bHD\b.*\bML\b|\bML\b.*\bHD\b/, 'monster entries include B/X game statistics');
      if(stock.kind==='trap')assert.match(key.notes,/trigger|pressure|opening|touch|trip|step|lift|pull/i, 'trap has a concrete trigger');
      if(stock.hasTreasure)assert.match(key.notes,/treasure|hoard|cache/i);
      assert.ok(map.gmText.includes(key.notes));
      assert.ok(!Object.hasOwn(key,'stock')&&!Object.hasOwn(key,'stocking'), 'editable notes have no parallel persistent stock record');
    }
    const markers=map.model.syms.filter(s=>s.stocking);
    for(const marker of markers) {
      assert.ok(['treasure','trap'].includes(marker.stocking));assert.equal(marker.gm,true);
      const key=p.byArea.get(marker.stockArea);assert.ok(key,'marker cites an existing stable area');
      assert.equal(p.roomAt(marker),p.roomAt(key),'marker belongs to its keyed room');
      const stock=map.stock[p.roomAt(marker)];
      if(marker.stocking==='treasure')assert.equal(stock.hasTreasure,true);
      else {assert.equal(stock.kind,'trap');assert.equal(stock.hasTreasure,false,'room-trap markers never duplicate a trapped chest');}
      assert.equal(Boolean(marker.stockTrap),marker.stocking==='treasure'&&stock.kind==='trap','only a trapped cache carries its chest trap flag');
      assert.equal(map.model.cells[p.at(marker).join(',')],'floor');
      assert.ok(!map.playerSymbols.some(s=>s.stocking&&s.stockArea===marker.stockArea&&s.stocking===marker.stocking));
    }
    const lootIcons=map.model.syms.filter(s=>/^(?:Chest|Loot|Trap)\d+x\d+$/.test(s.icon||''));
    assert.ok(lootIcons.every(s=>s.stocking&&s.gm), 'generic decoration cannot introduce unstocked treasure or traps');
    assert.equal(map.playerText,'');
    assert.ok(!map.playerLegend.some(icon=>/^(?:Chest|Loot|Trap)\d+x\d+$/.test(icon)), 'stock symbols stay out of Player legend');
    const backup=JSON.parse(JSON.stringify(map.model));
    assert.deepEqual(backup.syms.filter(s=>s.type==='key').map(s=>s.notes),p.keys.map(s=>s.notes));
    assert.deepEqual(backup.syms.filter(s=>s.stocking),markers);
    checkTrapLocations(map);
  }
});

for (const layout of ['compact','scattered']) test(`${layout} stocking replays and theme/depth changes preserve map and marker geometry`, () => {
  const opts={layout,jaquay:'yes',theme:'keep',level:1},a=generate('bx-content-isolation',opts);
  assert.deepEqual(generate('bx-content-isolation',opts),a);
  for(const changes of [{theme:'crypt'},{theme:'temple',level:9},{theme:'cavern',level:5},{level:9}]) {
    const b=generate('bx-content-isolation',{...opts,...changes});
    assert.deepEqual(geometry(b),geometry(a), 'floors, stairs, doors, fixtures and stock markers keep their exact coordinates');
    assert.deepEqual(b.stock.map(s=>[s.kind,s.contentRoll,s.treasureRoll,s.hasTreasure]),a.stock.map(s=>[s.kind,s.contentRoll,s.treasureRoll,s.hasTreasure]));
    assert.notDeepEqual(b.model.syms.filter(s=>s.type==='key').map(s=>s.notes),a.model.syms.filter(s=>s.type==='key').map(s=>s.notes));
  }
  assert.equal(context.window.rngIsolation(),true, 'stock and note writing never consume the geometry RNG');
});

test('cramped chambers keep their stocking notes when a fixture has no safe footprint', () => {
  for(const layout of ['compact','scattered']) {
    const map=generate('bx-cramped',{cols:8,rows:8,layout,roomSize:'small',density:'packed',stairs:'no'}),p=inspect(map);
    assert.ok(p.keys.length>0);
    for(const key of p.keys) {
      const stock=map.stock[p.roomAt(key)],title=stock.kind[0].toUpperCase()+stock.kind.slice(1);
      assert.ok(key.notes.startsWith('B/X contents: '+title+'.'));
    }
    const objects=map.model.syms.filter(s=>!/^Door/.test(s.icon||''));
    assert.equal(new Set(objects.map(s=>p.at(s).join(','))).size,objects.length, 'stock markers never displace another footprint');
    assert.ok(objects.every(s=>map.model.cells[p.at(s).join(',')]==='floor'));
  }
});

test('trap location regressions: one trapped chest shares its trigger coordinates, and room traps identify the actual floor square', () => {
  const map=generate('bx-stock-a',{layout:'compact',jaquay:'yes',level:3}),p=inspect(map),key=p.byArea.get(3);
  assert.ok(key.notes.startsWith('B/X contents: Trap.'));
  assert.equal(map.stock[p.roomAt(key)].hasTreasure,true);
  const markers=map.model.syms.filter(s=>s.stockArea===3&&s.stocking);
  assert.equal(markers.length,1,'area 3 keeps one private trapped-cache marker');
  assert.equal(markers[0].stocking,'treasure');assert.equal(markers[0].stockTrap,true);assert.equal(markers[0].gm,true);
  const coverage=checkTrapLocations(map);
  for(const fixture of [generate('bx-stock-c',{layout:'compact',jaquay:'yes',level:3}),generate('bx-stock-a',{layout:'scattered',jaquay:'yes',level:3,roomSize:'large',density:'packed'})]) {
    for(const kind of checkTrapLocations(fixture))coverage.add(kind);
  }
  assert.deepEqual([...coverage].sort(),['cache marker','keyed floor trigger','room marker','wall cache'].sort(),'fixtures exercise stamped and unstamped caches and room traps');
});

test('level-one crypt Skeletons have Nil treasure and empty private caches without extra treasure rolls', () => {
  const monster=call('bxMonsterGroup',1,'crypt',()=>0);
  assert.deepEqual({name:monster.name,hd:monster.hd,count:monster.count,morale:monster.morale,treasureType:monster.treasureType},
    {name:'Skeleton',hd:'1',count:3,morale:12,treasureType:'Nil'});
  const empty={coins:{cp:0,sp:0,ep:0,gp:0,pp:0},gems:[],jewellery:[],magicItems:0,magicNotes:[]};
  let rolls=0;
  for(const type of ['Nil','None'])assert.deepEqual(call('bxLairTreasure',type,()=>{rolls++;return 0;}),empty);
  assert.equal(rolls,0,'Nil treasure consumes no random draws or retry');
  const map=generate('bx-stock-a',{layout:'compact',theme:'crypt',level:1,jaquay:'yes'}),p=inspect(map);
  const caches=p.keys.filter(key=>{const stock=map.stock[p.roomAt(key)];return stock.monster?.name==='Skeleton'&&stock.hasTreasure;});
  assert.ok(caches.length>0,'the fixed crypt seed exercises a Skeleton cache-presence roll');
  let marked=0;
  for(const key of caches) {
    const stock=map.stock[p.roomAt(key)];assert.equal(stock.monster.treasureType,'Nil');assert.deepEqual(stock.loot,empty);
    assert.match(key.notes,/B\/X HD 1; ML 12/);assert.match(key.notes,/Behaviour: these undead/);
    assert.match(key.notes,/Treasure: none\..*no B\/X lair treasure.*strongbox is empty/);
    assert.ok(!key.notes.includes('one communal type'),'a successful presence roll cannot invent a Nil hoard');
    for(const marker of map.model.syms.filter(s=>s.stockArea===key.n&&s.stocking)) {
      marked++;assert.equal(marker.stocking,'treasure');assert.equal(marker.icon,'Chest1x1');assert.equal(marker.gm,true);
      assert.ok(!map.playerSymbols.some(s=>s.stocking==='treasure'&&s.stockArea===key.n));
    }
  }
  assert.ok(marked>0,'at least one empty-cache marker retains its private footprint');
});
