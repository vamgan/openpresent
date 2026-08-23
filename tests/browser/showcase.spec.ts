import { expect, test } from '@playwright/test';

test('covers forward, backward, paging, editable-space, hashes, and focus order', async ({ page }) => {
  await page.goto('/#opening');
  const presentation = page.getByTestId('presentation');
  await expect(presentation).toHaveAttribute('data-slide-id', 'opening');
  await expect(presentation).toHaveAttribute('data-openpresent-slide-count', '14');
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();
  await page.keyboard.press('PageDown');
  await expect(presentation).toHaveAttribute('data-slide-id', 'problem');
  await page.keyboard.press('ArrowDown');
  await expect(presentation).toHaveAttribute('data-slide-id', 'thesis');
  await page.keyboard.press('ArrowUp');
  await expect(presentation).toHaveAttribute('data-slide-id', 'problem');
  await page.keyboard.press('PageUp');
  await expect(presentation).toHaveAttribute('data-slide-id', 'opening');
  await page.keyboard.press(' ');
  await expect(presentation).toHaveAttribute('data-slide-id', 'problem');
  await expect(page).toHaveURL(/#problem$/);
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Editable browser fixture');
    document.querySelector('[data-openpresent-slide]')?.append(input);
    input.focus();
  });
  await page.keyboard.press(' ');
  await expect(presentation).toHaveAttribute('data-slide-id', 'problem');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('End');
  await expect(presentation).toHaveAttribute('data-slide-id', 'closing');
  await page.reload();
  await expect(presentation).toHaveAttribute('data-slide-id', 'closing');
  await page.goto('/#opening');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Next slide' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeFocused();
});

test('auto-hides fullscreen controls and reveals them on activity', async ({ page }) => {
  await page.goto('/#opening');
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
  const controls = page.getByTestId('presentation-controls');
  await expect(controls).not.toHaveClass(/is-visible/, { timeout: 4_000 });
  await page.mouse.move(200, 200);
  await expect(controls).toHaveClass(/is-visible/);
});

test('keeps a 16:9 stage at a compact viewport and supports inline interaction', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/#interactive-evidence');
  const shell = page.locator('.op-stage-shell');
  const box = await shell.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(16 / 9, 2);
  await page.getByRole('button', { name: 'Time' }).click();
  await expect(page.locator('.signal-readout')).toContainText('minutes');
  await page.locator('.op-bar-chart g[role="button"]').nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.signal-readout')).toContainText('Review');
});

test('honors reduced motion', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/#opening');
  await expect(page.getByTestId('presentation')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.locator('.op-animated-background')).toHaveAttribute('data-reduced-motion', 'true');
  await context.close();
});

test('keeps representative layouts stage-safe at desktop and compact viewports', async ({ page }) => {
  const ids = ['opening', 'authoring', 'pipeline', 'interactive-evidence', 'charts', 'visual', 'validation', 'closing'];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 900, height: 700 }]) {
    await page.setViewportSize(viewport);
    for (const id of ids) {
      await page.goto(`/#${id}`);
      await expect(page.getByTestId('presentation')).toHaveAttribute('data-slide-id', id);
      const stageSafe = await page.locator('[data-openpresent-slide]').evaluate((slide) =>
        slide.scrollWidth <= slide.clientWidth + 1 && slide.scrollHeight <= slide.clientHeight + 1,
      );
      expect(stageSafe, `${id} at ${viewport.width}x${viewport.height}`).toBe(true);
    }
  }
});
