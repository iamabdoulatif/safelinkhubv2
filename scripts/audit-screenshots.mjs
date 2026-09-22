import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/tmp/xenfi-audit2';
fs.mkdirSync(OUT, { recursive: true });

const pages = [
  ['landing', '/'],
  ['services', '/services'],
  ['services-hotspot', '/services/hotspot'],
  ['formations', '/formations'],
  ['contact', '/contact'],
  ['boutique', '/boutique'],
  ['vpn', '/vpn'],
  ['login', '/auth/login'],
  ['register', '/auth/register'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

for (const [name, path] of pages) {
  try {
    const resp = await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 });
    // Faire défiler toute la page pour déclencher les animations reveal
    await page.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let y = 0; y <= h; y += 700) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log(name, resp.status());
  } catch (e) {
    console.log(name, 'ERROR', e.message.split('\n')[0]);
  }
}
await browser.close();
