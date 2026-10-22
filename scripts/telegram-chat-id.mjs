// Finds your Telegram chat id. Message your bot first (anything), then run:
//   TELEGRAM_BOT_TOKEN=123:abc  npm run telegram-chat-id
// Run it before you activate the workflow: once n8n registers its webhook, Telegram
// no longer returns updates here.
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Set TELEGRAM_BOT_TOKEN (from @BotFather).');
  process.exit(1);
}
const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const data = await res.json();
if (!data.ok) {
  console.error(`Telegram said: ${data.description}`);
  process.exit(1);
}
const chats = new Map();
for (const u of data.result) {
  const c = (u.message || u.edited_message || u.callback_query?.message)?.chat;
  if (c) chats.set(c.id, c.username ? `@${c.username}` : c.title || c.first_name || '');
}
if (!chats.size) console.log('No messages yet. Send your bot a message in Telegram, then run this again.');
for (const [id, name] of chats) console.log(`chat id ${id}  ${name}`);
