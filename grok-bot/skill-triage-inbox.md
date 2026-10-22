# Paste this, then ask the Bot to save it as a skill called "Triage inbox"

Skill: Triage inbox

1. Using the AgentMail connector, list messages in my assistant inbox that are not labelled "triaged".
2. For each, oldest first (at most 20 per run):
   a. Read the full message.
   b. Classify, summarise and choose a next action as described in your instructions.
   c. If it needs a reply and isn't a newsletter, invoice or suspicious, create an AgentMail draft replying to that message, using only my business profile. Do not send it.
   d. Add the label "triaged" to the message.
3. If there was at least one new email, post one numbered report in this chat in the agreed format. If there were none, post nothing.
4. Never send, forward or delete anything in this skill.
