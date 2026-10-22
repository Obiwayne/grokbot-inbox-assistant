// Captures docs/screenshots/: the workflow in the n8n editor, and Telegram-style
// renderings of real notifications produced by the end-to-end test.
//   N8N_BIN=/path/to/n8n/bin/n8n  node scripts/screenshots.mjs
// Uses a throwaway local n8n with a throwaway owner login; nothing is published.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright-core';

const BIN = process.env.N8N_BIN;
const PORT = 5691;
const home = mkdtempSync(join(tmpdir(), 'n8n-shots-'));
const out = new URL('../docs/screenshots/', import.meta.url);
mkdirSync(out, { recursive: true });
const env = { ...process.env, N8N_USER_FOLDER: home, N8N_PORT: String(PORT), N8N_LISTEN_ADDRESS: '127.0.0.1', N8N_RUNNERS_BROKER_PORT: '5692', N8N_DIAGNOSTICS_ENABLED: 'false', N8N_PERSONALIZATION_ENABLED: 'false', N8N_SECURE_COOKIE: 'false', N8N_ENCRYPTION_KEY: 'shots' };

const wf = JSON.parse(readFileSync(new URL('../n8n/inbox-assistant.json', import.meta.url), 'utf8'));
wf.id = 'grokInboxShots01';
writeFileSync(join(home, 'wf.json'), JSON.stringify(wf));
spawnSync(process.execPath, [BIN, 'import:workflow', `--input=${join(home, 'wf.json')}`], { env });
const server = spawn(process.execPath, [BIN, 'start'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
const base = `http://127.0.0.1:${PORT}`;
// Health answers before the editor is mounted: wait for n8n to say the editor is ready.
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 180 && !/Editor is now accessible/.test(log); i++) await new Promise((r) => setTimeout(r, 1000));
await new Promise((r) => setTimeout(r, 2000));

const email = 'owner@example.test';
const password = `Aa1${randomBytes(9).toString('base64url')}`; // throwaway, never printed or stored
const setup = await fetch(`${base}/rest/owner/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, firstName: 'Demo', lastName: 'Owner' }) });
if (process.env.DEBUG) console.log('owner setup', setup.status, (await setup.text()).slice(0, 300));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
await page.goto(`${base}/signin`);
await page.waitForTimeout(4000);
if (process.env.DEBUG) { await page.screenshot({ path: join(home, 'signin.png') }); console.log('signin url', page.url(), join(home, 'signin.png')); console.log((await page.content()).match(/<input[^>]*>/g)?.slice(0, 5)); }
await page.fill('input[type=email], input[name=emailOrLdapLoginId], input[name=email]', email);
await page.fill('input[type=password]', password);
await page.keyboard.press('Enter');
await page.waitForTimeout(3000);
await page.goto(`${base}/workflow/${wf.id}`);
await page.waitForTimeout(5000);
for (const sel of ['button:has-text("Skip")', 'button:has-text("Got it")', '[data-test-id="close-button"]', 'button[aria-label="Close"]']) {
  const b = page.locator(sel).first();
  if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
}
await page.keyboard.press('Shift+1'); // zoom to fit
await page.waitForTimeout(1500);
await page.screenshot({ path: new URL('n8n-workflow.png', out).pathname.replace(/^\/(\w:)/, '$1') });
await browser.close();
server.kill();
console.log('docs/screenshots/n8n-workflow.png written');
process.exit(0);
