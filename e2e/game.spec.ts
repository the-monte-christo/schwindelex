import { devices, expect, test, type Browser, type Page } from '@playwright/test';

const PIN = 'e2e-pin';

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return context.newPage();
}

async function host(browser: Browser, name: string): Promise<{ page: Page; code: string }> {
  const page = await newPlayer(browser);
  await page.goto('/');
  await page.getByLabel('Dein Name').fill(name);
  await page.getByRole('button', { name: 'Neues Spiel erstellen' }).click();
  await page.getByLabel('Host-PIN').fill(PIN);
  await page.getByRole('button', { name: 'Spiel erstellen' }).click();
  const code = (await page.locator('.code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{4}$/);
  return { page, code };
}

async function join(browser: Browser, code: string, name: string): Promise<Page> {
  const page = await newPlayer(browser);
  await page.goto(`/?c=${code}`);
  await page.getByLabel('Dein Name').fill(name);
  await expect(page.getByLabel('Spielcode')).toHaveValue(code);
  await page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(page.locator('.code')).toHaveText(code);
  return page;
}

async function write(page: Page, text: string) {
  await page.getByLabel('Was bedeutet das Wort?').fill(text);
  await page.getByRole('button', { name: 'OK' }).click();
}

test('four players play a round, reconnect, invite a late player and finish', async ({ browser }) => {
  const { page: anna, code } = await host(browser, 'Anna');
  const bob = await join(browser, code, 'Bob');
  const cleo = await join(browser, code, 'Cleo');
  const dora = await join(browser, code, 'Dora');
  const all = [anna, bob, cleo, dora];

  // QR code is served for the lobby
  await expect(anna.getByAltText(/QR-Code/)).toBeVisible();
  expect((await anna.request.get(`/qr/${code}.svg`)).status()).toBe(200);

  // Start: host can only start once everyone is ready
  await expect(anna.getByRole('button', { name: 'Spiel starten' })).toBeDisabled();
  for (const p of all) await p.getByRole('button', { name: 'Bereit?' }).click();
  await anna.getByRole('button', { name: 'Spiel starten' }).click();
  for (const p of all) await expect(p.getByText('Runde 1')).toBeVisible();

  // Writing, with a reload in between: the draft survives
  await bob.getByLabel('Was bedeutet das Wort?').fill('ein Hut aus Stroh');
  await bob.waitForTimeout(700); // draft is debounced
  await bob.reload();
  await expect(bob.getByLabel('Was bedeutet das Wort?')).toHaveValue('ein Hut aus Stroh');
  await bob.getByRole('button', { name: 'OK' }).click();

  await write(anna, 'eine Vogelart');
  await write(cleo, 'ein Hut aus Stroh'); // identical → same stack as Bob
  await write(dora, ''); // empty answer, still votes

  // Voting
  for (const p of all) await expect(p.getByText('Welche Erklärung stimmt?')).toBeVisible();
  await expect(bob.getByRole('button', { name: /2 Zettel/ })).toBeVisible();
  await expect(bob.getByRole('button', { name: /dein Zettel/ })).toBeVisible();
  await expect(dora.getByRole('button', { name: /dein Zettel/ })).toHaveCount(0);
  for (const p of [anna, cleo, dora]) await p.getByRole('button', { name: /Hut aus Stroh/ }).click();
  await bob.getByRole('button', { name: /Vogelart/ }).click();

  // Reveal: authors are uncovered, Bob and Cleo fooled Anna and Dora
  for (const p of all) await expect(p.getByText('Richtig:')).toBeVisible();
  await expect(anna.getByText('von Bob, Cleo')).toBeVisible();
  await expect(anna.getByLabel('Punktestand')).toContainText('Bob: 2');

  // Invite a late player from the reveal screen
  await anna.getByRole('button', { name: 'Mitspieler einladen' }).click();
  await expect(anna.getByRole('dialog', { name: 'Mitspieler einladen' })).toBeVisible();
  await anna.getByRole('button', { name: 'Schließen' }).click();
  const emil = await newPlayer(browser);
  await emil.goto(`/?c=${code}`);
  await emil.getByLabel('Dein Name').fill('Emil');
  await emil.getByRole('button', { name: 'Beitreten' }).click();
  await expect(emil.getByText('Du bist ab der nächsten Runde dabei.')).toBeVisible();

  // Next round: Dora passes, Emil joins in
  for (const p of [anna, bob, cleo]) await p.getByRole('button', { name: 'Weiter' }).click();
  await dora.getByRole('button', { name: 'Passen' }).click();
  await expect(emil.getByText('Runde 2')).toBeVisible();
  await expect(emil.getByLabel('Was bedeutet das Wort?')).toBeVisible();
  await expect(dora.getByText('Du setzt diese Runde aus.')).toBeVisible();

  // Finish round 2 quickly, then everyone but one passes
  for (const p of [anna, bob, cleo, emil]) await write(p, '');
  // nobody wrote anything → only the real definition is on the table
  for (const p of [anna, bob, cleo, emil]) await p.locator('.stacks button').first().click();
  for (const p of all) await expect(p.getByText('Richtig:')).toBeVisible();
  await anna.getByRole('button', { name: 'Weiter' }).click();
  for (const p of [bob, cleo, dora, emil]) await p.getByRole('button', { name: 'Passen' }).click();

  for (const p of [...all, emil]) await expect(p.getByText('Siegerehrung')).toBeVisible();
  await expect(anna.getByLabel('Endstand')).toContainText('🏆');

  // The lobby is gone after the podium
  expect((await anna.request.get(`/qr/${code}.svg`)).status()).toBe(404);
  await anna.getByRole('button', { name: 'Neues Spiel' }).click();
  await expect(anna.getByRole('heading', { name: 'Schwindelex' })).toBeVisible();
});

test('wrong PIN and unknown code show German errors', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('Zoe');
  await page.getByLabel('Spielcode').fill('QQQQ');
  await page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(page.getByRole('alert')).toHaveText('Diesen Code gibt es nicht.');
  await page.getByRole('button', { name: 'Neues Spiel erstellen' }).click();
  await page.getByLabel('Host-PIN').fill('falsch');
  await page.getByRole('button', { name: 'Spiel erstellen' }).click();
  await expect(page.getByRole('alert')).toHaveText('Falsche PIN.');
});
