# How it works

```
 AgentMail inbox ──webhook (secret header)──► n8n: AgentMail: new email
                                               │ Settings ─ Prepare email (dedupe, ignore own mail)
                                               │ AgentMail: get message (full text, new part of the thread)
                                               │ Grok: triage and draft  ── POST api.x.ai/v1/responses, strict JSON schema, store:false
                                               │ Read Grok answer ─ Draft a reply? ── AgentMail: save draft (in_reply_to)
                                               ▼
                                         Format message ─► Telegram (with ✅/🗑 buttons when a draft exists)

 Telegram button ──► n8n: Telegram: button pressed ─ Read button (owner chat only)
                                               ├─ send    ─► AgentMail: send draft
                                               └─ discard ─► AgentMail: delete draft
                                                  ─► answer the button, edit the message ("Reply sent")
```

## Why these pieces

- **AgentMail** gives the assistant a real inbox through an API, pushes new mail by webhook, and has drafts made for human approval. Replies stay in the original thread (`in_reply_to`).
- **xAI Responses API** with `text.format: { type: "json_schema", strict: true }` means the answer always has the fields the workflow reads. `store: false` stops xAI keeping the conversation for 30 days.
- **n8n core nodes only** (Webhook, Code, HTTP Request, If, Telegram): no community nodes to install, and the logic sits in readable Code nodes generated from `n8n/src/`.
- **Telegram** is where you already are; inline buttons make approval one tap.

## Safety

| Risk | What the workflow does |
|---|---|
| Someone posts fake emails to your webhook | Webhook requires the `X-Inbox-Assistant-Key` header that only AgentMail knows (set by `npm run setup`). |
| AgentMail retries a delivery | Dedupe on `event_id` (last 200 kept in workflow static data). |
| The assistant answers its own sent mail | Mail from the assistant's own address is dropped. |
| An email tries to instruct the model ("ignore your rules…") | The prompt treats email as data; suspicious mail is flagged and never drafted. |
| A reply invents a price or date | The prompt allows facts only from your profile; gaps become `[[ASK: …]]` and are listed in Telegram. |
| Someone else presses your buttons | Only callbacks from your chat id are acted on. |
| A reply goes out unseen | Nothing is sent without a Send press. Drafts are only created, never sent, by the first flow. |
| Keys leak through the workflow file | Keys live in n8n credentials; the exported JSON has none (a unit test checks). |

## Data

Email content goes to AgentMail (stored as your inbox), to xAI for each triage call (not stored, `store: false`), and to Telegram (the summary and draft text in your chat). n8n keeps execution logs according to your n8n settings.

## Changing it

- **Categories or fields**: edit `prompts/schema.json` and `prompts/system.md`, then `npm run build` and re-import.
- **Logic in a step**: edit `n8n/src/*.js`, `npm run build`, re-import (or paste into the Code node).
- **Model**: `grok_model` in Settings. `grok-4.3` is the cheaper default; `grok-4.7` is xAI's flagship.

`npm test` checks that the workflow file matches its sources, so the repo and the importable JSON never drift apart.
