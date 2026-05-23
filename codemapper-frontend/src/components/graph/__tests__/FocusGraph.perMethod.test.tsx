import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { buildFocusEdgeDescriptors } from "../focusGraphGrouping";
import { FocusConnectionLegend } from "../FocusConnectionLegend";
import { useGraphStore } from "@/store/graphStore";
import type { FocusConnectionPayload } from "@/lib/types";

/**
 * P1 — vitest coverage of the per-method edge model.
 *
 * The pure-data layer (`buildFocusEdgeDescriptors`) and the toggle UX
 * (`FocusConnectionLegend` + `edgeGrouping` store action) are both exercised
 * here so a regression in either surface shows up in the green/red column
 * before Playwright fires up Chromium. The graph rendering itself is
 * verified end-to-end by `e2e/focus-per-method.spec.ts`.
 */

function makeConn(overrides: Partial<FocusConnectionPayload>): FocusConnectionPayload {
  return {
    id: "peripheral-1",
    fullyQualifiedName: "com.demo.UserService",
    name: "UserService",
    packageName: "com.demo",
    type: "CLASS",
    annotations: [],
    connectionType: "CALLED_BY",
    fields: [],
    methods: [],
    position: 1,
    sourceFile: "/tmp/UserService.java",
    viaMethodInSource: "create",
    viaMethodInTarget: "save",
    isTest: false,
    isMock: false,
    firstSeenAt: 1700000000000,
    ...overrides,
  };
}

describe("buildFocusEdgeDescriptors (P1 grouping)", () => {
  it("emits one descriptor per (peripheral, invoked method) in method mode", () => {
    const connections = [
      makeConn({ viaMethodInTarget: "save", viaMethodInSource: "create" }),
      makeConn({ viaMethodInTarget: "delete", viaMethodInSource: "remove" }),
      makeConn({ viaMethodInTarget: "find", viaMethodInSource: "create" }),
    ];

    const descriptors = buildFocusEdgeDescriptors(connections, "method");

    expect(descriptors).toHaveLength(3);
    expect(descriptors.map((d) => d.connection.viaMethodInTarget)).toEqual([
      "save",
      "delete",
      "find",
    ]);
    // All three are siblings of the same (focus, peripheral-1) pair.
    expect(descriptors.every((d) => d.siblingCount === 3)).toBe(true);
    expect(descriptors.map((d) => d.siblingIndex)).toEqual([0, 1, 2]);
    expect(descriptors.every((d) => d.aggregatedMethods === null)).toBe(true);
    // Edge ids are stable + distinct so ReactFlow doesn't see them as the
    // same edge and tear down the animation.
    const ids = descriptors.map((d) => d.edgeId);
    expect(new Set(ids).size).toBe(3);
  });

  it("collapses the group into one descriptor with aggregatedMethods in class mode", () => {
    const connections = [
      makeConn({ viaMethodInTarget: "save" }),
      makeConn({ viaMethodInTarget: "delete" }),
      makeConn({ viaMethodInTarget: "find" }),
    ];

    const descriptors = buildFocusEdgeDescriptors(connections, "class");

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].aggregatedMethods).toEqual(["save", "delete", "find"]);
    expect(descriptors[0].siblingCount).toBe(1);
    expect(descriptors[0].siblingIndex).toBe(0);
  });

  it("preserves connections across multiple peripheral classes", () => {
    const connections = [
      makeConn({ id: "peripheral-1", viaMethodInTarget: "save" }),
      makeConn({ id: "peripheral-1", viaMethodInTarget: "delete" }),
      makeConn({ id: "peripheral-2", viaMethodInTarget: "find" }),
    ];

    const method = buildFocusEdgeDescriptors(connections, "method");
    const klass = buildFocusEdgeDescriptors(connections, "class");

    expect(method).toHaveLength(3);
    expect(method.filter((d) => d.classId === "peripheral-1")).toHaveLength(2);
    expect(method.filter((d) => d.classId === "peripheral-2")).toHaveLength(1);

    expect(klass).toHaveLength(2);
    const p1 = klass.find((d) => d.classId === "peripheral-1")!;
    expect(p1.aggregatedMethods).toEqual(["save", "delete"]);
  });
});

describe("FocusConnectionLegend edge-grouping toggle", () => {
  beforeEach(() => {
    // Reset the relevant slice before each test so state doesn't leak.
    useGraphStore.setState({ edgeGrouping: "method" });
  });

  it("flips the store between method and class on click", () => {
    render(<FocusConnectionLegend />);

    expect(useGraphStore.getState().edgeGrouping).toBe("method");
    expect(
      screen.getByTestId("edge-grouping-method").getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByTestId("edge-grouping-class"));
    expect(useGraphStore.getState().edgeGrouping).toBe("class");
    expect(
      screen.getByTestId("edge-grouping-class").getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByTestId("edge-grouping-method"));
    expect(useGraphStore.getState().edgeGrouping).toBe("method");
  });
});
