import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  ReferenceKindIcon,
  REFERENCE_KIND_META,
} from "../FocusEdge";
import type { FocusReferenceKind } from "@/lib/types";

/**
 * P3 — verifies that each referenceKind value renders the correct lucide
 * icon and the correct Spanish tooltip. The icon component is exported
 * standalone so vitest can mount it without spinning up ReactFlow.
 */
describe("ReferenceKindIcon (P3 reference-kind taxonomy)", () => {
  const cases: { kind: FocusReferenceKind; testId: string; tooltip: string }[] = [
    { kind: "INVOCATION", testId: "ref-kind-invocation", tooltip: "Invoca métodos" },
    { kind: "INSTANTIATION", testId: "ref-kind-instantiation", tooltip: "Crea instancias" },
    { kind: "INJECTION", testId: "ref-kind-injection", tooltip: "Inyección sin invocación" },
    { kind: "DECLARATION", testId: "ref-kind-declaration", tooltip: "Solo declaración de tipo" },
  ];

  it.each(cases)(
    "$kind → testid $testId with Spanish tooltip $tooltip",
    ({ kind, testId, tooltip }) => {
      const { unmount } = render(<ReferenceKindIcon kind={kind} />);
      const badge = screen.getByTestId(testId);
      expect(badge.getAttribute("title")).toBe(tooltip);
      expect(badge.getAttribute("aria-label")).toBe(tooltip);
      expect(badge.getAttribute("data-reference-kind")).toBe(kind);
      // The icon itself is an svg child of the badge.
      expect(badge.querySelector("svg")).not.toBeNull();
      unmount();
    },
  );

  it("renders nothing when kind is null or undefined", () => {
    const { container, rerender } = render(<ReferenceKindIcon kind={null} />);
    expect(container.firstChild).toBeNull();
    rerender(<ReferenceKindIcon kind={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("REFERENCE_KIND_META covers all four kinds exactly once", () => {
    expect(Object.keys(REFERENCE_KIND_META).sort()).toEqual(
      ["DECLARATION", "INJECTION", "INSTANTIATION", "INVOCATION"],
    );
  });
});
