import { test, expect } from "@playwright/test";

/**
 * P2 — directional filter end-to-end against the real Reserva project.
 * We aim at {@code AppointmentService}, which has at least 3 CALLED_BY
 * peripherals (AppointmentController, BusinessAppointmentController,
 * AppointmentReviewPromptJob) and multiple CALLS to repositories/services
 * (serviceRepository, profileRepository, customerQuotaService, ...). Both
 * the incoming and outgoing buckets have ≥2 entries, so the filter test
 * is meaningful in both directions.
 */
test.describe("02-focus-direction — FOCO PRO point 2 (incoming/outgoing filter)", () => {
  test.setTimeout(180_000);

  test("filters the radial graph by direction (Entra / Sale / Todo)", async ({ page }) => {
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

    // Snapshot the initial peripheral counts so we can assert "Todo" restores
    // the original picture. We use peripheral nodes (data-testid attached
    // by FocusPeripheralNode) — they expose the direction via a data attr,
    // which makes the assertions stable across edge-layer churn.
    const allPeripherals = page.getByTestId("focus-peripheral");
    const incomingPeripherals = page.locator(
      '[data-testid="focus-peripheral"][data-direction="incoming"]',
    );
    const outgoingPeripherals = page.locator(
      '[data-testid="focus-peripheral"][data-direction="outgoing"]',
    );

    const initialTotal = await allPeripherals.count();
    const initialIncoming = await incomingPeripherals.count();
    const initialOutgoing = await outgoingPeripherals.count();
    expect(
      initialIncoming,
      "fixture invariant: AppointmentService must have ≥2 incoming peripherals",
    ).toBeGreaterThanOrEqual(2);
    expect(
      initialOutgoing,
      "fixture invariant: AppointmentService must have ≥2 outgoing peripherals",
    ).toBeGreaterThanOrEqual(2);

    await page.screenshot({ path: "test-results/p2-all.png", fullPage: false });

    // ── ← Entra ──────────────────────────────────────────────────────────
    await page.getByTestId("focus-direction-incoming").click();
    await page.waitForTimeout(400);
    await expect(outgoingPeripherals).toHaveCount(0);
    const incomingVisible = await incomingPeripherals.count();
    expect(incomingVisible).toBe(initialIncoming);
    await page.screenshot({
      path: "test-results/p2-incoming.png",
      fullPage: false,
    });

    // ── Sale → ───────────────────────────────────────────────────────────
    await page.getByTestId("focus-direction-outgoing").click();
    await page.waitForTimeout(400);
    await expect(incomingPeripherals).toHaveCount(0);
    const outgoingVisible = await outgoingPeripherals.count();
    expect(outgoingVisible).toBe(initialOutgoing);
    await page.screenshot({
      path: "test-results/p2-outgoing.png",
      fullPage: false,
    });

    // ── Todo (restore) ──────────────────────────────────────────────────
    await page.getByTestId("focus-direction-all").click();
    await page.waitForTimeout(400);
    await expect(allPeripherals).toHaveCount(initialTotal);
    await expect(incomingPeripherals).toHaveCount(initialIncoming);
    await expect(outgoingPeripherals).toHaveCount(initialOutgoing);
  });
});
