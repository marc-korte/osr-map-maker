'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let inlineScripts = 0;
const assets = new Set();
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
  const src = match[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  if (src) {
    assert.ok(!/^(?:[a-z]+:|\/\/)/i.test(src[1]), 'runtime scripts must be shipped with the static site');
    const file = path.resolve(root, src[1]);
    assert.ok(file.startsWith(root + path.sep), 'runtime script must stay inside the site');
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: src[1] });
    assets.add(src[1]);
  } else if (match[2].trim()) {
    new vm.Script(match[2], { filename: `index.html:inline-${++inlineScripts}` });
  }
}
assert.ok(inlineScripts > 0, 'the app inline script must be checked');
assert.ok(assets.has('icons.js') && assets.has('town.js'), 'both map engines must be present');
console.log(`Syntax and runtime asset checks passed (${inlineScripts} inline script).`);

for (const file of ['tests/town.test.cjs', 'tests/town-variety.test.cjs', 'tests/town-realism.test.cjs', 'tests/town-import.test.cjs', 'tests/town-engine.test.cjs', 'tests/wilderness.test.cjs', 'tests/dungeon.test.cjs', 'tests/storage.test.cjs']) {
  const result = spawnSync(process.execPath, [path.join(root, file)], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
