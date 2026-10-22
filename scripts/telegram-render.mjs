// Renders real notifications from an end-to-end run as a Telegram chat, for the docs.
//   E2E_LOG=log.json npm run test:n8n   then   node scripts/telegram-render.mjs log.json
// It is a rendering of the exact text and buttons the workflow sent, not a Telegram screenshot.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const log = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const sent = log.telegram.filter((t) => t.method === 'sendMessage').map((t) => t.params);
const pick = (needle) => sent.find((p) => p.text.includes(needle));
const show = [pick('Plates for our new restaurant'), pick('Change of bank details'), pick('Invoice INV-20419')].filter(Boolean);

const buttons = (p) => {
  const rows = p.reply_markup?.inline_keyboard || (typeof p.reply_markup === 'string' ? JSON.parse(p.reply_markup).inline_keyboard : []);
  return rows.map((r) => `<div class="kb">${r.map((b) => `<span>${b.text}</span>`).join('')}</div>`).join('');
};
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:430px;height:932px;background:#0e1621;font:15px/1.38 -apple-system,"Segoe UI",Roboto,sans-serif;color:#f5f5f5;overflow:hidden}
.top{height:64px;display:flex;align-items:center;gap:12px;padding:0 16px;background:#17212b;border-bottom:1px solid #0b121a}
.av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#3ddc97,#1f8f63);display:grid;place-items:center;font-weight:700;color:#06231a}
.top b{display:block}.top small{color:#7f91a4}
.chat{padding:12px 10px;display:flex;flex-direction:column;gap:10px}
.msg{max-width:380px;background:#182533;border-radius:14px 14px 14px 4px;padding:9px 12px 6px;white-space:pre-wrap;word-wrap:break-word}
.msg blockquote{margin:6px 0;padding:4px 10px;border-left:3px solid #3ddc97;background:rgba(61,220,151,.08);border-radius:4px;white-space:pre-wrap}
.time{float:right;color:#6d7f8f;font-size:12px;margin:4px 0 0 8px}
.kb{display:flex;gap:4px;margin-top:4px;max-width:404px}.kb span{flex:1;text-align:center;background:rgba(24,37,51,.85);padding:9px;border-radius:8px;font-weight:600;font-size:14px}
</style></head><body>
<div class="top"><div class="av">IA</div><div><b>Inbox Assistant</b><small>bot</small></div></div>
<div class="chat">${show.map((p, i) => `<div><div class="msg">${p.text}<span class="time">09:${12 + i * 7}</span></div>${buttons(p)}</div>`).join('')}</div>
</body></html>`;
const tmp = resolve('docs/screenshots/_telegram.html');
writeFileSync(tmp, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 });
await page.goto(pathToFileURL(tmp).href);
await page.screenshot({ path: 'docs/screenshots/telegram.png' });
await browser.close();
rmSync(tmp);
console.log(`docs/screenshots/telegram.png (${show.length} messages)`);
