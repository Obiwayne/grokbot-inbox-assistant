// Prepare email: keep only new incoming mail, drop duplicates and our own sends.
// AgentMail delivers webhooks at least once, so we dedupe on event_id.
const settings = $('Settings').first().json;
const body = $('AgentMail: new email').first().json.body || {};

if (body.event_type !== 'message.received' || !body.message) return [];

const msg = body.message;
const seen = $getWorkflowStaticData('global');
seen.events = seen.events || [];
if (body.event_id && seen.events.includes(body.event_id)) return [];
if (body.event_id) seen.events = [...seen.events.slice(-199), body.event_id];

// The payload has shown "from" as a string and as "from_" (an array); accept both.
const fromRaw = msg.from ?? (Array.isArray(msg.from_) ? msg.from_[0] : msg.from_) ?? '';
const fromEmail = (String(fromRaw).match(/<([^>]+)>/) || [null, String(fromRaw)])[1].trim().toLowerCase();
const fromName = String(fromRaw).replace(/<[^>]+>/, '').replace(/"/g, '').trim() || fromEmail;

// Ignore mail the assistant inbox sent itself (replies we approved).
if (settings.agentmail_inbox_email && fromEmail === settings.agentmail_inbox_email.toLowerCase()) return [];

return [{
  json: {
    event_id: body.event_id || '',
    inbox_id: msg.inbox_id || settings.agentmail_inbox_id,
    message_id: msg.message_id,
    thread_id: msg.thread_id || '',
    from_email: fromEmail,
    from_name: fromName,
    subject: msg.subject || '(no subject)',
  },
}];
