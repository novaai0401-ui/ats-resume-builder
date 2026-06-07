import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
// @ts-expect-error — wire jsdom globals before importing the hook module
globalThis.window = dom.window;
// @ts-expect-error
globalThis.document = dom.window.document;
// @ts-expect-error
globalThis.HTMLElement = dom.window.HTMLElement;

import { getTabbableElements } from '../src/lib/use-focus-trap';

function mount(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

test('getTabbableElements returns interactive descendants in DOM order', () => {
  const c = mount(`
    <a href="#x">a</a>
    <button>b</button>
    <input />
    <textarea></textarea>
    <select><option>x</option></select>
    <div tabindex="0">d</div>
  `);
  const els = getTabbableElements(c);
  const tags = els.map((e) => e.tagName.toLowerCase());
  assert.deepEqual(tags, ['a', 'button', 'input', 'textarea', 'select', 'div']);
});

test('getTabbableElements skips disabled controls', () => {
  const c = mount(`
    <button>ok</button>
    <button disabled>nope</button>
    <input disabled />
    <input />
  `);
  const els = getTabbableElements(c);
  assert.equal(els.length, 2);
  assert.equal(els[0].tagName.toLowerCase(), 'button');
  assert.equal(els[1].tagName.toLowerCase(), 'input');
});

test('getTabbableElements skips tabindex="-1"', () => {
  const c = mount(`<button>a</button><button tabindex="-1">b</button>`);
  const els = getTabbableElements(c);
  assert.equal(els.length, 1);
  assert.equal(els[0].textContent, 'a');
});

test('getTabbableElements skips hidden inputs', () => {
  const c = mount(`<input type="hidden" /><input type="text" />`);
  const els = getTabbableElements(c);
  assert.equal(els.length, 1);
  assert.equal((els[0] as HTMLInputElement).type, 'text');
});

test('getTabbableElements returns empty array for container with no interactive children', () => {
  const c = mount(`<p>hello</p><span>world</span>`);
  assert.deepEqual(getTabbableElements(c), []);
});
