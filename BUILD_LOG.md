# Build log

How this starter was built on 21–22 October 2026, what it was built with, and why.

## The brief

A "GrokBot Inbox Assistant" starter: new email → summarise → next action → draft a reply → ask for approval, packaged as a GitHub template with an importable n8n workflow, copy-and-paste Grok instructions, a business profile template, sample emails and a setup guide. With one rule from the start: label integrations precisely. A workflow that calls the Grok API is not Grok Bot.

## Research and decisions

1. **Grok Bot vs the Grok API.** xAI's docs describe Grok Bot as a hosted agent you set up by messaging it ("setup is a message, not a workflow builder"), with its own connectors and approvals. There's no documented way for n8n to trigger it. So the n8n track calls the **Grok API**, and Grok Bot gets its own pack.
2. **AgentMail.** Checked against its docs: an inbox per agent by API, `message.received` webhooks (at-least-once, Svix-signed, custom headers allowed), drafts for human approval, and an official Grok Bot plugin. It doesn't sign in to Gmail, so Gmail users forward mail to it. Chosen as the main track's inbox on request.
3. **Grok API.** The Responses API (`POST /v1/responses`) is xAI's preferred interface; structured output via `text.format` with a strict JSON schema; `store: false` so conversations aren't kept. Default model `grok-4.3` ($1.25 / $2.50 per million tokens), `grok-4.7` as the flagship option.
4. **Approval in Telegram** with inline buttons. Telegram callback data is limited to 64 bytes, so a button carries only `send:<draft_id>`; the inbox id lives in the workflow's settings.
5. **Webhook security.** Svix signature checking needs raw-body crypto in a Code node, which many n8n installs block. Instead AgentMail sends a secret custom header on each delivery (set when the webhook is created), and the n8n Webhook node checks it with Header Auth.
6. **Only core n8n nodes** (Webhook, Code, HTTP Request, If, Telegram), so nothing extra to install. The Code nodes' JavaScript lives in `n8n/src/` and `scripts/build-workflow.mjs` assembles the importable JSON with the prompt, schema and business profile.
7. **Grok Bot pack** written to xAI's documented behaviour: routines at least 5 minutes apart, approvals from routines expire after about 10 minutes, so the routine only drafts and you send from the chat.

## Built with

| Piece | Role |
|---|---|
| [n8n](https://github.com/n8n-io/n8n) 2.44.5 | Workflow engine (listed in the [RepoQuarry catalogue](https://repoquarry.dev/projects/n8n); fair-code licence, free for internal business use) |
| [AgentMail](https://agentmail.to) | The assistant's inbox, webhooks and drafts (hosted; SDKs and MCP server are MIT) |
| [xAI Grok API](https://docs.x.ai) | Classification, summary, next action and reply draft |
| Telegram Bot API | Notifications and Send/Discard buttons |
| Grok Bot + AgentMail plugin | The alternative, fully hosted track |
| Playwright | Screenshots of the n8n editor and renderings of the Telegram output |
| Node.js 20+ | Setup, sample, build and test scripts; no dependencies at runtime |

## Testing

- **Unit (18 checks, `npm test`)**: the workflow file matches its sources; connections are valid; no keys in the file; each Code node's logic on sample data (parsing both `from` formats the docs show, dedupe, HTML fallback, strict schema, draft rules, HTML escaping, owner-only buttons).
- **End to end (31 checks, `npm run test:n8n`)**: a throwaway n8n 2.44.5 imports test credentials and the workflow, publishes it, and runs against stand-in AgentMail, Grok and Telegram services (`tests/mock-services.mjs`). All seven sample emails, a wrong key, a duplicate delivery and an outgoing-mail event go in; drafts, Telegram messages, buttons, send and discard are checked. Passed first time once the test's own port clash was fixed (n8n's internal task broker uses 5679).
- **Not tested here**: real AgentMail, xAI and Telegram accounts (no keys were used), and the Grok Bot pack (needs a Grok Bot plan). The stand-ins follow the documented request and response shapes.

## Things found on the way

- npm 11 skips install scripts by default; n8n needs `sqlite3` and `isolated-vm` built. Approved just those (`npm install-scripts approve …` then `npm rebuild`). CI installs normally.
- n8n's editor comes up a little after `/healthz` answers; the screenshot script waits for "Editor is now accessible".
- AgentMail's docs show the sender as `from` (a string) on one page and `from_` (an array) on another; the workflow accepts both.
- Re-running setup with a new webhook key must create a new webhook (idempotent create would otherwise keep the old header); the client id now includes a fingerprint of the key.
