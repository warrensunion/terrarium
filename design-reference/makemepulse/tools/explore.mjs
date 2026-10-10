import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('https://2019.makemepulse.com/', { timeout: 60000 });
await p.waitForFunction(() => !document.querySelector('.landing__wrapper-width').classList.contains('is-hidden'), null, { timeout: 90000 });
await p.waitForTimeout(2500);
await p.mouse.move(720, 450, { steps: 10 }); await p.waitForTimeout(1200);
await p.screenshot({ path: 'ex-01-hover.jpg', quality: 60 });
console.log(await p.evaluate(() => document.querySelector('.landing__button').className + ' ' + getComputedStyle(document.querySelector('.landing__button')).opacity));
await p.mouse.down(); await p.waitForTimeout(150); await p.mouse.up();
const ui = () => p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && e.textContent.trim() && +getComputedStyle(e).opacity > 0.05 && e.getBoundingClientRect().width > 0).map(e => `${e.className}:"${e.textContent.trim().slice(0, 50)}"`).join(' | '));
for (let i = 1; i <= 20; i++) {
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `ex-${String(i + 1).padStart(2, '0')}.jpg`, quality: 50 });
  console.log(i, await ui());
}
await b.close();
