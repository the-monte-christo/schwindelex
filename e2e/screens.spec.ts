// Screenshots of every screen for design review (test-results/screens/, not committed).
// Also guards against horizontal overflow on every screen.
import { devices, expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

const PIN = 'e2e-pin';

const VARIANTS: { name: string; options: BrowserContextOptions }[] = [
  { name: 'mobil-hell', options: { ...devices['Pixel 7'], colorScheme: 'light' } },
  { name: 'mobil-dunkel', options: { ...devices['Pixel 7'], colorScheme: 'dark' } },
  { name: 'desktop-hell', options: { viewport: { width: 1280, height: 860 }, colorScheme: 'light' } },
];

async function shot(page: Page, variant: string, name: string) {
  await page.waitForTimeout(2000); // let drop-in and stamp animations settle
  await page.screenshot({ path: `test-results/screens/${variant}/${name}.png`, fullPage: true });
  const culprits = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 0.5)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} → ${Math.round(el.getBoundingClientRect().right)}px`)
      .slice(0, 5);
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${name}: ${culprits.join(', ')}`).toBeLessThanOrEqual(0);
}

async function player(browser: Browser, options: BrowserContextOptions, code: string, name: string): Promise<Page> {
  const page = await (await browser.newContext(options)).newPage();
  await page.goto(`/?c=${code}`);
  await page.getByLabel('Dein Name').fill(name);
  await page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(page.locator('.code')).toHaveText(code);
  return page;
}

for (const { name: variant, options } of VARIANTS) {
  test(`screens ${variant}`, async ({ browser }) => {
    const anna = await (await browser.newContext(options)).newPage();
    await anna.goto('/');
    await anna.getByLabel('Dein Name').fill('Anna');
    await shot(anna, variant, '01-start');

    await anna.getByRole('button', { name: 'Neues Spiel erstellen' }).click();
    await anna.getByLabel('Host-PIN').fill(PIN);
    await anna.getByRole('button', { name: 'Spiel erstellen' }).click();
    const code = (await anna.locator('.code').textContent())!.trim();
    const others = [
      await player(browser, options, code, 'Bob'),
      await player(browser, options, code, 'Cleo'),
      await player(browser, options, code, 'Dora'),
    ];
    await others[0]!.getByRole('button', { name: 'Bereit?' }).click();
    await shot(anna, variant, '02-lobby');

    for (const p of [anna, ...others]) {
      const ready = p.getByRole('button', { name: 'Bereit?' });
      if (await ready.isVisible()) await ready.click();
    }
    await anna.getByRole('button', { name: 'Spiel starten' }).click();
    await expect(anna.getByText('Runde 1')).toBeVisible();
    await anna.getByLabel('Was bedeutet das Wort?').fill('eine alte Münze aus Böhmen');
    await others[0]!.getByLabel('Was bedeutet das Wort?').fill('x');
    await others[0]!.getByRole('button', { name: 'OK' }).click();
    await shot(anna, variant, '03-schreiben');

    await anna.getByRole('button', { name: 'OK' }).click();
    await others[0]!.getByLabel('Was bedeutet das Wort?').fill('ein Vogel, der nachts singt und tagsüber schläft');
    await others[0]!.getByRole('button', { name: 'OK' }).click();
    await others[1]!.getByLabel('Was bedeutet das Wort?').fill('eine alte Münze aus Böhmen');
    await others[1]!.getByRole('button', { name: 'OK' }).click();
    await others[2]!.getByLabel('Was bedeutet das Wort?').fill('Streit unter Nachbarn wegen einer Hecke');
    await others[2]!.getByRole('button', { name: 'OK' }).click();
    await expect(anna.getByText('Welche Erklärung stimmt?')).toBeVisible();
    await anna.locator('.stacks button').nth(1).click();
    await shot(anna, variant, '04-tippen');

    for (const p of others) await p.locator('.stacks button').first().click();
    await expect(anna.getByText('Richtig:')).toBeVisible();
    await shot(anna, variant, '05-aufloesung');

    await anna.getByRole('button', { name: 'Mitspieler einladen' }).click();
    await shot(anna, variant, '06-einladen');
    await anna.getByRole('button', { name: 'Schließen' }).click();

    await anna.getByRole('button', { name: 'Weiter' }).click();
    for (const p of others) await p.getByRole('button', { name: 'Passen' }).click();
    await expect(anna.getByText('Siegerehrung')).toBeVisible();
    await shot(anna, variant, '07-siegerehrung');
  });
}
