import { test, expect } from '@playwright/test';

/**
 * Smoke test mínimo — verifica que Chromium abre, navega al frontend y la
 * página responde HTTP 200. Este test existe para que `validate.ps1` cierre
 * el ciclo end-to-end (backend + frontend + browser) aunque todavía no
 * tengamos tests reales de los 5 puntos.
 */
test('frontend root responds', async ({ page }) => {
  const response = await page.goto('/');
  expect(response, 'page.goto returned null').not.toBeNull();
  expect(response!.status(), 'unexpected HTTP status').toBeLessThan(500);
});
