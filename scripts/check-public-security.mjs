// Read-only smoke check. Run after the Git-triggered build, as well as manual releases.
import assert from 'node:assert/strict';

const origin = 'https://basecraftas.com';
const checks = [
  ['/', 200],
  ['/projects/totonoe/', 200],
  ['/privacy-policy', 200],
  ['/projects/totonoe/privacy', 200],
  ['/apps/tsuzuri-studio-api/src/worker.js', 404],
  ['/apps/%74suzuri-studio-api/src/worker.js', 404],
  ['/apps/tsuzuri-studio-api/schema.sql', 404],
  ['/apps/tsuzuri-studio-api/wrangler.toml', 404],
  ['/scripts/build-site.mjs', 404],
  ['/package.json', 404],
  ['/projects/totonoe/TOTONOE_BUSINESS_OVERVIEW.md', 404],
  ['/projects/totonoe/TAYORI/', 302, 'member'],
  ['/projects/totonoe/TAYORI/index', 302, 'member'],
  ['/projects/totonoe/%54AYORI/index.html', 302, 'member'],
  ['/projects/totonoe/IROHA/dashboard', 302, 'member'],
  ['/projects/totonoe/IROHA/lesson.html', 302, 'member'],
  ['/projects/totonoe/IROHA/mypage', 302, 'member'],
  ['/apps/tsuzuri-studio/', 302, 'access'],
  ['/apps/column-studio/', 302, 'access'],
  ['/api/totonoe-member/api/customer/profile', 401, 'api'],
  ['/api/totonoe-member/api/weekly/materials', 401, 'api'],
];
let failures = 0;
for (const [path, status, kind] of checks) {
  try {
    const response = await fetch(origin + path, {redirect:'manual', signal:AbortSignal.timeout(12000)});
    await response.body?.cancel();
    assert.equal(response.status, status);
    if (kind === 'member') {
      assert.match(response.headers.get('location') || '', /\/TAYORI\/login\.html\?return=/);
      assert.match(response.headers.get('cache-control') || '', /private, no-store/);
    } else if (kind === 'access') {
      assert.equal(new URL(response.headers.get('location')).hostname, 'royal-bird-2fb2.cloudflareaccess.com');
    } else if (kind === 'api') {
      assert.match(response.headers.get('cache-control') || '', /no-store/);
    }
    if (!['access','api'].includes(kind)) {
      assert.equal(response.headers.get('x-basecraftas-release'), '20260922-security');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
    console.log(`PASS ${status} ${path}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${path}: ${error.message}`);
  }
}
console.log(`${checks.length - failures}/${checks.length} public security checks passed`);
if (failures) process.exitCode = 1;
