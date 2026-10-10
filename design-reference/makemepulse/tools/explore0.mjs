import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('https://2019.makemepulse.com/', { timeout: 60000 });
for (let i = 0; i < 12; i++) {
  await p.waitForTimeout(2500);
  const s = await p.evaluate(() => { const e = document.querySelector('.button__text'); const out = []; for (let n = e; n && n !== document.body; n = n.parentElement) out.push(n.className + ':' + getComputedStyle(n).opacity + ':' + getComputedStyle(n).visibility); return out.join(' < '); });
  console.log((i + 1) * 2.5, s);
}
await p.screenshot({ path: 'ex0-30s.jpg', quality: 70 });
await b.close();
