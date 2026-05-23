import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { FocusDirectionFilter } from "../FocusDirectionFilter";
import { passesDirectionFilter } from "../focusDirection";
import { useGraphStore } from "@/store/graphStore";
import type { FocusConnectionPayload, FocusConnectionType } from "@/lib/types";

/**
 * P2 — verifies that the segmented control flips the store correctly and
 * that the resulting filter — applied to a synthetic six-connection set
 * (3 incoming, 3 outgoing) — leaves only the matching half visible.
 *
 * We test the filter LOGIC alongside the UI instead of rendering FocusGraph
 * (which requires a ReactFlow provider + ResizeObserver polyfills). The
 * radial UI wiring is exercised end-to-end by Playwright.
 */

function makeConn(
  id: string,
  ct: FocusConnectionType,
): FocusConnectionPayload {
  return {
    id,
    fullyQualifiedName: `com.demo.${id}`,
    name: id,
    packageName: "com.demo",
    type: "CLASS",
    annotations: [],
    connectionType: ct,
    fields: [],
    methods: [],
    position: 0,
    sourceFile: `/tmp/${id}.java`,
    isTest: false,
    isMock: false,
    firstSeenAt: 0,
  };
}

const SAMPLE: FocusConnectionPayload[] = [
  makeConn("InService", "CALLED_BY"),
  makeConn("InRunner", "INVOKES_METHOD"),
  makeConn("InAncestor", "EXTENDS"),
  makeConn("OutRepo", "CALLS"),
  makeConn("OutWriter", "INVOKES_OUTGOING"),
  makeConn("OutProps", "USES_PROPERTIES"),
];

function visibleUnderCurrentFilter(): FocusConnectionPayload[] {
  const value = useGraphStore.getState().focusDirectionFilter;
  return SAMPLE.filter((c) => passesDirectionFilter(c.connectionType, value));
}

describe("FocusDirectionFilter", () => {
  beforeEach(() => {
    useGraphStore.setState({ focusDirectionFilter: "all" });
  });

  it("default 'Todo' keeps all six connections", () => {
    render(<FocusDirectionFilter />);
    const all = screen.getByTestId("focus-direction-all");
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(visibleUnderCurrentFilter()).toHaveLength(6);
  });

  it("'Entra' leaves only incoming connection types", () => {
    render(<FocusDirectionFilter />);

    fireEvent.click(screen.getByTestId("focus-direction-incoming"));
    expect(useGraphStore.getState().focusDirectionFilter).toBe("incoming");

    const visible = visibleUnderCurrentFilter();
    expect(visible).toHaveLength(3);
    expect(visible.map((c) => c.connectionType).sort()).toEqual(
      ["CALLED_BY", "EXTENDS", "INVOKES_METHOD"].sort(),
    );
  });

  it("'Sale' leaves only outgoing connection types", () => {
    render(<FocusDirectionFilter />);

    fireEvent.click(screen.getByTestId("focus-direction-outgoing"));
    expect(useGraphStore.getState().focusDirectionFilter).toBe("outgoing");

    const visible = visibleUnderCurrentFilter();
    expect(visible).toHaveLength(3);
    expect(visible.map((c) => c.connectionType).sort()).toEqual(
      ["CALLS", "INVOKES_OUTGOING", "USES_PROPERTIES"].sort(),
    );
  });

  it("clicking 'Todo' after a filter restores the full set", () => {
    render(<FocusDirectionFilter />);

    fireEvent.click(screen.getByTestId("focus-direction-incoming"));
    expect(visibleUnderCurrentFilter()).toHaveLength(3);

    fireEvent.click(screen.getByTestId("focus-direction-all"));
    expect(useGraphStore.getState().focusDirectionFilter).toBe("all");
    expect(visibleUnderCurrentFilter()).toHaveLength(6);
  });
});
