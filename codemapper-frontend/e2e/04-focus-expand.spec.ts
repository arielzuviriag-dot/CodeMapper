import { test, expect } from "@playwright/test";

/**
 * P4 — on-demand depth-2 expansion against Reserva.
 *
 * The PRO case focuses on AppointmentService, expands the first CALLED_BY
 * peripheral (an Appointment*Controller), and asserts that depth-2 nodes
 * show up with a visibly dimmer treatment. Collapse must remove them. The
 * sub-test reuses the same focus in FREE mode and verifies the "+ Expandir"
 * button is gated behind PRO.
 */
test.describe("04-focus-expand — FOCO PRO point 4 (depth-2 expansion)", () => {
  test.setTimeout(240_000);

  test("PRO: expand → depth-2 nodes appear, collapse → they vanish", async ({ page }) => {
    await page.goto("/?demo=pro");
    await page.getByRole("tab", { name: /Marco Polo PRO/i }).click();

    await page
      .getByPlaceholder(/proyectos\\?mi-proyecto/i)
      .fill("C:\\Users\\ariel\\Reserva\\backend-reserva");
    await page
      .getByPlaceholder(/UserService\.java/i)
      .fill(
        "src/main/java/com/reserva/reservabackend/service/AppointmentService.java",
      );
    await page.getByRole("button", { name: /Analizar FOCO PRO/i }).click();

    await expect(page.getByTestId("focus-streaming-done")).toBeVisible({
      timeout: 150_000,
    });
    await page.waitForTimeout(800);

    const depth1 = page.locator(
      '[data-testid="focus-peripheral"][data-depth="1"]',
    );
    const expandButtons = page.getByTestId("peripheral-expand");
    await expect(expandButtons.first()).toBeVisible({ timeout: 20_000 });
    const depth1CountBefore = await depth1.count();
    expect(depth1CountBefore).toBeGreaterThan(0);

    await expandButtons.first().click();

    const depth2 = page.locator(
      '[data-testid="focus-peripheral"][data-depth="2"]',
    );
    await expect(depth2.first()).toBeVisible({ timeout: 60_000 });
    const depth2Count = await depth2.count();
    expect(depth2Count).toBeGreaterThanOrEqual(1);

    // depth-1 set should not have changed (no rebalancing on expand).
    expect(await depth1.count()).toBe(depth1CountBefore);

    // depth-2 cards opacity 0.85 set inline by FocusPeripheralNode — verify
    // the data-depth is set; the value itself is a styling concern.
    const opacity = await depth2.first().evaluate(
      (el) => window.getComputedStyle(el).opacity,
    );
    expect(parseFloat(opacity)).toBeLessThan(1);

    await page.screenshot({
      path: "test-results/p4-expanded.png",
      fullPage: false,
    });

    // ── Collapse ─────────────────────────────────────────────────────────
    const collapseButton = page.getByTestId("peripheral-collapse").first();
    await expect(collapseButton).toBeVisible({ timeout: 5_000 });
    await collapseButton.click();
    await expect(depth2).toHaveCount(0, { timeout: 5_000 });
    expect(await depth1.count()).toBe(depth1CountBefore);

    await page.screenshot({
      path: "test-results/p4-collapsed.png",
      fullPage: false,
    });
  });

  test("FREE: no '+ Expandir' button present on any peripheral", async ({ page, context }) => {
    // Wipe any leftover demoMode from a prior PRO run before navigating —
    // resolveDemoMode falls back to sessionStorage when the URL has no
    // ?demo=pro, and we explicitly want FREE for this case.
    await context.clearCookies();
    await page.addInitScript(() => {
      try { sessionStorage.removeItem("cm-demo-mode"); } catch { /* noop */ }
    });
    await page.goto("/");

    await page.getByRole("tab", { name: /^Marco Polo$/i }).click();

    await page
      .getByPlaceholder(/proyectos\\?mi-proyecto/i)
      .fill("C:\\Users\\ariel\\Reserva\\backend-reserva");
    await page
      .getByPlaceholder(/UserService\.java/i)
      .fill(
        "src/main/java/com/reserva/reservabackend/service/AppointmentService.java",
      );
    await page.getByRole("button", { name: /Analizar FOCO/i }).click();

    await expect(page.getByTestId("focus-streaming-done")).toBeVisible({
      timeout: 150_000,
    });
    await page.waitForTimeout(800);

    // Peripherals do render under FREE (just capped at 10) — the button
    // is what must be absent across all of them.
    const peripherals = page.getByTestId("focus-peripheral");
    await expect(peripherals.first()).toBeVisible({ timeout: 20_000 });
    expect(await peripherals.count()).toBeGreaterThan(0);
    await expect(page.getByTestId("peripheral-expand")).toHaveCount(0);
    await expect(page.getByTestId("peripheral-collapse")).toHaveCount(0);
  });
});
