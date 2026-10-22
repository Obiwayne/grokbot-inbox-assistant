// Fast checks without n8n: the generated workflow is in sync and well formed, and each
// Code node's JavaScript behaves on sample data. Run: npm test
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// 1. Workflow file matches its sources.
const before = read('n8n/inbox-assistant.json');
execFileSync(process.execPath, [new URL('scripts/build-workflow.mjs', root).pathname.replace(/^\/(\w:)/, '$1')]);
check(read('n8n/inbox-assistant.json') === before, 'n8n/inbox-assistant.json is up to date with prompts/, business-profile.md and n8n/src/ (run npm run build)');
const wf = JSON.parse(before);
const names = new Set(wf.nodes.map((n) => n.name));
check(Object.entries(wf.connections).every(([from, c]) => names.has(from) && c.main.flat().every((x) => names.has(x.node))), 'every connection points at a real node');
check(!/\bam_[A-Za-z0-9]{16,}/.test(before) && !/\bxai-[A-Za-z0-9]{20,}/.test(before) && !/\d{8,}:[A-Za-z0-9_-]{30,}/.test(before), 'no API keys or bot tokens in the workflow file');

// 2. Run Code nodes with a tiny stand-in for n8n's $ helpers.
const node = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
function run(name, nodes, input = {}, staticData = {}) {
  const $ = (n) => ({ first: () => ({ json: nodes[n] }) });
  const $input = { first: () => ({ json: input }) };
  return new Function('$', '$input', '$getWorkflowStaticData', node(name))($, $input, () => staticData);
}
const settings = run('Settings', {})[0].json;
check(settings.system_prompt.includes('{{BUSINESS_PROFILE}}') && settings.business_profile.includes('Northside Ceramics'), 'Settings carries the prompt template and the business profile');
check(settings.schema.required.includes('reply_body') && settings.grok_model === 'grok-4.3', 'Settings carries the schema and default model');

const ev = (over = {}) => ({ body: { event_type: 'message.received', event_id: 'e1', message: { inbox_id: 'i1', message_id: '<m1@x>', from: 'Jo Bloggs <Jo@Example.com>', subject: 'Hi', ...over } } });
const seen = {};
const p1 = run('Prepare email', { Settings: settings, 'AgentMail: new email': ev() }, {}, seen);
check(p1.length === 1 && p1[0].json.from_email === 'jo@example.com' && p1[0].json.from_name === 'Jo Bloggs', 'Prepare email parses "Name <email>"');
check(run('Prepare email', { Settings: settings, 'AgentMail: new email': ev() }, {}, seen).length === 0, 'Prepare email drops a duplicate event_id');
const arr = run('Prepare email', { Settings: settings, 'AgentMail: new email': { body: { event_type: 'message.received', event_id: 'e2', message: { message_id: '<m2@x>', from_: ['a@b.co'], subject: 'x' } } } }, {}, seen);
check(arr[0]?.json.from_email === 'a@b.co', 'Prepare email also accepts "from_" as an array');
check(run('Prepare email', { Settings: settings, 'AgentMail: new email': { body: { event_type: 'message.sent', message: {} } } }).length === 0, 'Prepare email ignores non-incoming events');

const email = p1[0].json;
const req = run('Build Grok request', { Settings: settings, 'Prepare email': email }, { html: '<p>Hello <b>there</b></p>' })[0].json.grok_request;
check(req.input[1].content.endsWith('Hello there') && req.text.format.strict === true && !req.input[0].content.includes('{{BUSINESS_PROFILE}}'), 'Build Grok request uses HTML when there is no text, fills the profile, asks for strict JSON');

const answer = (o) => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(o) }] }] });
const base = { category: 'customer_enquiry', urgency: 'normal', summary: 's', next_action: 'n', needs_reply: true, reply_subject: '', reply_body: 'Hello', missing: [], suspicious: false };
const r1 = run('Read Grok answer', { Settings: settings, 'Prepare email': email }, answer(base))[0].json;
check(r1.create_draft && r1.draft_request.in_reply_to === '<m1@x>' && r1.draft_request.subject === 'Re: Hi', 'Read Grok answer drafts a reply to the sender');
check(!run('Read Grok answer', { Settings: settings, 'Prepare email': email }, answer({ ...base, category: 'invoice' }))[0].json.create_draft, 'no draft for skipped categories');
check(!run('Read Grok answer', { Settings: settings, 'Prepare email': email }, answer({ ...base, suspicious: true }))[0].json.create_draft, 'no draft for suspicious mail');
check(run('Read Grok answer', { Settings: settings, 'Prepare email': email }, { output: [] })[0].json.category === 'other', 'unreadable model output falls back safely');

const msg = run('Format message', { 'Read Grok answer': { ...r1, summary: '<script>x</script> & co', email } }, { draft_id: 'd1' })[0].json;
check(msg.has_draft && msg.draft_id === 'd1' && msg.text.includes('&lt;script&gt;') && msg.text.includes('&amp; co'), 'Format message escapes HTML and carries the draft id');

const approval = run('Settings (approval)', {})[0].json;
const press = (data, chat) => run('Read button', { 'Settings (approval)': { ...approval, telegram_chat_id: '42' }, 'Telegram: button pressed': { callback_query: { id: 'q', data, message: { chat: { id: chat }, message_id: 1 } } } });
check(press('send:d1', 42)[0]?.json.action === 'send', 'Read button accepts the owner chat');
check(press('send:d1', 99).length === 0, 'Read button ignores other chats');
check(press('rm -rf:d1', 42).length === 0, 'Read button ignores unknown actions');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll unit checks passed.');
process.exit(failures ? 1 : 0);
