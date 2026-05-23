import { test, expect } from "@playwright/test";

/**
 * P3 — referenceKind end-to-end against Reserva.
 *
 * Focus = {@code JwtService}. The test fixture picks JwtService because two
 * callers exercise opposite ends of the taxonomy:
 *   - {@code AuthService} (production) invokes {@code jwtService.generateToken}
 *     and {@code .getExpirationSeconds} → INVOCATION (Zap).
 *   - {@code AuthServiceTest} (under src/test/java) declares
 *     {@code @Mock private JwtService jwtService;} and drives it through
 *     {@code when(jwtService.generateToken(...))} → INJECTION (Plug) per the
 *     P3 rule that mock-annotated fields trump body invocations.
 *
 * Tests are off by default ("Mostrar tests" toggle), so we flip them on
 * before the INJECTION assertion. The "Tests OFF" badge is the easiest way
 * to reach the toggle deterministically.
 */
test.describe("03-focus-reference-kind — FOCO PRO point 3 (relation taxonomy)", () => {
  test.setTimeout(180_000);

  test("renders Zap (INVOCATION) and Plug (INJECTION) icons with Spanish tooltips", async ({
    page,
  }) => {
    await page.goto("/?demo=pro");
    await page.getByRole("tab", { name: /Marco Polo PRO/i }).click();

    await page
      .getByPlaceholder(/proyectos\\?mi-proyecto/i)
      .fill("C:\\Users\\ariel\\Reserva\\backend-reserva");
    await page
      .getByPlaceholder(/UserService\.java/i)
      .fill(
        "src/main/java/com/reserva/reservabackend/service/JwtService.java",
      );

    await page.getByRole("button", { name: /Analizar FOCO PRO/i }).click();

    await expect(page.getByTestId("focus-streaming-done")).toBeVisible({
      timeout: 150_000,
    });
    await page.waitForTimeout(800);

    // Tests are hidden by default — flip them on so the AuthServiceTest
    // peripheral renders. The button text starts with "Tests OFF".
    const testsToggle = page.getByRole("button", { name: /Tests OFF/i });
    if (await testsToggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await testsToggle.click();
      await page.waitForTimeout(500);
    }

    const invocationIcons = page.getByTestId("ref-kind-invocation");
    const injectionIcons = page.getByTestId("ref-kind-injection");

    await expect(invocationIcons.first()).toBeVisible({ timeout: 15_000 });
    expect(await invocationIcons.count()).toBeGreaterThanOrEqual(1);

    await expect(injectionIcons.first()).toBeVisible({ timeout: 15_000 });
    expect(await injectionIcons.count()).toBeGreaterThanOrEqual(1);

    // ── Spanish tooltips via the native title attribute ────────────────
    const invocationTitle = await invocationIcons.first().getAttribute("title");
    expect(invocationTitle).toBe("Invoca métodos");

    const injectionTitle = await injectionIcons.first().getAttribute("title");
    expect(injectionTitle).toBe("Inyección sin invocación");

    // Hover sanity — verifies the tooltip target actually receives pointer
    // events. Playwright doesn't expose native title-tooltip text directly
    // (browsers render it OS-level), so the title attribute is the contract.
    await invocationIcons.first().hover();
    await page.waitForTimeout(200);
    await injectionIcons.first().hover();
    await page.waitForTimeout(200);

    await page.screenshot({
      path: "test-results/p3-reference-kinds.png",
      fullPage: false,
    });
  });
});
