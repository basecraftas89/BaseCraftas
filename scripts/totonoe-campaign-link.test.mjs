import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { campaignLink, memberXLink, xMembers } from './totonoe-campaign-link.mjs';

test('X roster matches every X link on the current team page', () => {
  const html = readFileSync(new URL('../projects/totonoe/team.html', import.meta.url), 'utf8');
  const document = new JSDOM(html).window.document;
  const published = [...document.querySelectorAll('.team-member-card')].map((card) => ({
    name: card.querySelector('h3')?.textContent.trim(),
    account: card.querySelector('.member-sns a[href*="x.com/"]')?.href.split('?')[0],
  })).filter((person) => person.account);
  assert.equal(xMembers.length, 7);
  assert.deepEqual(xMembers.map(({ name, account }) => ({ name, account })), published);
  assert.throws(() => campaignLink({ member: 'kuroishi-ryota', source: 'x', placement: 'post', post: '20261002', destination: 'home' }));
});

test('issues a distinct tagged public URL for one SNS placement', () => {
  const url = new URL(campaignLink({ member: 'kojima-ken', source: 'x', placement: 'post', post: '20261002-tayori', destination: 'tayori' }));
  assert.equal(url.origin, 'https://basecraftas.com');
  assert.equal(url.pathname, '/projects/totonoe/tayori.html');
  assert.equal(url.searchParams.get('utm_medium'), 'organic_social');
  assert.equal(url.searchParams.get('utm_content'), 'kojima-ken_post_20261002-tayori');
});

test('issues one placement-neutral X link per published member', () => {
  const links = xMembers.map(({ id }) => new URL(memberXLink(id)));
  assert.equal(new Set(links.map((url) => url.href)).size, xMembers.length);
  for (const [index, url] of links.entries()) {
    assert.equal(url.pathname, '/projects/totonoe/');
    assert.equal(url.searchParams.get('utm_source'), 'x');
    assert.equal(url.searchParams.get('utm_content'), xMembers[index].id);
    assert.equal(url.searchParams.get('utm_content')?.includes('profile'), false);
  }
  assert.throws(() => memberXLink('kuroishi-ryota'));
});

test('keeps the seminar anchor and rejects arbitrary URLs or personal data in post IDs', () => {
  const url = new URL(campaignLink({ member: 'kuroishi-ryota', source: 'instagram', placement: 'bio', post: '20261002-seminar', destination: 'seminar' }));
  assert.equal(url.hash, '#seminars');
  assert.throws(() => campaignLink({ member: 'kojima-ken', source: 'x', placement: 'post', post: 'name@example.com', destination: 'tayori' }));
  assert.throws(() => campaignLink({ member: 'kojima-ken', source: 'x', placement: 'post', post: 'valid', destination: 'https://example.com' }));
});
