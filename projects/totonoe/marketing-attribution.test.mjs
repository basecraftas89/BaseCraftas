import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./marketing-attribution.js', import.meta.url), 'utf8');

function setup({ hostname = 'basecraftas.com', pathname = '/projects/totonoe/tayori.html', existingTag = false } = {}) {
  const calls = [], listeners = {}, scripts = [];
  const document = {
    head: { appendChild: (script) => scripts.push(script) },
    createElement: () => ({}),
    addEventListener: (type, listener) => { listeners[type] = listener; },
  };
  const window = {
    location: { hostname, pathname, href: `https://${hostname}${pathname}` },
    ...(existingTag ? { gtag: (...args) => calls.push(args) } : {}),
  };
  runInNewContext(source, { window, document, URL, Date });
  return { window, calls, listeners, scripts };
}

test('loads GA4 once on a public page without an inline tag', () => {
  const state = setup();
  assert.equal(state.scripts.length, 1);
  assert.match(state.scripts[0].src, /G-1SK6NEFC8V/);
  assert.equal(state.window.dataLayer.length, 2);
  runInNewContext(source, { window: state.window, document: { head: { appendChild: () => assert.fail('duplicate tag') } }, URL, Date });
});

test('records the CTA and successful TAYORI waitlist separately, without personal data', () => {
  const state = setup({ existingTag: true });
  const link = { href: 'https://basecraftas.com/projects/totonoe/tayori.html', closest: () => null };
  state.listeners.click({ target: { closest: () => link } });
  state.window.ToToNoEMarketing.trackWaitlistSuccess('tayori_personal');
  state.window.ToToNoEMarketing.trackWaitlistSuccess('other');
  assert.deepEqual(state.calls.map((call) => call[1]), ['tayori_cta_click', 'tayori_waitlist_signup']);
  assert.equal(state.scripts.length, 0);
  assert.ok(!JSON.stringify(state.calls).includes('@'));
});

test('does not initialize tracking on private TAYORI pages or unrelated hosts', () => {
  for (const options of [{ pathname: '/projects/totonoe/TAYORI/login.html' }, { hostname: 'example.com' }]) {
    const state = setup(options);
    assert.equal(state.scripts.length, 0);
    assert.equal(state.window.ToToNoEMarketing, undefined);
  }
});
