# Grok Bot pack (AgentMail)

The same inbox assistant, run by **Grok Bot**, xAI's hosted agent app, instead of n8n. The Bot reads your AgentMail inbox through AgentMail's official Grok Bot plugin, triages each new email, saves a reply draft in AgentMail and asks you in the Grok Bot app before anything is sent.

> **Status: written from the official docs, not yet tested by us.** Grok Bot needs a plan that includes it, and we built and tested the n8n track instead. If you run this pack, tell us what worked: open an issue.

## What you need

- **Grok Bot access.** xAI and Cursor's plan pages list it on The X Subscription Premium, Super and Ultra (not Plus or Free), on paid Cursor plans, or via a linked SuperGrok subscription. AgentMail's own guide says it does **not** work with SuperGrok Plus. Check [Grok Bot plans](https://docs.x.ai/x-subscription/grok-bot) for your account before you start.
- **An AgentMail account** with an inbox for the assistant (free tier: 3 inboxes, 100 emails a day). `npm run setup` from this repo makes one, or create it in the AgentMail console.
- Your filled-in [business profile](../business-profile.md).

## Set it up (about 10 minutes)

1. **Connect AgentMail to Grok Bot.** In the Grok Bot app open **Connect apps**, choose **Add**, and pick the **AgentMail** plugin. If it isn't listed, AgentMail documents a custom connector: server `https://mcp.agentmail.to/mcp` with header `x-api-key: <your AgentMail API key>` ([AgentMail's Grok guide](https://docs.agentmail.to/integrations/grokbot)).
2. **Create a Bot** called "Inbox Assistant" and paste [bot-instructions.md](bot-instructions.md) as its first message, with your business profile pasted where it says.
3. **Save the skill.** Paste [skill-triage-inbox.md](skill-triage-inbox.md) and ask the Bot to save it as a skill called "Triage inbox".
4. **Add the routine.** Send the message in [routine.md](routine.md). Routines can't run more often than every five minutes.
5. **Make sending ask first.** In **Settings → General → Auto-review**, add an *Ask first* rule for sending email. Ask first wins over any *Allow automatically* rule, so nothing goes out without you.
6. **Test it.** Send one of the [sample emails](../samples/emails.json) to the assistant inbox (or `npm run samples -- lead`), then use **Test run** on the routine.

## How approval works here

Grok Bot approvals raised by a routine expire after about ten minutes, and the action then doesn't run. So the routine never sends: it saves AgentMail drafts and posts a summary in the Bot's chat. You reply "send 1" or "discard 2", and the send happens while you're there to approve it.

## Differences from the n8n track

| | n8n track (main) | Grok Bot pack |
|---|---|---|
| Runs on | Your n8n (cloud or self-hosted) | xAI/Cursor's cloud computer |
| New mail | Instant, via AgentMail webhook | On a schedule (5 minutes at the fastest) |
| Model | Grok API (`grok-4.3` by default), paid per token | Grok Bot's own model, in your plan |
| Notifications | Telegram with Send/Discard buttons | Grok Bot app chat |
| Cost | n8n + AgentMail free tiers + a few pence of Grok API | A plan that includes Grok Bot |
| Tested by us | Yes, end to end against stand-in services | Not yet |
