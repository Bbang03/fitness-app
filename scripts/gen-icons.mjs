import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

mkdirSync('public', { recursive: true });

const makeHtml = (size, radius, fontSize, letterSpacing) => `<!DOCTYPE html>
<html><head><style>*{margin:0;padding:0;box-sizing:border-box;}body{background:transparent;}</style></head>
<body>
<div style="width:${size}px;height:${size}px;background:linear-gradient(135deg,#1d4ed8,#3b82f6);
  border-radius:${radius}px;display:flex;align-items:center;justify-content:center;">
  <span style="color:white;font-size:${fontSize}px;font-weight:900;
    font-family:-apple-system,Arial,sans-serif;letter-spacing:${letterSpacing}px;line-height:1;">FT</span>
</div>
</body></html>`;

const browser = await chromium.launch();

for (const { size, radius, fontSize, ls } of [
  { size: 512, radius: 80, fontSize: 240, ls: -8 },
  { size: 192, radius: 30, fontSize: 90,  ls: -3 },
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(makeHtml(size, radius, fontSize, ls));
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, type: 'png' });
  writeFileSync(`public/icon-${size}.png`, buf);
  console.log(`✅ public/icon-${size}.png`);
  await page.close();
}

await browser.close();
