import { test, expect } from "@playwright/test";

/**
 * P1 — verifies the per-method edge model end-to-end against a real backend
 * + browser. We point FOCO at a Reserva @Service with 30+ Repository
 * invocations (com.reserva.reservabackend.service.AppointmentService →
 * AppointmentRepository) so the per-method dedupe surfaces multiple
 * distinct edges between the same (focus, peripheral) pair. Reserva itself
 * stays read-only — we only pass its path into the analyzer.
 *
 * The flow uses the "Marco Polo PRO" tab to jump straight into FOCUS mode
 * with PRO enabled (no FREE cap to interfere). This is a strict superset of
 * the per-method UX exercised by the LocalPath→Foco Scaner path: the radial
 * graph that ships is identical regardless of entry, and skipping the
 * intermediate full-project graph keeps the test inside the global 120s
 * timeout without padding.
 */
test.describe("01-focus-per-method — FOCO PRO point 1 (one edge per invoked method)", () => {
  test.setTimeout(180_000);

  test("renders per-method edges, then collapses with the Por clase toggle", async ({
    page,
  }) => {
    await page.goto("/?demo=pro");

    // Switch to the Marco Polo PRO tab that targets FOCUS mode in PRO.
    await page.getByRole("tab", { name: /Marco Polo PRO/i }).click();

    // Project root + focus file. Path style mirrors what the dev would paste
    // from Windows Explorer.
    await page
      .getByPlaceholder(/proyectos\\?mi-proyecto/i)
      .fill("C:\\Users\\ariel\\Reserva\\backend-reserva");
    await page
      .getByPlaceholder(/UserService\.java/i)
      .fill(
        "src/main/java/com/reserva/reservabackend/service/AppointmentService.java",
      );

    await page.getByRole("button", { name: /Analizar FOCO PRO/i }).click();

    // SSE complete — drives every downstream assertion. 150s for slow boxes.
    await expect(page.getByTestId("focus-streaming-done")).toBeVisible({
      timeout: 150_000,
    });
    // Give the radial layout a beat to settle so edge labels are positioned.
    await page.waitForTimeout(800);

    // ── Por método (default) ──────────────────────────────────────────────
    const viaLabels = page.getByTestId("focus-edge-via-label");
    await expect(viaLabels.first()).toBeVisible({ timeout: 30_000 });
    const labelTexts = (await viaLabels.allInnerTexts()).map((t) =>
      t.trim(),
    );
    // Pure method labels look like "save()" / "findById()" — the dedupe
    // means siblings inside the same (focus, peripheral) group are distinct.
    const methodLabels = labelTexts.filter((t) => /^\w+\(\)$/.test(t));
    const distinct = new Set(methodLabels);
    expect(
      distinct.size,
      `expected at least 2 distinct per-method labels, got ${methodLabels.length} total / ${distinct.size} distinct`,
    ).toBeGreaterThanOrEqual(2);

    await page.screenshot({
      path: "test-results/p1-per-method.png",
      fullPage: false,
    });

    // ── Por clase ─────────────────────────────────────────────────────────
    await page.getByTestId("edge-grouping-class").click();
    await page.waitForTimeout(500);

    const badges = page.getByTestId("aggregated-methods-badge");
    await expect(badges.first()).toBeVisible({ timeout: 5_000 });
    await expect(badges.first()).toContainText(/\+\d+ métodos/);

    // Tooltip via the badge's title attribute (which lists the method names
    // joined by newlines — that's what the dev sees on hover).
    const tooltip = await badges.first().getAttribute("title");
    expect(
      tooltip,
      "aggregated badge must expose its methods via the title tooltip",
    ).toBeTruthy();
    expect(tooltip!.split("\n").length).toBeGreaterThanOrEqual(2);

    await page.screenshot({
      path: "test-results/p1-per-clase.png",
      fullPage: false,
    });
  });
});
