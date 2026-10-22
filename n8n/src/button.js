// A Telegram button was pressed: work out which draft and what to do.
// Only the owner's chat can approve; anything else is ignored.
const settings = $('Settings (approval)').first().json;
const update = $('Telegram: button pressed').first().json;
const q = update.callback_query;
if (!q || !q.data) return [];

const chatId = String(q.message?.chat?.id ?? '');
if (chatId !== String(settings.telegram_chat_id)) return [];

const [action, draftId] = String(q.data).split(':');
if (!['send', 'discard'].includes(action) || !draftId) return [];

return [{
  json: {
    action,
    draft_id: draftId,
    inbox_id: settings.agentmail_inbox_id,
    query_id: q.id,
    chat_id: chatId,
    message_id: q.message?.message_id,
    original_text: q.message?.text || '',
  },
}];
