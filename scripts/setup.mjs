// One-time AgentMail setup: creates the assistant's inbox and points its
// "new email" webhook at your n8n workflow. Safe to run again (idempotent).
//
//   AGENTMAIL_API_KEY=am_...  N8N_WEBHOOK_URL=https://your-n8n/webhook/agentmail-inbox  npm run setup
//
// Optional: INBOX_USERNAME=hello (address becomes hello@agentmail.to if free), --tester (also makes a
// second inbox for sending the sample emails).
import { createHash, randomBytes } from 'node:crypto';

const BASE = process.env.AGENTMAIL_BASE || 'https://api.agentmail.to/v0';
const KEY = process.env.AGENTMAIL_API_KEY;
const HOOK = process.env.N8N_WEBHOOK_URL;
if (!KEY || !HOOK) {
  console.error('Set AGENTMAIL_API_KEY and N8N_WEBHOOK_URL first (see docs/setup.md).');
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

const inbox = await call('POST', '/inboxes', {
  ...(process.env.INBOX_USERNAME ? { username: process.env.INBOX_USERNAME } : {}),
  display_name: process.env.INBOX_DISPLAY_NAME || 'Inbox Assistant',
  client_id: 'grok-inbox-assistant',
});

const webhookKey = process.env.WEBHOOK_KEY || randomBytes(24).toString('base64url');
const hook = await call('POST', `/inboxes/${encodeURIComponent(inbox.inbox_id)}/webhooks`, {
  url: HOOK,
  event_types: ['message.received'],
  headers: { 'X-Inbox-Assistant-Key': webhookKey },
  // One webhook per key: re-running with a new key adds a webhook that n8n accepts; the old one is rejected.
  client_id: `grok-inbox-assistant-webhook-${createHash('sha256').update(webhookKey).digest('hex').slice(0, 10)}`,
});

let tester = null;
if (process.argv.includes('--tester')) {
  tester = await call('POST', '/inboxes', { display_name: 'Sample sender', client_id: 'grok-inbox-assistant-tester' });
}

console.log(`
AgentMail is ready.

  Assistant inbox     ${inbox.email}
  inbox_id            ${inbox.inbox_id}
  Webhook             ${hook.url}  (${hook.event_types.join(', ')})
${tester ? `  Sample sender       ${tester.email}  (TESTER_INBOX_ID=${tester.inbox_id})\n` : ''}
Next, in n8n:
  1. Credential "AgentMail webhook key" (Header Auth)
       Name:  X-Inbox-Assistant-Key
       Value: ${webhookKey}
  2. Settings node: agentmail_inbox_id = '${inbox.inbox_id}', agentmail_inbox_email = '${inbox.email}'
     Settings (approval) node: agentmail_inbox_id = '${inbox.inbox_id}'

Keep the webhook key private. Running setup again reuses the same inbox. To keep the same key, pass WEBHOOK_KEY;
otherwise a new key and webhook are made (delete the old webhook in the AgentMail console).
`);
