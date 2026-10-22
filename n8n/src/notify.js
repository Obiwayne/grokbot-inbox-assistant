// Format the Telegram notification (HTML). Buttons are added by the Telegram node when a draft exists.
const triage = $('Read Grok answer').first().json;
const draft = $input.first().json.draft_id ? $input.first().json : null;
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const LABEL = {
  urgent: '🔴 Urgent', lead: '🟢 Lead', customer_enquiry: '🔵 Customer enquiry',
  invoice: '🧾 Invoice', newsletter: '📰 Newsletter', other: '✉️ Other',
};
const e = triage.email;
const lines = [
  `<b>${LABEL[triage.category] || triage.category}</b>${triage.urgency === 'high' && triage.category !== 'urgent' ? ' · high urgency' : ''}`,
  `<b>${esc(e.from_name)}</b> — ${esc(e.subject)}`,
  '',
  esc(triage.summary),
  '',
  `<b>Next:</b> ${esc(triage.next_action)}`,
];
if (triage.suspicious) lines.push('', '⚠️ <b>Looks suspicious.</b> No reply was drafted. Check the sender before acting.');
if (draft) {
  const preview = triage.reply_body.length > 700 ? triage.reply_body.slice(0, 700) + '…' : triage.reply_body;
  lines.push('', '<b>Draft reply</b> (saved in AgentMail):', `<blockquote>${esc(preview)}</blockquote>`);
  if ((triage.missing || []).length) lines.push(`Fill in first: ${esc(triage.missing.join('; '))}`);
} else if (triage.needs_reply && !triage.suspicious) {
  lines.push('', 'No draft: this category is set to skip replies.');
}

return [{
  json: {
    text: lines.join('\n').slice(0, 4000),
    draft_id: draft ? draft.draft_id : '',
    has_draft: Boolean(draft),
  },
}];
