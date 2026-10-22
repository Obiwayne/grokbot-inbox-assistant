// End-to-end test in a real n8n, against stand-in AgentMail, Grok API and Telegram.
//
//   N8N_BIN=/path/to/node_modules/n8n/bin/n8n  npm run test:n8n
//
// Starts a throwaway n8n (its own folder and SQLite database), imports test credentials and
// the workflow, publishes it, sends every sample email to the webhook, presses the Telegram
// buttons, and checks what reached the stand-in services. Nothing touches real accounts.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = process.env.N8N_BIN;
if (!BIN) {
  console.error('Set N8N_BIN to n8n/bin/n8n from an n8n install (npm i n8n in any folder).');
  process.exit(1);
}
const MOCK_PORT = 9911;
const N8N_PORT = 5690; // not 5679: that is n8n's internal task broker
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const N8N = `http://127.0.0.1:${N8N_PORT}`;
const HOOK_KEY = 'test-hook-key';
const CHAT = '424242';
const home = mkdtempSync(join(tmpdir(), 'n8n-e2e-'));
const env = {
  ...process.env,
  N8N_USER_FOLDER: home,
  N8N_PORT: String(N8N_PORT),
  N8N_LISTEN_ADDRESS: '127.0.0.1',
  WEBHOOK_URL: `${N8N}/`,
  N8N_ENCRYPTION_KEY: 'e2e-test-encryption-key-not-secret',
  N8N_DIAGNOSTICS_ENABLED: 'false',
  N8N_PERSONALIZATION_ENABLED: 'false',
  N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
  N8N_SECURE_COOKIE: 'false',
  DB_SQLITE_POOL_SIZE: '2',
};

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const n8n = (...args) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`n8n ${args[0]} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};

// ---- test copy of the workflow: point Settings at the stand-ins ----
const wf = JSON.parse(readFileSync(new URL('../n8n/inbox-assistant.json', import.meta.url), 'utf8'));
wf.id = 'grokInboxE2E0001';
for (const n of wf.nodes) {
  if (n.name.startsWith('Settings')) {
    n.parameters.jsCode = n.parameters.jsCode
      .replace(/'PASTE_YOUR_INBOX_ID'/g, "'inbox_test'")
      .replace(/'PASTE_YOUR_INBOX_EMAIL'/g, "'assistant@agentmail.to'")
      .replace(/'PASTE_YOUR_CHAT_ID'/g, `'${CHAT}'`)
      .replace(/https:\/\/api\.agentmail\.to\/v0/g, `${MOCK}/v0`)
      .replace(/https:\/\/api\.x\.ai\/v1/g, `${MOCK}/v1`);
  }
}
writeFileSync(join(home, 'workflow.json'), JSON.stringify(wf));
writeFileSync(join(home, 'credentials.json'), JSON.stringify([
  { id: 'agentmail-key', name: 'AgentMail API key', type: 'httpHeaderAuth', data: { name: 'Authorization', value: 'Bearer am_test' } },
  { id: 'xai-key', name: 'xAI API key', type: 'httpHeaderAuth', data: { name: 'Authorization', value: 'Bearer xai_test' } },
  { id: 'agentmail-webhook-key', name: 'AgentMail webhook key', type: 'httpHeaderAuth', data: { name: 'X-Inbox-Assistant-Key', value: HOOK_KEY } },
  { id: 'telegram-bot', name: 'Telegram bot', type: 'telegramApi', data: { accessToken: '123:test', baseUrl: MOCK } },
]));

const procs = [];
const stop = () => { for (const p of procs) try { p.kill(); } catch {} };
process.on('exit', () => { stop(); try { rmSync(home, { recursive: true, force: true }); } catch {} });

try {
  procs.push(spawn(process.execPath, [new URL('./mock-services.mjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), String(MOCK_PORT)], { stdio: 'ignore' }));

  console.log('importing into a fresh n8n…');
  n8n('import:credentials', `--input=${join(home, 'credentials.json')}`);
  n8n('import:workflow', `--input=${join(home, 'workflow.json')}`);
  n8n('publish:workflow', `--id=${wf.id}`);

  const server = spawn(process.execPath, [BIN, 'start'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(server);
  let out = '';
  server.stdout.on('data', (d) => (out += d));
  server.stderr.on('data', (d) => (out += d));
  for (let i = 0; i < 120; i++) {
    const ok = await fetch(`${N8N}/healthz`).then((r) => r.ok).catch(() => false);
    if (ok && /activated|Editor is now accessible/i.test(out)) break;
    await sleep(1000);
  }
  await sleep(3000);
  const log = () => fetch(`${MOCK}/_log`).then((r) => r.json());
  check((await log()).webhook?.url?.includes('/webhook'), 'Telegram trigger registered its webhook on publish');

  // ---- 1. incoming email ----
  const samples = JSON.parse(readFileSync(new URL('../samples/emails.json', import.meta.url), 'utf8'));
  const post = (body, key = HOOK_KEY) => fetch(`${N8N}/webhook/agentmail-inbox`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-Inbox-Assistant-Key': key }, body: JSON.stringify(body),
  });
  const event = (s) => ({
    type: 'event', event_type: 'message.received', event_id: `evt_${s.id}`,
    message: { inbox_id: 'inbox_test', thread_id: `thread-${s.id}`, message_id: `<${s.id}@test>`, from: s.from, to: ['assistant@agentmail.to'], subject: s.subject, preview: s.text.slice(0, 80) },
  });

  check((await post(event(samples[0]), 'wrong-key')).status === 403, 'webhook rejects a wrong key (403)');
  for (const s of samples) {
    const r = await post(event(s));
    check(r.ok, `webhook accepted "${s.id}" (${r.status})`);
  }
  await post(event(samples[0])); // duplicate delivery: must be ignored
  await post({ ...event(samples[1]), event_type: 'message.sent', event_id: 'evt_sent' }); // not an incoming email

  let L;
  for (let i = 0; i < 90; i++) {
    L = await log();
    if (L.telegram.filter((t) => t.method === 'sendMessage').length >= samples.length) break;
    await sleep(1000);
  }
  await sleep(4000);
  L = await log();
  const msgs = L.telegram.filter((t) => t.method === 'sendMessage');
  check(msgs.length === samples.length, `one Telegram message per email (${msgs.length}/${samples.length}; duplicate and sent events ignored)`);
  check(L.grok.length === samples.length, `Grok called once per email (${L.grok.length})`);
  check(L.grok.every((g) => g.model === 'grok-4.3' && g.store === false && g.text.format.strict === true), 'Grok requests use grok-4.3, store:false and a strict JSON schema');
  check(L.grok.every((g) => g.input[0].content.includes('Northside Ceramics') && !g.input[0].content.includes('{{BUSINESS_PROFILE}}')), 'business profile is in the prompt');
  check(L.requests.filter((r) => r.path.startsWith('/v0') || r.path.startsWith('/v1')).every((r) => r.auth.startsWith('Bearer ')), 'AgentMail and Grok calls carry the API key credentials');

  const drafts = Object.entries(L.drafts);
  const draftFor = (id) => drafts.find(([, d]) => d.in_reply_to === `<${id}@test>`);
  for (const id of ['enquiry', 'lead', 'urgent', 'missing-price']) check(Boolean(draftFor(id)), `reply draft saved for "${id}"`);
  for (const id of ['invoice', 'newsletter', 'phish']) check(!draftFor(id), `no draft for "${id}"`);
  check(draftFor('enquiry')?.[1].to?.[0] === 'hannah.ellis@example.net', 'draft goes back to the sender');
  const withButtons = msgs.filter((m) => JSON.stringify(m.params.reply_markup || '').includes('send:'));
  check(withButtons.length === 4, `Send/Discard buttons only on drafted emails (${withButtons.length}/4)`);
  check(msgs.every((m) => m.params.parse_mode === 'HTML' && String(m.params.chat_id) === CHAT), 'messages go to the owner chat as HTML');
  check(msgs.some((m) => m.params.text.includes('Looks suspicious')), 'phishing email is flagged as suspicious');
  check(msgs.some((m) => m.params.text.includes('Fill in first')), 'missing facts are listed for the owner');

  // ---- 2. Telegram buttons ----
  const secret = L.webhook.secret_token;
  const press = (data, chat = CHAT, id = 'cb1') => fetch(L.webhook.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) },
    body: JSON.stringify({ update_id: Date.now(), callback_query: { id, from: { id: Number(chat) }, data, message: { message_id: 77, chat: { id: Number(chat) }, text: 'Lead — Plates for our new restaurant' } } }),
  });
  const [leadDraft] = draftFor('lead');
  const [enquiryDraft] = draftFor('enquiry');
  await press(`send:${leadDraft}`);
  await press(`discard:${enquiryDraft}`, CHAT, 'cb2');
  await press(`send:${enquiryDraft}`, '999', 'cb3'); // someone else's chat: ignored
  await sleep(6000);
  L = await log();
  check(L.sent.includes(leadDraft), 'Send button sends the draft through AgentMail');
  check(L.deleted.includes(enquiryDraft), 'Discard button deletes the draft');
  check(!L.sent.includes(enquiryDraft), 'buttons from another chat are ignored');
  check(L.telegram.filter((t) => t.method === 'answerCallbackQuery').length === 2, 'each press is acknowledged in Telegram');
  check(L.telegram.some((t) => t.method === 'editMessageText' && String(t.params.text).includes('Reply sent')), 'message updates to "Reply sent"');

  if (process.env.E2E_LOG) writeFileSync(process.env.E2E_LOG, JSON.stringify(L, null, 1));
  if (failures) console.log(`\n--- n8n output (tail) ---\n${out.split('\n').slice(-40).join('\n')}`);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  stop();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll end-to-end checks passed.');
process.exit(failures ? 1 : 0);
