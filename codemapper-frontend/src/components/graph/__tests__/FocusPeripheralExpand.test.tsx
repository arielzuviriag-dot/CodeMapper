import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock React Flow's Handle so we don't need a provider context in jsdom.
vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

// The Spy for resolveDemoMode is reassigned per-test; expandPeripheral is
// a vi.fn that returns a controlled shape so we can verify the store call.
const resolveDemoMode = vi.fn<() => "pro" | undefined>();
const expandPeripheral = vi.fn();
vi.mock("@/lib/api", () => ({
  resolveDemoMode: () => resolveDemoMode(),
  expandPeripheral: (...args: unknown[]) => expandPeripheral(...args),
}));

import { FocusPeripheralNode } from "../FocusPeripheralNode";
import { useGraphStore } from "@/store/graphStore";
import type { FocusConnectionPayload } from "@/lib/types";

function makePayload(): FocusConnectionPayload {
  return {
    id: "peripheral-1",
    fullyQualifiedName: "com.demo.UserController",
    name: "UserController",
    packageName: "com.demo",
    type: "CLASS",
    annotations: [],
    connectionType: "CALLED_BY",
    fields: [],
    methods: [],
    position: 0,
    sourceFile: "/tmp/UserController.java",
    isTest: false,
    isMock: false,
    firstSeenAt: 0,
    referenceKind: "INVOCATION",
    depth: 1,
  };
}

/** Renders FocusPeripheralNode the way React Flow would — via the data prop.
 *  We bypass the wrapping NodeProps generics by casting; the component reads
 *  data.payload + data.index and ignores the rest. */
function renderPeripheral(payload: FocusConnectionPayload) {
  const data = { payload, index: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<FocusPeripheralNode {...({ data, id: payload.id, type: "focusPeripheral", selected: false } as any)} />);
}

describe("FocusPeripheralNode P4 expand button", () => {
  beforeEach(() => {
    expandPeripheral.mockReset();
    resolveDemoMode.mockReset();
    useGraphStore.setState({
      sessionId: "session-1",
      focusConnections: [],
      nodes: new Map(),
    });
  });

  it("renders the + Expandir button when demo mode = pro", () => {
    resolveDemoMode.mockReturnValue("pro");
    renderPeripheral(makePayload());
    expect(screen.getByTestId("peripheral-expand")).toBeTruthy();
  });

  it("does NOT render the button when demo mode is undefined", () => {
    resolveDemoMode.mockReturnValue(undefined);
    renderPeripheral(makePayload());
    expect(screen.queryByTestId("peripheral-expand")).toBeNull();
    expect(screen.queryByTestId("peripheral-collapse")).toBeNull();
  });

  it("click → calls expandPeripheral and store.addFocusConnectionsWithDepth(depth=2)", async () => {
    resolveDemoMode.mockReturnValue("pro");
    const newConn: FocusConnectionPayload = { ...makePayload(), id: "depth2-1", fullyQualifiedName: "com.demo.UserRepository", name: "UserRepository" };
    expandPeripheral.mockResolvedValue({
      peripheralFqn: "com.demo.UserController",
      connections: [newConn],
    });
    const addSpy = vi.spyOn(useGraphStore.getState(), "addFocusConnectionsWithDepth");

    renderPeripheral(makePayload());
    fireEvent.click(screen.getByTestId("peripheral-expand"));

    await waitFor(() => {
      expect(expandPeripheral).toHaveBeenCalledWith("session-1", "com.demo.UserController");
    });
    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith([newConn], 2, "com.demo.UserController");
    });
  });

  it("flips to 'Colapsar' once a depth-2 child for this parent is in the store", () => {
    resolveDemoMode.mockReturnValue("pro");
    const child: FocusConnectionPayload = {
      ...makePayload(),
      id: "depth2-child",
      fullyQualifiedName: "com.demo.UserRepository",
      name: "UserRepository",
      depth: 2,
      parentFqn: "com.demo.UserController",
    };
    useGraphStore.setState((s) => ({
      ...s,
      focusConnections: [child],
    }));

    renderPeripheral(makePayload());
    expect(screen.getByTestId("peripheral-collapse")).toBeTruthy();
    expect(screen.queryByTestId("peripheral-expand")).toBeNull();
  });

  it("collapse → removes depth-2 children via removeFocusConnectionsByParent", () => {
    resolveDemoMode.mockReturnValue("pro");
    const child: FocusConnectionPayload = {
      ...makePayload(),
      id: "depth2-child",
      fullyQualifiedName: "com.demo.UserRepository",
      name: "UserRepository",
      depth: 2,
      parentFqn: "com.demo.UserController",
    };
    useGraphStore.setState((s) => ({
      ...s,
      focusConnections: [child],
    }));
    const removeSpy = vi.spyOn(
      useGraphStore.getState(),
      "removeFocusConnectionsByParent",
    );

    renderPeripheral(makePayload());
    fireEvent.click(screen.getByTestId("peripheral-collapse"));
    expect(removeSpy).toHaveBeenCalledWith("com.demo.UserController");
  });
});
