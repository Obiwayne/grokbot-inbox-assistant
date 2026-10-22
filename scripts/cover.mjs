// Renders docs/blog/cover.png (1600x900) and docs/blog/social.png (1600x1000) from the screenshots.
//   node scripts/cover.mjs
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const f = (p) => pathToFileURL(resolve(p)).href;
mkdirSync('docs/blog', { recursive: true });
const html = (w, h, foot) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0}
body{width:${w}px;height:${h}px;overflow:hidden;position:relative;font-family:"Segoe UI",Inter,system-ui,sans-serif;color:#f2f4f7;
background:radial-gradient(900px 700px at 80% 30%,rgba(253,139,64,.22),transparent 60%),radial-gradient(700px 600px at 0% 100%,rgba(61,140,255,.18),transparent 60%),#0a0b0e}
.copy{position:absolute;left:72px;top:${foot ? 80 : 104}px;width:600px}
.brand{display:flex;align-items:center;gap:14px;font-weight:700;font-size:28px}
.brand svg{width:44px;height:44px}
.kick{margin-top:46px;color:#fd8b40;font-weight:600;font-size:20px;letter-spacing:.14em}
h1{font-size:74px;line-height:1.02;margin:14px 0 0;letter-spacing:-.02em;font-weight:800}
.lede{font-size:30px;line-height:1.3;margin-top:22px;color:#cfd5de;font-weight:600}
.flow{display:flex;flex-wrap:wrap;gap:10px;margin-top:30px}
.flow span{padding:9px 14px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-size:19px;font-weight:600}
.flow i{font-style:normal;color:#fd8b40;align-self:center;font-size:20px}
.stack{margin-top:26px;font-size:19px;color:#8f99a8}
.wf{position:absolute;left:700px;top:${foot ? 120 : 140}px;width:1280px;border-radius:18px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.14),0 40px 120px rgba(0,0,0,.6);transform:scale(.78);transform-origin:top left}
.wf img{display:block;width:1280px}
.phone{position:absolute;left:${foot ? 1150 : 1160}px;top:${foot ? 330 : 300}px;width:360px;height:740px;border-radius:46px;overflow:hidden;border:10px solid #050608;box-shadow:0 0 0 1px rgba(255,255,255,.18),0 40px 100px rgba(0,0,0,.7)}
.phone img{display:block;width:100%}
.foot{position:absolute;left:0;right:0;bottom:0;height:90px;background:#0a0b0e;display:flex;align-items:center;justify-content:space-between;padding:0 72px;font-size:25px;font-weight:600}
.foot b{color:#fd8b40}
</style></head><body>
<div class="copy">
  <div class="brand"><svg viewBox="0 0 26 26" fill="none"><rect width="26" height="26" rx="6" fill="#181B22"/><path d="M13 3 L22 8.5 L22 17.5 L13 23 L4 17.5 L4 8.5 Z" stroke="#FD8B40" stroke-width="1.8" fill="#181B22"/><path d="M4 8.5 L13 13 L22 8.5 M13 13 L13 23" stroke="#FD8B40" stroke-width="1.8"/></svg>RepoQuarry</div>
  <div class="kick">FREE N8N WORKFLOW · GITHUB TEMPLATE</div>
  <h1>Build your own Grok email assistant</h1>
  <div class="lede">Every email summarised, with a reply drafted for you to approve.</div>
  <div class="flow"><span>New email</span><i>→</i><span>Summary</span><i>→</i><span>Next action</span><i>→</i><span>Draft</span><i>→</i><span>✅ Approve</span></div>
  <div class="stack">n8n · AgentMail · Grok API · Telegram · plus a Grok Bot pack</div>
</div>
<div class="wf"><img src="${f('docs/screenshots/n8n-workflow.png')}"></div>
<div class="phone"><img src="${f('docs/screenshots/telegram.png')}"></div>
${foot ? '<div class="foot"><span>MIT · tested in n8n 2.44.5</span><b>github.com/Obiwayne/grokbot-inbox-assistant</b></div>' : ''}
</body></html>`;

const browser = await chromium.launch();
for (const [name, w, h, foot] of [['cover', 1600, 900, false], ['social', 1600, 1000, true]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const tmp = resolve('docs/blog', `_${name}.html`);
  writeFileSync(tmp, html(w, h, foot));
  await page.goto(f(tmp));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `docs/blog/${name}.png` });
  rmSync(tmp);
}
await browser.close();
console.log('docs/blog/cover.png and social.png written');
