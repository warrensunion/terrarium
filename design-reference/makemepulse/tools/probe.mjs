// One-off probe of 2019.makemepulse.com: what renders it, which fonts, how scrolling works.
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const reqs = [];
p.on('request', r => reqs.push(r.resourceType() + ' ' + r.url().slice(0, 140)));
p.on('console', m => console.log('console:', m.type(), m.text().slice(0, 200)));
const t0 = Date.now();
await p.goto('https://2019.makemepulse.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (const t of [500, 2000, 5000, 9000]) {
  await p.waitForTimeout(t - (Date.now() - t0) > 0 ? t - (Date.now() - t0) : 0);
  await p.screenshot({ path: `design-reference/makemepulse/tools/probe-${t}.jpg`, quality: 70, type: 'jpeg' });
}
const info = await p.evaluate(() => ({
  canvases: [...document.querySelectorAll('canvas')].map(c => ({ w: c.width, h: c.height, css: c.style.cssText, ctx: c.getContext('webgl2') ? 'webgl2' : (c.getContext('webgl') ? 'webgl' : '2d?') })),
  bodyH: document.body.scrollHeight, docH: document.documentElement.scrollHeight,
  overflow: getComputedStyle(document.body).overflow + ' / ' + getComputedStyle(document.documentElement).overflow,
  fonts: [...document.fonts].map(f => `${f.family} ${f.weight} ${f.style} ${f.status}`),
  texts: [...document.querySelectorAll('h1,h2,h3,p,a,span,button,div')].filter(e => e.children.length === 0 && e.textContent.trim()).slice(0, 60).map(e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return `${e.tagName}.${e.className} "${e.textContent.trim().slice(0, 40)}" ${s.fontFamily.slice(0, 30)} ${s.fontSize} ${s.fontWeight} ls=${s.letterSpacing} lh=${s.lineHeight} col=${s.color} op=${s.opacity} @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`; }),
  scripts: [...document.scripts].map(s => s.src).filter(Boolean),
  html: document.body.innerHTML.length,
  title: document.title,
}));
console.log(JSON.stringify(info, null, 1));
console.log(reqs.filter(r => !r.startsWith('image')).slice(0, 60).join('\n'));
console.log('images:', reqs.filter(r => r.startsWith('image')).length);
await b.close();
