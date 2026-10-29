'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Town = require('../town.js');

// Run the shipping edit functions with explicit UI/history stubs. These tests
// check the unavailable-engine boundary; native browser tests cover real input.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function production(name) {
  const start = html.indexOf('function ' + name + '(');
  assert(start >= 0, 'production function exists: ' + name);
  const next = html.indexOf('\nfunction ', start + 1);
  const end = html.lastIndexOf('}', next < 0 ? html.length : next);
  const body = html.slice(start, end + 1);
  new vm.Script('(' + body + '\n)', { filename: name + '.js' });
  return body;
}
const functions = ['og', 'selection', 'townBuildingVisible', 'townEngineReady', 'townEditsBlocked', 'preserveTownPropertyPrivacy',
  'moveTownObject', 'toolSelectTown', 'toolEraseLine', 'toolTownBuilding', 'toolTownSite', 'toolTownErase',
  'apply', 'applyT', 'deleteSelection', 'toggleGM', 'nudgeSelection', 'drawTown', 'genTown'];
const generated = Town.generate('missing-engine-boundary', { size: 'village', water: 'none', layout: 'organic' });
const initial = () => ({ mode: 'town', view: 'gm', title: 'Retained town', cols: 40, rows: 32,
  town: structuredClone(generated), labelsT: [], drawsT: [{ kind: 'road', pts: [[10, 10], [90, 10]] }], nextKeyT: 100 });

function fixture() {
  const context = vm.createContext({ initial: initial(), engine: Town });
  vm.runInContext(`
    const M=initial, window={}, banners=[], effects=[], history={undo:[],redo:[]}, painted=[];
    let selTown={kind:'building',id:M.town.buildings[0].id},selSite=-1,selDraw=-1,sel=-1,selLabel=-1,selHex=null;
    let dragging={k:'town',x0:0,y0:0},dragPrev={x:0,y:0},pendingEdit=null,editorCommit=null,editorCount=0,tool='select',_pre=null;
    const ptrs=new Set(),L={ox:40,oy:150,cell:25},DUN_CELL=25,MAP_STYLE={},exporting=false;
    const ONCE=new Set(['building','townsite','erase']),HANDLERS={any:{drawroad(){effects.push('handler');}},town:{building(){effects.push('handler');}}};
    function showBanner(message){banners.push(message);}
    function beginChange(){effects.push('begin');_pre=JSON.stringify(M);}
    function commitChange(){effects.push('commit');if(_pre!==null){history.undo.push(_pre);_pre=null;}}
    const render=()=>effects.push('render'),save=()=>effects.push('save'),buildTools=()=>effects.push('tools'),sync=()=>effects.push('sync');
    function clearSel(){selTown=null;selSite=selDraw=sel=selLabel=-1;selHex=null;}
    const curDraws=()=>M.drawsT,curLabels=()=>M.labelsT,pickStroke=()=>0,pickCell=()=>[2,2],layout=()=>L,lyr=()=>true;
    const pickStrokeD=()=>({i:-1,d:Infinity}),pickLabelD=()=>({i:-1,d:Infinity}),dragStarted=()=>true,layerBlocked=()=>false;
    const tT=()=>selection()?.o||{},dragDraw=()=>effects.push('dragDraw'),dragLabel=()=>effects.push('dragLabel');
    function allocateKeyNumber(){effects.push('key');return M.nextKeyT++;}
    function openEditor(x,y,value,label,commit){editorCount++;editorCommit=commit;}
    const txt=(g,x,y,text)=>painted.push(text),drawStrokeList=()=>{},drawBridges=()=>{},drawFreeLabel=()=>{},cartouche=()=>{},compass=()=>{},scalebar=()=>{},fmtScale=String,mapScale=()=>25;
    ${functions.map(production).join('\n')}
    const snapshot=()=>JSON.stringify({model:M,selTown,dragging,pending:!!pendingEdit,history,pre:_pre});
    const model=()=>JSON.stringify(M);
  `, context, { filename: 'production-town-edit-boundary.js' });
  return {
    run: code => vm.runInContext(code, context),
    snapshot: () => vm.runInContext('snapshot()', context),
    model: () => vm.runInContext('model()', context),
    read: code => JSON.parse(vm.runInContext('JSON.stringify(' + code + ')', context))
  };
}
const banner = 'The town engine could not load. Reload this page and try again.';

test('engine availability blocks only saved Town edit contexts and supports quiet repeat checks', () => {
  const app = fixture(), before = app.snapshot();
  assert.equal(app.run('townEditsBlocked()'), true);
  assert.deepEqual(app.read('banners'), [banner]);
  assert.equal(app.run('townEditsBlocked(false)'), true);
  assert.deepEqual(app.read('banners'), [banner]);
  assert.equal(app.snapshot(), before);
  app.run("M.mode='wild'");
  assert.equal(app.run('townEditsBlocked()'), false, 'retained Town data does not block wilderness editing');
  app.run("M.mode='town';M.town=null");
  assert.equal(app.run('townEditsBlocked()'), false, 'an empty Town does not require hit testing');
});

test('missing engine stops Town pointer tools and object movement before model or history changes', () => {
  for (const action of ['toolSelectTown(80,200,true,L)', 'toolSelectTown(90,210,false,L)',
    'toolEraseLine(80,200)', 'toolTownBuilding(80,200,true,L)', 'toolTownSite(80,200,true,L)',
    'toolTownErase(80,200,true,L)', 'moveTownObject(M.town.buildings[0],10,20)']) {
    const app = fixture(), before = app.snapshot();
    assert.doesNotThrow(() => app.run(action), action);
    assert.equal(app.snapshot(), before, action + ': coordinates, ownership, selection and transactions are unchanged');
    assert.deepEqual(app.read('effects'), [], action + ': no mutation or editor effects begin');
    if (!action.includes(',false,')) assert.deepEqual(app.read('banners'), [banner]);
  }
});

test('stale Town selections cannot bypass the guard through direct deletion or keyboard actions', () => {
  for (const action of ['selection().del()', 'deleteSelection()', 'toggleGM()', 'nudgeSelection(1,0,false)', 'applyT("fx")']) {
    const app = fixture();
    app.run('M.town.buildings[0].gm=true');
    const before = app.snapshot();
    assert.doesNotThrow(() => app.run(action), action);
    assert.equal(app.snapshot(), before, action + ': private flags, linked property and history remain intact');
    assert.deepEqual(app.read('effects'), []);
    assert.deepEqual(app.read('banners'), [banner]);
  }
});

test('the shared Town pointer dispatcher guards both Town-specific and freehand handlers', () => {
  for (const tool of ['building', 'drawroad']) {
    const app = fixture();app.run('tool=' + JSON.stringify(tool));const before = app.snapshot();
    app.run('apply(80,200,true,true)');
    assert.equal(app.snapshot(), before);
    assert.deepEqual(app.read('effects'), [], 'the handler is never invoked');
    assert.deepEqual(app.read('banners'), [banner]);
  }
});

test('deferred Town site opening and commit recheck engine availability before allocating a key', () => {
  const beforeOpen = fixture();
  beforeOpen.run('window.TownGenerator=engine;toolTownSite(80,200,true,L);const deferred=pendingEdit;pendingEdit=null;window.TownGenerator=undefined');
  const original = beforeOpen.model();beforeOpen.run('deferred()');
  assert.equal(beforeOpen.model(), original);assert.equal(beforeOpen.run('editorCount'), 0);
  assert.deepEqual(beforeOpen.read('effects'), []);assert.deepEqual(beforeOpen.read('banners'), [banner]);

  const beforeCommit = fixture();
  beforeCommit.run('window.TownGenerator=engine;toolTownSite(80,200,true,L);pendingEdit();pendingEdit=null;window.TownGenerator=undefined');
  const unchanged = beforeCommit.model();beforeCommit.run('editorCommit("Late site")');
  assert.equal(beforeCommit.model(), unchanged, 'no site or stable key number is allocated');
  assert.equal(beforeCommit.run('editorCount'), 1);assert.deepEqual(beforeCommit.read('effects'), []);
  assert.deepEqual(beforeCommit.read('banners'), [banner]);
});

test('missing engine explains retained data in the canvas and cannot replace it through Generate', () => {
  const app = fixture(), before = app.snapshot();
  app.run('drawTown({},1240,1020);genTown("blocked")');
  assert.equal(app.snapshot(), before);
  assert(app.read('painted').includes('The town engine could not load'));
  assert(app.read('painted').includes('Reload this page to view and edit your saved town.'));
  assert(!app.read('painted').some(text => text.includes('Choose Generate')));
  assert.deepEqual(app.read('banners'), [banner]);assert.deepEqual(app.read('effects'), []);
  assert.doesNotThrow(() => app.run('preserveTownPropertyPrivacy(M.town.buildings[0])'), 'privacy fallback never dereferences a missing namespace');
});

test('missing-engine visibility preserves inherited and explicit privacy without changing child flags', () => {
  const app = fixture();
  app.run(`
    const main=M.town.buildings[0];main.role='main';main.gm=true;
    const annex={...main,id:'fallback-annex',role:'outbuilding',parentId:main.id,gm:false};
    M.town.buildings.push(annex);M.view='player';
  `);
  assert.equal(app.run('townBuildingVisible(main)'), false);
  assert.equal(app.run('townBuildingVisible(annex)'), false, 'the missing namespace cannot expose a private parent’s outbuilding');
  assert.equal(app.run('annex.gm'), false, 'inherited privacy remains reversible');
  app.run("M.view='gm'");
  assert.equal(app.run('townBuildingVisible(main)&&townBuildingVisible(annex)'), true, 'GM view still sees the compound');
  app.run("M.view='player';main.gm=false");
  assert.equal(app.run('townBuildingVisible(annex)'), true, 'revealing the main house reveals a child without its own private flag');
  app.run('annex.gm=true');
  assert.equal(app.run('townBuildingVisible(annex)'), false, 'an explicit private child stays hidden under a public parent');
  assert.equal(app.run('townBuildingVisible(main)'), true);
  app.run("M.view='gm'");
  assert.equal(app.run('townBuildingVisible(annex)'), true);

  app.run(`M.view='player';annex.gm=false;
    window.TownGenerator={isBuildingVisible(data,building,view){effects.push([data===M.town,building===annex,view]);return false;}};`);
  assert.equal(app.run('townBuildingVisible(annex)'), false, 'an available engine owns the visibility decision');
  assert.deepEqual(app.read('effects'), [[true, true, 'player']]);
});

test('a loaded engine still permits real Town hit testing, construction, movement and deletion', () => {
  const app = fixture();app.run('window.TownGenerator=engine');
  const count = app.run('M.town.buildings.length');
  app.run('const roof=M.town.buildings.find(b=>!b.siteId&&b.role!=="outbuilding");toolSelectTown(roof.x+L.ox,roof.y+L.oy,true,L)');
  assert.equal(app.run('selTown.id===roof.id&&selTown.kind==="building"'), true, 'the real engine can select a roof');
  app.run('toolTownBuilding(150,200,true,L);const custom=M.town.buildings.at(-1);moveTownObject(custom,3,4)');
  assert.equal(app.run('M.town.buildings.length'), count + 1);
  assert.deepEqual(app.read('[custom.x,custom.y,custom.polygon[0]]'), [113, 54, [101, 45]]);
  assert.equal(app.run('nudgeSelection(1,0,false)'), true);
  assert.equal(app.run('custom.x'), 114);
  app.run('deleteSelection()');assert.equal(app.run('M.town.buildings.length'), count);
  assert.deepEqual(app.read('banners'), []);
  assert(app.read('effects').includes('begin') && app.read('effects').includes('commit'), 'normal edit history still records changes');
});
