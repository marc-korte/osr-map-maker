'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the production autosave/load-baseline functions in independent tabs.
// DOM/status are mocked; migration, validation and load callers are production
// code. Storage is shared as across same-origin tabs, not an atomic-CAS test.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `production section: ${start}`);
  return html.slice(a, b);
}
function declaration(name) {
  const found = html.match(new RegExp(`const ${name}=[^\\n]+`));
  assert.ok(found, `production declaration: ${name}`);
  return found[0];
}
const fixture = () => ({ v: 4, mode: 'dun', view: 'gm', title: 'Map', titleD: 'Map', cells: { '0,0': 'floor' } });
function store(initial) {
  const values = new Map(Object.entries(initial || {})), writes = [];
  return {
    values, writes, failRead: false, failWrite: false,
    getItem(key) { if (this.failRead) throw new Error('storage unavailable'); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { if (this.failWrite) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); values.set(key, String(value)); writes.push(key); },
    removeItem(key) { values.delete(key); }
  };
}
function tab(storage) {
  const status = { textContent: '', dataset: {} }, title = { value: fixture().title }, banners = [], handlers = {};
  const context = vm.createContext({
    localStorage: storage, JSON, initial: fixture(),
    document: { getElementById: id => id === 'title' ? title : id === 'saveStatus' ? status : null },
    window: { addEventListener: (name, handler) => { handlers[name] = handler; } },
    showBanner: message => banners.push(message)
  });
  const source = `
    ${declaration('PPI')}
    ${declaration('DUN_CELL')}
    ${declaration('WILD_HEX')}
    ${declaration('WILD_MIN')}
    ${declaration('MODE_FIELDS')}
    ${declaration('modeFields')}
    ${section('const SCHEMA_V=', '// Stable numbers identify')}
    Object.assign(M,JSON.parse(JSON.stringify(initial)));let noAutosave=false;
    ${section('const MAX_KEY_NUMBER=', '// generate-option defaults')}
    ${section('const isSecretDoor=', '// symbol snap:')}
    ${section('function pageW(', 'function fitCanvas(){')}
    ${declaration('edgeKeyOf')}
    ${section('function straightenHexRoad(', '// A small visibility roadmap')}
    ${section('function readTitle(){', 'function toast(')}
    ${section('let saveWarned=false;', '// ---- load validation / migration:')}
    ${section('function validateMap(', 'function afterLoad(){')}
    ${section('function parseMap(', 'let bakPending=false;')}
    let bakPending=false;
    window.api={load:()=>{loadLS();document.getElementById('title').value=M.title||'';},save,set:values=>{Object.assign(M,values);if('title'in values)document.getElementById('title').value=values.title;},preview:value=>noAutosave=value,
      defaults:()=>JSON.stringify(JSON.parse(M0)),maximum:MAX_KEY_NUMBER,validate:values=>validateMap(JSON.parse(JSON.stringify(values))),
      snapshot:()=>JSON.stringify({model:M,lastSaved,saveBaselineReady,saveConflict,bakPending})};
  `;
  vm.runInContext(source, context, { filename: 'production-autosave.js' });
  // Validate outside parseMap's catch so a missing production dependency cannot
  // silently turn valid fixtures into supposedly corrupted autosaves.
  assert.notEqual(vm.runInContext('migrateMap(JSON.parse(JSON.stringify(initial)))', context), null,
    'production migration prerequisites must be available');
  assert.equal(vm.runInContext('validateMap(JSON.parse(JSON.stringify(initial)))', context), null,
    'production validation must accept the baseline fixture before autosave tests');
  assert.ok(vm.runInContext('keyNumberPlan(JSON.parse(JSON.stringify(initial)))', context),
    'the production key-number planner must be available');
  const api = context.window.api;
  return {
    ...api, status, banners,
    defaults: () => JSON.parse(api.defaults()),
    snapshot: () => JSON.parse(api.snapshot()),
    storageEvent: (key = 'osrmap', extra = {}) => handlers.storage({ key, storageArea: storage, ...extra })
  };
}
const saved = storage => JSON.parse(storage.getItem('osrmap'));

test('a fresh workspace and consecutive own saves keep advancing their baseline', () => {
  const storage = store(), a = tab(storage);a.load();a.save();
  a.set({ title: 'First edit' });a.save();a.set({ title: 'Second edit' });a.save();
  assert.equal(saved(storage).title, 'Second edit');
  assert.equal(a.snapshot().lastSaved, storage.getItem('osrmap'));
  assert.equal(a.snapshot().saveConflict, false);
  assert.equal(a.status.textContent, 'Autosaved on this device');
});

test('a stale editing tab cannot overwrite another tab and keeps its in-memory work', () => {
  const raw = JSON.stringify(fixture()), storage = store({ osrmap: raw }), a = tab(storage), b = tab(storage);a.load();b.load();
  a.set({ title: 'A edit' });a.save();const fromA = storage.getItem('osrmap');
  b.set({ title: 'B edit' });b.save();
  assert.equal(storage.getItem('osrmap'), fromA);
  assert.equal(b.snapshot().model.title, 'B edit');
  assert.equal(b.snapshot().saveConflict, true);
  assert.equal(b.status.dataset.state, 'warning');
  assert.match(b.status.textContent, /paused/);
  assert.match(b.banners.at(-1), /Save backup/);
  assert.match(b.banners.at(-1), /reloading/);
  a.set({ title: 'A later edit' });a.save();
  assert.equal(saved(storage).title, 'A later edit');
});

test('a stale mode/view save is blocked even without a drawing edit', () => {
  const storage = store({ osrmap: JSON.stringify(fixture()) }), a = tab(storage), b = tab(storage);a.load();b.load();
  a.set({ cells: { '0,0': 'floor', '1,0': 'floor' } });a.save();
  b.set({ view: 'player' });b.save();
  assert.equal(saved(storage).cells['1,0'], 'floor');
  assert.equal(saved(storage).view, 'gm');
  assert.equal(b.snapshot().model.view, 'player');
  assert.equal(b.snapshot().saveConflict, true);
});

test('an unchanged stale tab close does not overwrite or claim its old state was saved', () => {
  const storage = store({ osrmap: JSON.stringify(fixture()) }), a = tab(storage), b = tab(storage);a.load();b.load();
  a.set({ title: 'Newer workspace' });a.save();const writes = storage.writes.length;
  b.save();
  assert.equal(storage.writes.length, writes);
  assert.equal(saved(storage).title, 'Newer workspace');
  assert.equal(b.snapshot().saveConflict, true);
  assert.notEqual(b.status.textContent, 'Autosaved on this device');
});

test('a storage event pauses immediately and a paused tab only resumes by loading again', () => {
  const storage = store({ osrmap: JSON.stringify(fixture()) }), a = tab(storage), b = tab(storage);a.load();b.load();
  a.set({ title: 'From A' });a.save();b.storageEvent();
  assert.equal(b.snapshot().saveConflict, true);
  const banners = b.banners.length;b.set({ title: 'Unsaved B' });b.save();b.save();
  assert.equal(saved(storage).title, 'From A');assert.equal(b.banners.length, banners);
  b.load();b.set({ title: 'B after reload' });b.save();
  assert.equal(saved(storage).title, 'B after reload');assert.equal(b.snapshot().saveConflict, false);
});

test('delayed events and identical external content do not create false conflicts', () => {
  const storage = store({ osrmap: JSON.stringify(fixture()) }), a = tab(storage);a.load();
  a.set({ title: 'Identical' });
  storage.setItem('osrmap', JSON.stringify(a.snapshot().model));a.storageEvent('osrmap', { newValue: 'stale queued value' });
  assert.equal(a.snapshot().saveConflict, false);
  a.save();a.set({ title: 'Own later write' });a.save();a.storageEvent('osrmap', { newValue: 'even older value' });
  assert.equal(a.snapshot().saveConflict, false);assert.equal(saved(storage).title, 'Own later write');
});

test('legacy normalization compares against raw loaded storage rather than the migrated model', () => {
  const legacy = { ...fixture(), v: 1 }, raw = JSON.stringify(legacy), storage = store({ osrmap: raw }), a = tab(storage);a.load();
  assert.equal(a.snapshot().lastSaved, raw);assert.equal(a.snapshot().model.v, 4);
  a.save();assert.equal(saved(storage).v, 4);assert.equal(a.snapshot().saveConflict, false);
});

test('a legacy-key-only workspace writes its primary autosave without a false conflict', () => {
  const storage = store({ tsrmap2: JSON.stringify(fixture()) }), a = tab(storage);a.load();
  assert.equal(a.snapshot().lastSaved, null);a.save();
  assert.equal(saved(storage).title, 'Map');assert.equal(a.snapshot().saveConflict, false);
});

test('corrupt autosave recovery retains the corrupt raw baseline until the recovered map saves', () => {
  const raw = '{broken', backup = { ...fixture(), title: 'Recovered', titleD: 'Recovered' };
  const storage = store({ osrmap: raw, 'osrmap.bak': JSON.stringify(backup) }), a = tab(storage);a.load();
  assert.equal(storage.getItem('osrmap.corrupt'), raw);assert.equal(a.snapshot().lastSaved, raw);
  assert.equal(a.snapshot().model.title, 'Recovered');assert.equal(a.snapshot().bakPending, false);
  a.save();assert.equal(saved(storage).title, 'Recovered');assert.equal(a.snapshot().saveConflict, false);
});

function exhaustedAfterSanitizing(a) {
  return { ...a.defaults(), v: 3, mode: 'dun', nextKeyD: a.maximum + 1,
    syms: [{ x: 'damaged', y: 0, type: 'key', n: a.maximum },
      { x: 200, y: 200, type: 'key', n: 2 }, { x: 225, y: 200, type: 'key' }] };
}

test('startup rejects post-sanitization exhaustion, quarantines raw data and restores a valid backup', () => {
  const backup = { ...fixture(), title: 'Recovered after migration rejection', titleD: 'Recovered after migration rejection' };
  const storage = store({ 'osrmap.bak': JSON.stringify(backup) }), a = tab(storage), damaged = exhaustedAfterSanitizing(a), raw = JSON.stringify(damaged);
  assert.match(a.validate(damaged), /exhausted after damaged items/);
  storage.setItem('osrmap', raw);a.load();
  assert.equal(storage.getItem('osrmap'), raw, 'rejected raw autosave is not overwritten during load');
  assert.equal(storage.getItem('osrmap.corrupt'), raw, 'full rejected project is quarantined');
  assert.equal(a.snapshot().model.title, backup.title);
  assert.equal(a.snapshot().bakPending, false, 'recovery cannot refresh the good backup with defaults');
  a.save();assert.equal(saved(storage).title, backup.title);
  assert.equal(JSON.parse(storage.getItem('osrmap.bak')).title, backup.title);
  assert.equal(storage.getItem('osrmap.corrupt'), raw);
});

test('startup preserves rejected raw data before starting fresh when no valid backup exists', () => {
  const storage = store(), a = tab(storage), raw = JSON.stringify(exhaustedAfterSanitizing(a));storage.setItem('osrmap', raw);a.load();
  assert.equal(storage.getItem('osrmap'), raw);
  assert.equal(storage.getItem('osrmap.corrupt'), raw);
  assert.equal(a.snapshot().bakPending, false);
  assert.equal(storage.getItem('osrmap.bak'), null);
  assert.match(a.banners.at(-1), /no backup was available/);
  a.save();assert.equal(storage.getItem('osrmap.corrupt'), raw, 'fresh autosave never destroys the quarantined source');
  assert.equal(storage.getItem('osrmap.bak'), null);
});

test('quota failures keep the previous baseline and can retry safely', () => {
  const raw = JSON.stringify(fixture()), storage = store({ osrmap: raw }), a = tab(storage);a.load();a.set({ title: 'Retriable' });storage.failWrite = true;a.save();
  assert.equal(a.snapshot().lastSaved, raw);assert.equal(storage.getItem('osrmap'), raw);assert.match(a.status.textContent, /unavailable/);
  storage.failWrite = false;a.save();assert.equal(saved(storage).title, 'Retriable');assert.equal(a.snapshot().saveConflict, false);
});

test('a failed initial storage read never blindly replaces an existing workspace later', () => {
  const raw = JSON.stringify({ ...fixture(), title: 'Existing', titleD: 'Existing' }), storage = store({ osrmap: raw }), a = tab(storage);storage.failRead = true;a.load();
  assert.equal(a.snapshot().saveBaselineReady, false);storage.failRead = false;a.save();
  assert.equal(storage.getItem('osrmap'), raw);assert.equal(a.snapshot().saveConflict, true);
});

test('preview sessions ignore autosave changes and never write their fixtures', () => {
  const raw = JSON.stringify(fixture()), storage = store({ osrmap: raw }), a = tab(storage);a.load();a.preview(true);
  storage.setItem('osrmap', JSON.stringify({ ...fixture(), title: 'External', titleD: 'External' }));a.storageEvent();a.set({ title: 'Sample fixture' });a.save();
  assert.equal(saved(storage).title, 'External');assert.equal(a.snapshot().saveConflict, false);assert.equal(a.status.dataset.state, 'preview');
});

test('clearing shared storage warns a stale tab instead of republishing its old map', () => {
  const storage = store({ osrmap: JSON.stringify(fixture()) }), a = tab(storage);a.load();storage.removeItem('osrmap');a.storageEvent(null);
  assert.equal(a.snapshot().saveConflict, true);a.save();assert.equal(storage.getItem('osrmap'), null);
});

test('unrelated storage changes are ignored and warnings never include private model text', () => {
  const storage = store({ osrmap: JSON.stringify(fixture()) }), a = tab(storage);a.load();a.storageEvent('osrmap.panel');assert.equal(a.snapshot().saveConflict, false);
  a.set({ title: 'SECRET_SENTINEL' });storage.setItem('osrmap', JSON.stringify({ ...fixture(), title: 'OTHER_PRIVATE_SENTINEL' }));a.save();
  assert.ok(a.banners.length);assert.ok(a.banners.every(message => !message.includes('SENTINEL')));
});

test('terrain artwork placement survives save/load while malformed placement is discarded', () => {
  const storage=store(),a=tab(storage);a.load();
  const art={dx:12,dy:-15,scale:.76};
  a.set({hex:{'0,0':'Forest','1,0':{n:'Hills',art},'2,0':{n:'Forest',art:{dx:1e99,dy:0,scale:-1}},'3,0':{n:'Grassland',art:{dx:0,dy:0,scale:0}}}});a.save();
  const b=tab(storage);b.load();const hex=b.snapshot().model.hex;
  assert.equal(hex['0,0'],'Forest','legacy centered terrain keeps its original representation');
  assert.deepEqual(hex['1,0'].art,art,'the saved composition retains its exact placement');
  assert.equal(hex['2,0'].art,undefined,'invalid artwork metadata does not reach rendering');
  assert.deepEqual(hex['3,0'].art,{dx:0,dy:0,scale:0},'omitting a picture preserves the actual grassland terrain');
});
