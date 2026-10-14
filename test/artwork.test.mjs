import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountArtwork } from '../assets/js/artwork.js';

test('WebGL failure preserves poster and enables retry without adding a canvas', async t => {
  const original = globalThis.document;
  const originalCancel = globalThis.cancelAnimationFrame;
  const poster = { hidden: false };
  const status = { textContent: '' };
  const button = { disabled: false, handler: null, addEventListener(type, callback) { this.handler = callback; } };
  const frame = {
    dataset: { model: './approved.glb' },
    querySelector(selector) { return selector === 'img' ? poster : selector === '[data-start]' ? button : status; },
  };
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => { globalThis.document = original; globalThis.cancelAnimationFrame = originalCancel; });
  const unmount = mountArtwork(frame);
  await button.handler();
  assert.equal(poster.hidden, false);
  assert.equal(button.disabled, false);
  assert.match(status.textContent, /WebGL unavailable/);
  await button.handler();
  assert.equal(poster.hidden, false);
  assert.equal(button.disabled, false);
  unmount();
});

test('loader rejection and model 404 restore poster; retry starts cleanly', async t => {
  const original = { document: globalThis.document, fetch: globalThis.fetch, cancel: globalThis.cancelAnimationFrame };
  t.after(() => { globalThis.document = original.document; globalThis.fetch = original.fetch; globalThis.cancelAnimationFrame = original.cancel; });
  const poster = { hidden: false };
  const status = { textContent: '' };
  const button = { disabled: false, addEventListener(_type, callback) { this.click = callback; } };
  const frame = { dataset: { model: './approved.glb' }, querySelector: selector => selector === 'img' ? poster : selector === '[data-start]' ? button : status };
  globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
  globalThis.cancelAnimationFrame = () => {};
  const stop = mountArtwork(frame, () => Promise.reject(new Error('CDN unavailable')));
  await button.click();
  assert.match(status.textContent, /CDN unavailable/);
  assert.equal(button.disabled, false);
  stop();
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  const modules = [{}, {}, {}];
  const stop404 = mountArtwork(frame, () => Promise.resolve(modules));
  await button.click();
  assert.match(status.textContent, /Model HTTP 404/);
  assert.equal(poster.hidden, false);
  stop404();
});

test('load timeout leaves poster and retry button available', async t => {
  const original = { document: globalThis.document, timeout: globalThis.setTimeout, cancel: globalThis.cancelAnimationFrame };
  t.after(() => { globalThis.document = original.document; globalThis.setTimeout = original.timeout; globalThis.cancelAnimationFrame = original.cancel; });
  const poster = { hidden: false };
  const status = { textContent: '' };
  const button = { disabled: false, addEventListener(_type, callback) { this.click = callback; } };
  globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.setTimeout = callback => { queueMicrotask(callback); return 1; };
  const stop = mountArtwork({ dataset: { model: 'approved.glb' }, querySelector: selector => selector === 'img' ? poster : selector === '[data-start]' ? button : status }, () => new Promise(() => {}));
  await button.click();
  assert.match(status.textContent, /Load timed out/);
  assert.equal(button.disabled, false);
  assert.equal(poster.hidden, false);
  stop();
});

test('successful model supports keyboard controls, visibility pause and disposal', async t => {
  const names = ['document', 'fetch', 'cancelAnimationFrame', 'requestAnimationFrame', 'IntersectionObserver', 'ResizeObserver', 'matchMedia', 'devicePixelRatio'];
  const original = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  t.after(() => { for (const name of names) globalThis[name] = original[name]; });
  const events = [];
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
    length() { return Math.hypot(this.x, this.y, this.z); }
    copy(other) { Object.assign(this, other); return this; }
    add(other) { this.x += other.x; return this; }
    sub(other) { this.x -= other.x; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    applyAxisAngle() { this.x += 1; return this; }
    lerp() { this.x += 1; return this; }
    multiplyScalar() { this.x *= 1.15; return this; }
  }
  class Scene { add() {} }
  class Camera { position = new Vector3(); updateProjectionMatrix() {} }
  class Renderer { constructor({ canvas }) { this.domElement = canvas; } setPixelRatio() {} setSize() {} render() { events.push('render'); } dispose() { events.push('renderer-dispose'); } }
  class Box { setFromObject() { return this; } getSize() { return new Vector3(1, 1, 1); } getCenter() { return new Vector3(); } }
  class Controls { target = new Vector3(); constructor() { events.push('controls-created'); } update() {} dispose() { events.push('controls-dispose'); } }
  class Loader { async parseAsync() { return { scene: { traverse(callback) { callback({ geometry: { dispose() { events.push('geometry-dispose'); } }, material: { dispose() { events.push('material-dispose'); } } }); } } }; } }
  const poster = { hidden: false };
  const status = { textContent: '' };
  const button = { disabled: false, addEventListener(_type, callback) { this.click = callback; } };
  const canvas = { getContext: () => ({}), remove() { events.push('canvas-remove'); } };
  let intersection;
  const frame = {
    dataset: { model: 'model.glb' }, clientWidth: 400, clientHeight: 300,
    querySelector: selector => selector === 'img' ? poster : selector === '[data-start]' ? button : status,
    addEventListener(_type, callback) { this.action = callback; }, removeEventListener() { events.push('listener-remove'); },
    insertBefore() { events.push('canvas-insert'); }
  };
  globalThis.document = { hidden: false, createElement: () => canvas, addEventListener() {}, removeEventListener() {} };
  let fetches = 0;
  globalThis.fetch = async () => ++fetches === 1 ? { ok: false, status: 404 } : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  globalThis.cancelAnimationFrame = () => events.push('raf-cancel');
  globalThis.requestAnimationFrame = () => 3;
  globalThis.matchMedia = () => ({ matches: true });
  globalThis.devicePixelRatio = 1;
  globalThis.IntersectionObserver = class { constructor(callback) { this.callback = callback; intersection = this; } observe() {} disconnect() { events.push('intersection-disconnect'); } };
  globalThis.ResizeObserver = class { observe() {} disconnect() { events.push('resize-disconnect'); } };
  const stop = mountArtwork(frame, async () => [
    { Scene, PerspectiveCamera: Camera, WebGLRenderer: Renderer, AmbientLight: class {}, DirectionalLight: class { position = { set() {} }; }, Box3: Box, Vector3 },
    { GLTFLoader: Loader }, { OrbitControls: Controls }
  ]);
  await button.click();
  assert.equal(poster.hidden, false);
  assert.match(status.textContent, /Model HTTP 404/);
  await button.click();
  assert.equal(poster.hidden, true);
  assert.ok(events.includes('render'));
  assert.equal(events.filter(event => event === 'canvas-insert').length, 1);
  frame.action({ target: { closest: () => ({ dataset: { action: 'left' } }) } });
  assert.ok(events.filter(event => event === 'render').length >= 2);
  intersection.callback([{ isIntersecting: false }]);
  assert.equal(events.at(-1), 'raf-cancel');
  intersection.callback([{ isIntersecting: true }]);
  assert.equal(events.at(-1), 'render');
  stop();
  assert.equal(poster.hidden, false);
  assert.equal(events.filter(event => event === 'canvas-remove').length, 1);
  for (const expected of ['geometry-dispose', 'material-dispose', 'renderer-dispose', 'controls-dispose', 'canvas-remove', 'intersection-disconnect', 'resize-disconnect']) assert.ok(events.includes(expected), expected);
});
