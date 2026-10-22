// Read Grok's answer and decide whether to save a reply draft.
const settings = $('Settings').first().json;
const email = $('Prepare email').first().json;
const res = $input.first().json;

// Responses API: the text sits in output[].content[] of the "message" item.
const message = (res.output || []).find((o) => o.type === 'message');
const part = message && (message.content || []).find((c) => c.type === 'output_text' || typeof c.text === 'string');
let t = null;
try {
  t = JSON.parse(part ? part.text : res.output_text);
} catch (e) {
  t = null;
}
if (!t) {
  t = {
    category: 'other', urgency: 'normal', summary: 'The model reply could not be read. Open the email yourself.',
    next_action: 'Read it in the inbox', needs_reply: false, reply_subject: '', reply_body: '', missing: [], suspicious: false,
  };
}

const skip = (settings.skip_reply_for || []).includes(t.category);
const draft = Boolean(t.needs_reply && t.reply_body && !t.suspicious && !skip);
const subject = t.reply_subject || (/^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`);

return [{
  json: {
    ...t,
    email,
    create_draft: draft,
    draft_request: draft
      ? { to: [email.from_email], subject, text: t.reply_body, in_reply_to: email.message_id, client_id: `draft-${email.event_id || email.message_id}` }
      : null,
  },
}];
