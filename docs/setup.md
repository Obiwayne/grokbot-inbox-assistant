# Setup guide

About 20 minutes. You'll end with a live assistant: email in, Telegram message out, one tap to send the reply.

## 0. Make your copy

Press **Use this template** on GitHub, clone your new repository, and run `npm install` (Node.js 20 or later).

## 1. Get the four keys

| What | Where | Looks like |
|---|---|---|
| AgentMail API key | [console.agentmail.to](https://console.agentmail.to) → API keys | `am_…` |
| xAI API key | [console.x.ai](https://console.x.ai) → API keys (add a little credit) | `xai-…` |
| Telegram bot token | Message [@BotFather](https://t.me/BotFather), send `/newbot` | `123456789:AA…` |
| n8n | [n8n Cloud](https://n8n.io) or your own n8n | a URL like `https://you.app.n8n.cloud` |

n8n must be reachable over HTTPS, because AgentMail and Telegram call it. n8n Cloud works out of the box. Self-hosting? Put it behind Cloudflare Tunnel, Tailscale Funnel or a reverse proxy, and set n8n's `WEBHOOK_URL` to that public address.

## 2. Import the workflow

In n8n: **Workflows → Import from file** → choose `n8n/inbox-assistant.json`.

## 3. Add the credentials

Open each node with a warning triangle and create its credential. Names matter only to you.

| Credential | Type | Fields |
|---|---|---|
| **AgentMail API key** | Header Auth | Name `Authorization`, Value `Bearer am_…` |
| **xAI API key** | Header Auth | Name `Authorization`, Value `Bearer xai-…` |
| **Telegram bot** | Telegram API | Access Token: your bot token |
| **AgentMail webhook key** | Header Auth | Name `X-Inbox-Assistant-Key`, Value: from step 4 |

## 4. Create the inbox and connect it

Open the **AgentMail: new email** node and copy its **Production URL** (ends in `/webhook/agentmail-inbox`). Then:

```bash
AGENTMAIL_API_KEY=am_... N8N_WEBHOOK_URL=https://you.app.n8n.cloud/webhook/agentmail-inbox npm run setup -- --tester
```

It creates the assistant's inbox (and a second "tester" inbox for samples), registers the webhook, and prints:
- the **webhook key**: put it in the *AgentMail webhook key* credential;
- the **inbox id and address**: you'll paste them in step 6;
- the **tester inbox id**: for step 8.

Add `INBOX_USERNAME=hello` to ask for `hello@agentmail.to` instead of a random address.

## 5. Find your Telegram chat id

Open your bot in Telegram and send it any message. Then, **before** publishing the workflow:

```bash
TELEGRAM_BOT_TOKEN=123:abc npm run telegram-chat-id
```

## 6. Fill in the Settings nodes

Open **Settings** and replace:
- `PASTE_YOUR_INBOX_ID`, `PASTE_YOUR_INBOX_EMAIL`, `PASTE_YOUR_CHAT_ID`;
- the `BUSINESS_PROFILE` text with your own (start from [business-profile.md](../business-profile.md)). This is the only source of facts for replies: anything you leave out becomes an `[[ASK: …]]` placeholder.

Open **Settings (approval)** and paste the same inbox id and chat id.

Optional: change `grok_model` to `grok-4.7` for the flagship model, or edit `skip_reply_for`.

## 7. Publish

Press **Publish**. n8n registers the Telegram button webhook at this point.

## 8. Try it

```bash
AGENTMAIL_API_KEY=am_... TESTER_INBOX_ID=<tester id> ASSISTANT_EMAIL=<assistant address> npm run samples
```

Within a minute you should get seven Telegram messages. Press **✅ Send reply** on one; the reply goes to the tester inbox. Send just one sample with `npm run samples -- lead`.

## Use it with Gmail

AgentMail gives the assistant its own inbox; it doesn't sign in to Gmail. To have it handle mail that arrives in Gmail:

1. Gmail → **Settings → Forwarding and POP/IMAP → Add a forwarding address** → the assistant's address.
2. Gmail sends a confirmation code to that address. The assistant will message you about it on Telegram; copy the code into Gmail.
3. Choose to forward everything, or create a Gmail filter that forwards only some mail.

Replies go out **from the assistant's address** (or from your own domain on AgentMail's paid plan), with your sign-off from the business profile.

## Troubleshooting

- **No Telegram message.** In n8n open **Executions**. A 403 on the webhook means the header key in the credential doesn't match the one `npm run setup` printed. No execution at all means AgentMail can't reach n8n: check the URL is public HTTPS. AgentMail disables a webhook after 5 days of failures.
- **Grok errors.** Check the xAI key has credit and `grok_model` is on [the models page](https://docs.x.ai/docs/models).
- **Buttons do nothing.** The chat id in **Settings (approval)** must match yours; presses from other chats are ignored on purpose. Re-publish after changing the Telegram credential.
- **Same email twice.** AgentMail delivers at least once; the workflow drops repeats by event id, but only while it's published (test runs don't keep that memory).
