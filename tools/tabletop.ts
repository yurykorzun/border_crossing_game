// The tabletop prototype: paper cards to test the decisions before dialogue and animation,
// printed from the game's own content like the game map (tools/map.ts).
// `npm run tabletop -- [out.pdf]` (default: ~/Desktop/Purpose of Visit tabletop <date>.pdf).
// A4 sheets of 63 × 88 mm cards with dashed cut lines, a rules page first, tokens and tracks last.
// Exits 1 before printing if a card's text key is missing from src/i18n/en.ts.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { en } from '../src/i18n/en';
import { buildTabletop } from './tabletop-cards';

const today = new Date().toISOString().slice(0, 10);
const out = process.argv[2] ?? join(homedir(), 'Desktop', `Purpose of Visit tabletop ${today}.pdf`);

const { html, missing, approaches, cards } = buildTabletop(en);
if (missing.length) {
  console.error(`tabletop: FAIL ${missing.length} card text keys missing from src/i18n/en.ts: ${missing.join(', ')}`);
  process.exit(1);
}
const odd = Object.entries(approaches).filter(([, n]) => n < 2 || n > 3);
if (odd.length) {
  console.error(`tabletop: FAIL question cards need 2-3 approaches: ${odd.map(([id, n]) => `${id} has ${n}`).join(', ')}`);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'tabletop-'));
writeFileSync(join(dir, 'tabletop.html'), html);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + join(dir, 'tabletop.html'));
// A long card prints smaller until it fits its 88 mm, down to MIN_PT; past that it fails.
const MIN_PT = 5.6;
const overflow = await page.evaluate((min) => {
  const left: string[] = [];
  for (const card of document.querySelectorAll<HTMLElement>('.card')) {
    let pt = 7.4;
    while (card.scrollHeight > card.clientHeight && pt > min) { pt -= 0.2; card.style.fontSize = `${pt}pt`; }
    if (card.scrollHeight > card.clientHeight) left.push(card.querySelector('.id')?.textContent ?? '?');
  }
  return left;
}, MIN_PT);
if (overflow.length) {
  await browser.close();
  console.error(`tabletop: FAIL cards too long to fit at ${MIN_PT}pt: ${overflow.join(', ')}`);
  process.exit(1);
}
await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
const pages = (readFileSync(out).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
console.log(`tabletop: ${out}\n  ${pages} pages, ${cards} cards, html ${join(dir, 'tabletop.html')}`);
