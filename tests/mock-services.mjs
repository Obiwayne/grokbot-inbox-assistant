// Stand-ins for AgentMail, the xAI Grok API and the Telegram Bot API, so the
// workflow can run end to end in n8n without any real account or key.
//   node tests/mock-services.mjs [port]   (default 9911)
// Everything it receives is kept in memory and readable at GET /_log.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = Number(process.argv[2] || 9911);
const samples = JSON.parse(readFileSync(new URL('../samples/emails.json', import.meta.url), 'utf8'));
const log = { requests: [], drafts: {}, sent: [], deleted: [], telegram: [], grok: [], webhook: null };
let n = 0;

// Deterministic "model": answers each sample the way a good model should.
function triage(subject) {
  const s = samples.find((x) => x.subject === subject) || { id: 'other', expect: 'other' };
  const base = { urgency: 'normal', missing: [], suspicious: false, reply_subject: '', reply_body: '', needs_reply: true };
  switch (s.id) {
    case 'enquiry': return { ...base, category: 'customer_enquiry', summary: 'Hannah wants four mugs as a gift and asks if they are dishwasher safe and the shipping cost to Manchester.', next_action: 'Confirm dishwasher safe and UK shipping.', reply_body: 'Hi Hannah,\n\nYes, all our mugs are dishwasher safe. Four mugs are £96, so UK shipping is free over £80.\n\nThanks, Priya — Northside Ceramics' };
    case 'lead': return { ...base, category: 'lead', urgency: 'high', summary: 'The Green Fork in Leeds wants 60 dinner and 60 side plates in matte glaze for a February opening.', next_action: 'Reply with custom-order terms and two start dates.', reply_body: 'Hi Marcus,\n\nCustom orders start from £300, take 6–8 weeks and need a 50% deposit. [[ASK: price for 120 plates in matte glaze]].\n\nThanks, Priya — Northside Ceramics', missing: ['price for 120 plates in matte glaze'] };
    case 'invoice': return { ...base, category: 'invoice', needs_reply: false, summary: 'Clay Supplies invoice INV-20419 for £412.80 is due 31 October 2026.', next_action: 'Pay £412.80 by 31 October.' };
    case 'newsletter': return { ...base, category: 'newsletter', urgency: 'low', needs_reply: false, summary: 'Weekly craft fair round-up.', next_action: 'Ignore.' };
    case 'urgent': return { ...base, category: 'urgent', urgency: 'high', summary: 'Sofia’s serving bowl arrived broken and the wedding gift is for tomorrow.', next_action: 'Arrange a replacement today.', reply_body: 'Hi Sofia,\n\nI’m sorry the bowl arrived broken. Thank you for the photo; we’ll replace it and I’ll confirm today how we can get it to you in time.\n\nThanks, Priya — Northside Ceramics' };
    case 'missing-price': return { ...base, category: 'customer_enquiry', summary: 'Tom asks about shipping to Toronto and a teapot.', next_action: 'Explain we only ship within Europe.', reply_body: 'Hi Tom,\n\nSorry, we only ship within the UK and Europe. [[ASK: teapot availability]]\n\nThanks, Priya — Northside Ceramics', missing: ['teapot availability'] };
    case 'phish': return { ...base, category: 'urgent', urgency: 'high', suspicious: true, needs_reply: false, summary: 'Someone posing as Priya asks to send customers new bank details. Likely fraud; not followed.', next_action: 'Do not act. Check with Priya directly.' };
    default: return { ...base, category: 'other', needs_reply: false, summary: 'Unknown.', next_action: 'Read it.' };
  }
}

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const body = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(url.pathname);
  log.requests.push({ method: req.method, path: p, auth: req.headers.authorization || '' });

  if (p === '/_log') return json(res, 200, log);
  if (p === '/_reset') { Object.assign(log, { requests: [], drafts: {}, sent: [], deleted: [], telegram: [], grok: [] }); return json(res, 200, {}); }

  // ── AgentMail (/v0/...) ──
  let m;
  if ((m = p.match(/^\/v0\/inboxes\/([^/]+)\/messages\/(.+)$/)) && req.method === 'GET') {
    const id = m[2].replace(/^<|@test>$|>$/g, '');
    const s = samples.find((x) => x.id === id.replace(/@test$/, ''));
    if (!s) return json(res, 404, { name: 'NotFoundError', message: 'message not found' });
    return json(res, 200, { inbox_id: m[1], message_id: m[2], thread_id: `thread-${s.id}`, from: s.from, to: ['assistant@agentmail.to'], subject: s.subject, text: s.text, extracted_text: s.text, labels: ['received'] });
  }
  if ((m = p.match(/^\/v0\/inboxes\/([^/]+)\/drafts$/)) && req.method === 'POST') {
    const draft_id = `draft_${++n}`;
    log.drafts[draft_id] = { inbox_id: m[1], ...body };
    return json(res, 200, { inbox_id: m[1], draft_id, ...body, labels: ['draft'] });
  }
  if ((m = p.match(/^\/v0\/inboxes\/([^/]+)\/drafts\/([^/]+)\/send$/)) && req.method === 'POST') {
    if (!log.drafts[m[2]]) return json(res, 404, { name: 'NotFoundError' });
    log.sent.push(m[2]);
    return json(res, 200, { message_id: `<sent-${m[2]}@agentmail.to>`, thread_id: 'thread' });
  }
  if ((m = p.match(/^\/v0\/inboxes\/([^/]+)\/drafts\/([^/]+)$/)) && req.method === 'DELETE') {
    log.deleted.push(m[2]);
    res.writeHead(204); return res.end();
  }

  // ── xAI Responses API ──
  if (p === '/v1/responses' && req.method === 'POST') {
    log.grok.push(body);
    const fmt = body?.text?.format;
    if (!fmt || fmt.type !== 'json_schema' || fmt.strict !== true || !fmt.schema) return json(res, 400, { error: 'expected strict json_schema text.format' });
    const user = body.input.find((i) => i.role === 'user').content;
    const subject = (user.match(/^Subject: (.*)$/m) || [])[1];
    return json(res, 200, { id: `resp_${++n}`, object: 'response', model: body.model, output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(triage(subject)) }] }] });
  }

  // ── Telegram Bot API (/bot<token>/<method>) ──
  if ((m = p.match(/^\/bot([^/]+)\/(\w+)$/))) {
    const method = m[2];
    const params = body && typeof body === 'object' ? body : Object.fromEntries(url.searchParams);
    log.telegram.push({ method, params });
    if (method === 'setWebhook') log.webhook = params;
    if (method === 'getMe') return json(res, 200, { ok: true, result: { id: 1, is_bot: true, username: 'inbox_test_bot' } });
    if (method === 'sendMessage') return json(res, 200, { ok: true, result: { message_id: log.telegram.length, chat: { id: Number(params.chat_id) }, text: params.text } });
    return json(res, 200, { ok: true, result: true });
  }

  json(res, 404, { error: `no mock for ${req.method} ${p}` });
}).listen(PORT, () => console.log(`mock services on http://127.0.0.1:${PORT}`));
