// Builds n8n/inbox-assistant.json (the file people import into n8n) from:
//   prompts/system.md, prompts/schema.json, business-profile.md, n8n/src/*.js
// Run after editing any of them:  node scripts/build-workflow.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const code = (name) => read(`n8n/src/${name}.js`);
const tpl = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

// The business profile goes in without its instructions header.
const profile = read('business-profile.md').split('\n').filter((l, i) => !(i < 5 && (l.startsWith('# ') || l.startsWith('Fill this') || l.startsWith('Anything not') || l.startsWith('Paste the')))).join('\n').trim();
const schema = JSON.parse(read('prompts/schema.json'));

const settingsCode = `// ── Settings: edit these values, then save ───────────────────────────────
// API keys are NOT here: they live in n8n credentials (see docs/setup.md).
const SETTINGS = {
  agentmail_inbox_id: 'PASTE_YOUR_INBOX_ID',        // from: npm run setup
  agentmail_inbox_email: 'PASTE_YOUR_INBOX_EMAIL',  // e.g. assistant@agentmail.to
  telegram_chat_id: 'PASTE_YOUR_CHAT_ID',           // from: npm run telegram-chat-id
  grok_model: 'grok-4.3',                           // or 'grok-4.7' for the flagship
  skip_reply_for: ['newsletter', 'invoice'],        // categories that never get a draft
  agentmail_base: 'https://api.agentmail.to/v0',
  xai_base: 'https://api.x.ai/v1',
};

// Your business profile: facts, tone and rules for replies (business-profile.md).
const BUSINESS_PROFILE = \`${tpl(profile)}\`;

// ── Leave the rest unless you know why ──────────────────────────────────────
const SYSTEM_PROMPT = \`${tpl(read('prompts/system.md').trim())}\`;
const SCHEMA = ${JSON.stringify(schema, null, 2)};

return [{ json: { ...SETTINGS, business_profile: BUSINESS_PROFILE, system_prompt: SYSTEM_PROMPT, schema: SCHEMA } }];
`;

const approvalSettingsCode = `// ── Settings for approvals: keep these the same as the Settings node above ──
return [{ json: {
  agentmail_inbox_id: 'PASTE_YOUR_INBOX_ID',
  telegram_chat_id: 'PASTE_YOUR_CHAT_ID',
  agentmail_base: 'https://api.agentmail.to/v0',
} }];
`;

const cred = {
  agentmail: { httpHeaderAuth: { id: 'agentmail-key', name: 'AgentMail API key' } },
  xai: { httpHeaderAuth: { id: 'xai-key', name: 'xAI API key' } },
  hook: { httpHeaderAuth: { id: 'agentmail-webhook-key', name: 'AgentMail webhook key' } },
  telegram: { telegramApi: { id: 'telegram-bot', name: 'Telegram bot' } },
};

const codeNode = (name, js, pos, extra = {}) => ({
  parameters: { jsCode: js, ...extra },
  name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos,
});

const http = (name, pos, { method, url, credential, body, timeout = 30000 }) => ({
  parameters: {
    method,
    url,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    ...(body ? { sendBody: true, specifyBody: 'json', jsonBody: body } : {}),
    options: { timeout },
  },
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
  credentials: credential, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
});

const ifNode = (name, left, pos) => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [{ id: `${name}-c1`, leftValue: left, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and',
    },
    options: {},
  },
  name, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos,
});

const telegram = (name, pos, params) => ({
  parameters: params, name, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: pos,
  credentials: cred.telegram, webhookId: undefined,
});

const S = '$(\'Settings\').first().json';
const SA = '$(\'Settings (approval)\').first().json';

const nodes = [
  // ── Flow 1: new email → triage → draft → Telegram ──
  {
    parameters: { httpMethod: 'POST', path: 'agentmail-inbox', authentication: 'headerAuth', options: {} },
    name: 'AgentMail: new email', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
    webhookId: '5b1d2c4e-6a1f-4c2b-9b3e-1a2b3c4d5e6f', credentials: cred.hook,
  },
  codeNode('Settings', settingsCode, [220, 0]),
  codeNode('Prepare email', code('prepare'), [440, 0]),
  http('AgentMail: get message', [660, 0], {
    method: 'GET', credential: cred.agentmail,
    url: `={{ ${S}.agentmail_base }}/inboxes/{{ encodeURIComponent($json.inbox_id) }}/messages/{{ encodeURIComponent($json.message_id) }}`,
  }),
  codeNode('Build Grok request', code('grok-request'), [880, 0]),
  http('Grok: triage and draft', [1100, 0], {
    method: 'POST', credential: cred.xai, timeout: 120000,
    url: `={{ ${S}.xai_base }}/responses`, body: '={{ JSON.stringify($json.grok_request) }}',
  }),
  codeNode('Read Grok answer', code('read-answer'), [1320, 0]),
  ifNode('Draft a reply?', '={{ $json.create_draft }}', [1540, 0]),
  http('AgentMail: save draft', [1760, -120], {
    method: 'POST', credential: cred.agentmail,
    url: `={{ ${S}.agentmail_base }}/inboxes/{{ encodeURIComponent($('Prepare email').first().json.inbox_id) }}/drafts`,
    body: '={{ JSON.stringify($json.draft_request) }}',
  }),
  codeNode('Format message', code('notify'), [1980, 0]),
  ifNode('Has a draft?', '={{ $json.has_draft }}', [2200, 0]),
  telegram('Telegram: notify with buttons', [2420, -120], {
    chatId: `={{ ${S}.telegram_chat_id }}`,
    text: '={{ $json.text }}',
    replyMarkup: 'inlineKeyboard',
    inlineKeyboard: {
      rows: [{ row: { buttons: [
        { text: '✅ Send reply', additionalFields: { callback_data: '=send:{{ $json.draft_id }}' } },
        { text: '🗑 Discard', additionalFields: { callback_data: '=discard:{{ $json.draft_id }}' } },
      ] } }],
    },
    additionalFields: { parse_mode: 'HTML', appendAttribution: false },
  }),
  telegram('Telegram: notify', [2420, 120], {
    chatId: `={{ ${S}.telegram_chat_id }}`,
    text: '={{ $json.text }}',
    additionalFields: { parse_mode: 'HTML', appendAttribution: false },
  }),

  // ── Flow 2: button pressed → send or discard the draft ──
  {
    parameters: { updates: ['callback_query'], additionalFields: {} },
    name: 'Telegram: button pressed', type: 'n8n-nodes-base.telegramTrigger', typeVersion: 1.2, position: [0, 480],
    webhookId: '8c3e7f10-2d4b-4e8a-a1c9-6f5e4d3c2b1a', credentials: cred.telegram,
  },
  codeNode('Settings (approval)', approvalSettingsCode, [220, 480]),
  codeNode('Read button', code('button'), [440, 480]),
  {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ id: 'send-c1', leftValue: '={{ $json.action }}', rightValue: 'send', operator: { type: 'string', operation: 'equals' } }],
        combinator: 'and',
      },
      options: {},
    },
    name: 'Send it?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [660, 480],
  },
  http('AgentMail: send draft', [880, 380], {
    method: 'POST', credential: cred.agentmail,
    url: `={{ ${SA}.agentmail_base }}/inboxes/{{ encodeURIComponent($json.inbox_id) }}/drafts/{{ encodeURIComponent($json.draft_id) }}/send`,
    body: '={{ JSON.stringify({}) }}',
  }),
  http('AgentMail: delete draft', [880, 580], {
    method: 'DELETE', credential: cred.agentmail,
    url: `={{ ${SA}.agentmail_base }}/inboxes/{{ encodeURIComponent($json.inbox_id) }}/drafts/{{ encodeURIComponent($json.draft_id) }}`,
  }),
  codeNode('Result text', `// Text for the button reply and the updated Telegram message.
const b = $('Read button').first().json;
const sent = b.action === 'send';
return [{ json: { ...b, toast: sent ? 'Reply sent' : 'Draft discarded', footer: sent ? '✅ Reply sent from AgentMail.' : '🗑 Draft discarded.' } }];
`, [1100, 480]),
  telegram('Telegram: confirm button', [1320, 480], {
    resource: 'callback', operation: 'answerQuery', queryId: '={{ $json.query_id }}', additionalFields: { text: '={{ $json.toast }}' },
  }),
  telegram('Telegram: update message', [1540, 480], {
    operation: 'editMessageText', messageType: 'message',
    chatId: `={{ $('Result text').first().json.chat_id }}`,
    messageId: `={{ $('Result text').first().json.message_id }}`,
    text: `={{ $('Result text').first().json.original_text + '\\n\\n' + $('Result text').first().json.footer }}`,
    additionalFields: {},
  }),
];

const link = (from, to, output = 0) => [from, output, to];
const links = [
  link('AgentMail: new email', 'Settings'),
  link('Settings', 'Prepare email'),
  link('Prepare email', 'AgentMail: get message'),
  link('AgentMail: get message', 'Build Grok request'),
  link('Build Grok request', 'Grok: triage and draft'),
  link('Grok: triage and draft', 'Read Grok answer'),
  link('Read Grok answer', 'Draft a reply?'),
  link('Draft a reply?', 'AgentMail: save draft', 0),
  link('Draft a reply?', 'Format message', 1),
  link('AgentMail: save draft', 'Format message'),
  link('Format message', 'Has a draft?'),
  link('Has a draft?', 'Telegram: notify with buttons', 0),
  link('Has a draft?', 'Telegram: notify', 1),
  link('Telegram: button pressed', 'Settings (approval)'),
  link('Settings (approval)', 'Read button'),
  link('Read button', 'Send it?'),
  link('Send it?', 'AgentMail: send draft', 0),
  link('Send it?', 'AgentMail: delete draft', 1),
  link('AgentMail: send draft', 'Result text'),
  link('AgentMail: delete draft', 'Result text'),
  link('Result text', 'Telegram: confirm button'),
  link('Telegram: confirm button', 'Telegram: update message'),
];
const connections = {};
for (const [from, output, to] of links) {
  connections[from] ??= { main: [] };
  while (connections[from].main.length <= output) connections[from].main.push([]);
  connections[from].main[output].push({ node: to, type: 'main', index: 0 });
}

for (const n of nodes) {
  n.id ??= n.webhookId && n.type.includes('rigger') ? n.webhookId : cryptoId(n.name);
  if (n.webhookId === undefined) delete n.webhookId;
}
function cryptoId(s) {
  let h = 0;
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  const hex = (Math.abs(h).toString(16) + '0000000000000000').slice(0, 12);
  return `00000000-0000-4000-8000-${hex}`;
}

const workflow = {
  name: 'Grok Inbox Assistant (AgentMail + Grok API + Telegram)',
  nodes,
  connections,
  settings: { executionOrder: 'v1' },
  pinData: {},
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};
writeFileSync(new URL('n8n/inbox-assistant.json', root), JSON.stringify(workflow, null, 2) + '\n');
console.log(`n8n/inbox-assistant.json: ${nodes.length} nodes`);
