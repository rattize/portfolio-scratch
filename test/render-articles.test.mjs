import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fixture(t, catalog, markdown = 'Hello') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ['scripts', 'content/articles', 'assets/css']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.copyFileSync(path.join(repo, 'scripts/render-articles.mjs'), path.join(root, 'scripts/render-articles.mjs'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(root, 'content/articles/catalog.json'), JSON.stringify(catalog));
  fs.writeFileSync(path.join(root, 'content/articles/hello.md'), markdown);
  fs.writeFileSync(path.join(root, 'assets/css/site.css'), '');
  return { root, run: () => spawnSync(process.execPath, ['scripts/render-articles.mjs'], { cwd: root, encoding: 'utf8' }) };
}
const entry = { slug: 'hello', title: '<Title>', date: '2026-10-08', summary: 'A & B' };
test('renders escaped metadata and raw HTML as text without browser JS', t => {
  const f = fixture(t, [entry], '<script>alert(1)</script>\n\n![poster](~/assets/css/site.css)');
  assert.equal(f.run().status, 0);
  const html = fs.readFileSync(path.join(f.root, 'articles/hello/index.html'), 'utf8');
  assert.match(html, /&lt;Title&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /src="..\/..\/assets\/css\/site.css"/);
  assert.match(fs.readFileSync(path.join(f.root, 'articles/index.html'), 'utf8'), /A &amp; B/);
});
test('rejects duplicate slugs and invalid calendar dates', t => {
  const duplicate = fixture(t, [entry, entry]);
  assert.notEqual(duplicate.run().status, 0);
  const date = fixture(t, [{ ...entry, date: '2026-02-30' }]);
  assert.notEqual(date.run().status, 0);
});
test('rejects unsafe and broken URLs and orphan outputs', t => {
  for (const markdown of ['![x](data:image/svg+xml,hi)', '[x](//evil.example)', '![x](./missing.png)', '[x](../index.html)']) {
    const f = fixture(t, [entry], markdown);
    assert.notEqual(f.run().status, 0, markdown);
  }
  const f = fixture(t, [entry]);
  fs.mkdirSync(path.join(f.root, 'articles/stale'), { recursive: true });
  assert.match(f.run().stderr, /Orphan article output/);
});
test('refuses symlinked output and article source', t => {
  const f = fixture(t, [entry]);
  fs.symlinkSync(path.join(os.tmpdir(), 'untrusted-article-output'), path.join(f.root, 'articles'));
  assert.match(f.run().stderr, /real directory/);
  fs.unlinkSync(path.join(f.root, 'articles'));
  fs.unlinkSync(path.join(f.root, 'content/articles/hello.md'));
  const outside = path.join(os.tmpdir(), `outside-${process.pid}.md`);
  fs.writeFileSync(outside, 'outside');
  t.after(() => fs.rmSync(outside, { force: true }));
  fs.symlinkSync(outside, path.join(f.root, 'content/articles/hello.md'));
  assert.match(f.run().stderr, /unsafe article/);
});
test('resolves links between new articles before either output exists', t => {
  const f = fixture(t, [entry, { ...entry, slug: 'next', title: 'Next' }], '[next](~/articles/next/index.html)');
  fs.writeFileSync(path.join(f.root, 'content/articles/next.md'), 'Second article');
  assert.equal(f.run().status, 0);
  assert.match(fs.readFileSync(path.join(f.root, 'articles/hello/index.html'), 'utf8'), /href="..\/next\/index.html"/);
});
