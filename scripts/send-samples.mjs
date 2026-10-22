// Sends the sample emails (samples/emails.json) into your assistant inbox, so you can
// watch the whole flow: Telegram notification, draft, approve.
//
//   AGENTMAIL_API_KEY=am_...  TESTER_INBOX_ID=...  ASSISTANT_EMAIL=you@agentmail.to  npm run samples
//   (add an id to send just one:  npm run samples -- lead)
//
// Mail arrives from your tester inbox, so the assistant sees that address as the sender;
// the sample's original "from" is added to the first line of the body for context.
import { readFileSync } from 'node:fs';

const BASE = process.env.AGENTMAIL_BASE || 'https://api.agentmail.to/v0';
const { AGENTMAIL_API_KEY: KEY, TESTER_INBOX_ID: FROM, ASSISTANT_EMAIL: TO } = process.env;
if (!KEY || !FROM || !TO) {
  console.error('Set AGENTMAIL_API_KEY, TESTER_INBOX_ID and ASSISTANT_EMAIL (npm run setup -- --tester prints the tester id).');
  process.exit(1);
}
const only = process.argv[2];
const samples = JSON.parse(readFileSync(new URL('../samples/emails.json', import.meta.url), 'utf8')).filter((s) => !only || s.id === only);

for (const s of samples) {
  const res = await fetch(`${BASE}/inboxes/${encodeURIComponent(FROM)}/messages/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ to: [TO], subject: s.subject, text: `(Sample from ${s.from})\n\n${s.text}` }),
  });
  console.log(`${res.ok ? 'sent' : `failed ${res.status}`}  ${s.id.padEnd(14)} ${s.subject}`);
  await new Promise((r) => setTimeout(r, 3000));
}
