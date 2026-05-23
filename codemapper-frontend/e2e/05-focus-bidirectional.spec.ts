import { test, expect } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * P5 — bidirectional pairs render as two curved arrows that bow apart
 * (curvature ±1) instead of overlapping into a single straight line.
 *
 * Reserva itself doesn't carry a clean bidi case (service / repository /
 * controller layers are one-way by convention), so we ship a temp-fixture
 * mini-project with two mutually-recursive classes (CircularA ↔ CircularB)
 * and point FOCO at CircularA. The trace must produce one CALLS edge to
 * CircularB and one CALLED_BY edge from CircularB; both paths must contain
 * a quadratic-bezier `Q` command, and the two control points must sit on
 * opposite sides of the focus↔peripheral axis.
 */
test.describe("05-focus-bidirectional — FOCO PRO point 5 (curved bidi edges)", () => {
  test.setTimeout(180_000);

  let tmpProject: string;

  test.beforeAll(() => {
    tmpProject = mkdtempSync(join(tmpdir(), "cm-bidi-"));
    const javaDir = join(tmpProject, "src", "main", "java", "com", "demo");
    mkdirSync(javaDir, { recursive: true });
    writeFileSync(
      join(javaDir, "CircularA.java"),
      [
        "package com.demo;",
        "public class CircularA {",
        "  private CircularB b;",
        "  public void doA() { b.doB(); }",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(javaDir, "CircularB.java"),
      [
        "package com.demo;",
        "public class CircularB {",
        "  private CircularA a;",
        "  public void doB() { a.doA(); }",
        "}",
        "",
      ].join("\n"),
    );
  });

  test.afterAll(() => {
    if (tmpProject) {
      rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test("renders two bowed paths between focus and the mutual peripheral", async ({ page }) => {
    await page.goto("/?demo=pro");
    await page.getByRole("tab", { name: /Marco Polo PRO/i }).click();

    await page
      .getByPlaceholder(/proyectos\\?mi-proyecto/i)
      .fill(tmpProject);
    await page
      .getByPlaceholder(/UserService\.java/i)
      .fill("src/main/java/com/demo/CircularA.java");
    await page.getByRole("button", { name: /Analizar FOCO PRO/i }).click();

    await expect(page.getByTestId("focus-streaming-done")).toBeVisible({
      timeout: 60_000,
    });
    await page.waitForTimeout(800);

    // Sanity — fixture should give us exactly one peripheral (CircularB)
    // since CircularA is the focus.
    const peripheral = page.locator(
      '[data-testid="focus-peripheral"][data-depth="1"]',
    );
    await expect(peripheral.first()).toBeVisible({ timeout: 15_000 });
    expect(await peripheral.count()).toBe(1);

    // Debug — dump the store's focusConnections so a regression in the
    // backend's bidi emission or the frontend dedupe shows up as a clear
    // assertion failure.
    const dump = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__cmStore;
      if (!store) return { exposed: false } as const;
      const state = store.getState();
      return {
        exposed: true,
        focusConnectionsCount: state.focusConnections.length,
        connectionTypes: state.focusConnections.map((c: { connectionType: string }) => c.connectionType),
        edgeGrouping: state.edgeGrouping,
        focusDirectionFilter: state.focusDirectionFilter,
        focusConnectionTypeFilters: state.filters.focusConnectionTypeFilters,
      } as const;
    });
    // The store MUST be exposed AND carry both directions. If one is missing,
    // the surrounding layout work has nothing to render bidi on.
    expect(dump.exposed, "useGraphStore must be exposed via window.__cmStore for diagnostics").toBe(true);
    if (dump.exposed) {
      expect(
        dump.connectionTypes.includes("CALLED_BY") && dump.connectionTypes.includes("CALLS"),
        `store must hold both directions, got ${JSON.stringify(dump)}`,
      ).toBe(true);
    }

    // Grab all rendered edge paths via attribute read — toBeVisible on the
    // <path> itself is flaky because SVG visibility computes "hidden" while
    // ReactFlow is hydrating the edge layer. Waiting for the element to be
    // attached and then reading its d-attr is enough.
    const edgePaths = page.locator("path.cm-focus-edge-path");
    await edgePaths.first().waitFor({ state: "attached", timeout: 10_000 });
    await page.waitForTimeout(1_500); // let the wall-clock draw animation settle
    const allD = await edgePaths.evaluateAll((nodes) =>
      nodes.map((n) => ({
        id: (n.closest('[data-id]') as HTMLElement | null)?.dataset?.id ?? null,
        d: n.getAttribute("d") ?? "",
      })),
    );
    // Log diagnostics to stdout so failures don't truncate them in the
    // Playwright error context.
    // eslint-disable-next-line no-console
    console.log("[P5 DIAG] store dump:", JSON.stringify(dump));
    // eslint-disable-next-line no-console
    console.log("[P5 DIAG] edge paths:", JSON.stringify(allD, null, 2));
    expect(allD.length).toBeGreaterThanOrEqual(2);
    const bowedPaths = allD.filter((p) => /\bQ\b/.test(p.d));
    expect(bowedPaths.length).toBeGreaterThanOrEqual(2);

    // Parse out the two control points and assert they live on opposite
    // sides of the source→target axis. The d-attr layout we emit is
    // `M sx,sy Q cpx,cpy tx,ty`. Compute signed cross product of the
    // source→target vector with source→cp — the bows differ in sign.
    function parseQ(d: string): { sx: number; sy: number; cpx: number; cpy: number; tx: number; ty: number } | null {
      // Accept scientific notation (e.g. 5.79e-15) — ReactFlow's coordinates
      // pass through floating point that the path serializer may emit with
      // exponents on tiny values near zero.
      const num = "[-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?";
      const re = new RegExp(`M\\s*(${num}),(${num})\\s*Q\\s*(${num}),(${num})\\s*(${num}),(${num})`);
      const m = d.match(re);
      if (!m) return null;
      return {
        sx: parseFloat(m[1]),
        sy: parseFloat(m[2]),
        cpx: parseFloat(m[3]),
        cpy: parseFloat(m[4]),
        tx: parseFloat(m[5]),
        ty: parseFloat(m[6]),
      };
    }
    const parsed = bowedPaths.map((p) => parseQ(p.d)).filter((x): x is NonNullable<ReturnType<typeof parseQ>> => x !== null);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    function cross(p: NonNullable<ReturnType<typeof parseQ>>): number {
      const dx = p.tx - p.sx;
      const dy = p.ty - p.sy;
      const cx = p.cpx - p.sx;
      const cy = p.cpy - p.sy;
      return dx * cy - dy * cx;
    }
    const signs = parsed.map((p) => Math.sign(cross(p)));
    expect(
      signs.includes(1) && signs.includes(-1),
      `expected control points on opposite sides — got signs ${JSON.stringify(signs)}`,
    ).toBe(true);

    await page.screenshot({
      path: "test-results/p5-bidirectional.png",
      fullPage: false,
    });
  });
});
