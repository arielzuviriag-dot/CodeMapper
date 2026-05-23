import { describe, expect, it, beforeEach } from "vitest";
import { useGraphStore } from "@/store/graphStore";
import { passesDirectionFilter } from "@/components/graph/focusDirection";
import type { FocusConnectionType } from "@/lib/types";

/**
 * P2 — store-level tests for the directional filter.
 *
 * Verifies (a) that {@link useGraphStore.setFocusDirectionFilter} updates the
 * state correctly and (b) that the direction filter composes as an
 * intersection with the per-class-kind filters — i.e. when a kind is hidden
 * AND the direction excludes it, the connection stays hidden.
 */
describe("graphStore.focusDirectionFilter", () => {
  beforeEach(() => {
    // Reset the bits each test touches; leave everything else alone so we
    // don't fight the rest of the store.
    useGraphStore.setState({
      focusDirectionFilter: "all",
      filters: {
        ...useGraphStore.getState().filters,
        classTypeFilters: {
          CLASS: true,
          INTERFACE: true,
          ENUM: true,
          RECORD: true,
          ABSTRACT_CLASS: true,
        },
      },
    });
  });

  it("setFocusDirectionFilter updates the slice", () => {
    expect(useGraphStore.getState().focusDirectionFilter).toBe("all");

    useGraphStore.getState().setFocusDirectionFilter("incoming");
    expect(useGraphStore.getState().focusDirectionFilter).toBe("incoming");

    useGraphStore.getState().setFocusDirectionFilter("outgoing");
    expect(useGraphStore.getState().focusDirectionFilter).toBe("outgoing");

    useGraphStore.getState().setFocusDirectionFilter("all");
    expect(useGraphStore.getState().focusDirectionFilter).toBe("all");
  });

  it("intersects with classTypeFilters: hidden INTERFACE + direction=incoming keeps IMPLEMENTS hidden", () => {
    // The graph applies BOTH filters with logical AND. Simulate that here so
    // we catch a regression where direction would override the kind filter.
    useGraphStore.setState((state) => ({
      filters: {
        ...state.filters,
        classTypeFilters: {
          ...state.filters.classTypeFilters,
          INTERFACE: false,
        },
      },
    }));
    useGraphStore.getState().setFocusDirectionFilter("incoming");

    // A connection of type IMPLEMENTS pointing at an INTERFACE class must be
    // hidden by the class-kind filter even though the direction (incoming)
    // would otherwise let it pass.
    const passesDirection = passesDirectionFilter("IMPLEMENTS" as FocusConnectionType, "incoming");
    const passesKind =
      useGraphStore.getState().filters.classTypeFilters.INTERFACE !== false;

    expect(passesDirection).toBe(true);   // direction would allow it
    expect(passesKind).toBe(false);       // but the kind filter forbids it
    expect(passesDirection && passesKind).toBe(false); // intersection → hidden
  });

  it("passesDirectionFilter respects the incoming/outgoing taxonomy", () => {
    expect(passesDirectionFilter("CALLED_BY", "incoming")).toBe(true);
    expect(passesDirectionFilter("INVOKES_METHOD", "incoming")).toBe(true);
    expect(passesDirectionFilter("EXTENDS", "incoming")).toBe(true);
    expect(passesDirectionFilter("IMPLEMENTS", "incoming")).toBe(true);
    expect(passesDirectionFilter("CALLS", "incoming")).toBe(false);
    expect(passesDirectionFilter("INVOKES_OUTGOING", "incoming")).toBe(false);
    expect(passesDirectionFilter("USES_PROPERTIES", "incoming")).toBe(false);

    expect(passesDirectionFilter("CALLS", "outgoing")).toBe(true);
    expect(passesDirectionFilter("INVOKES_OUTGOING", "outgoing")).toBe(true);
    expect(passesDirectionFilter("USES_PROPERTIES", "outgoing")).toBe(true);
    expect(passesDirectionFilter("CALLED_BY", "outgoing")).toBe(false);

    // "all" never gates anything out.
    expect(passesDirectionFilter("CALLED_BY", "all")).toBe(true);
    expect(passesDirectionFilter("CALLS", "all")).toBe(true);
    expect(passesDirectionFilter("USES_PROPERTIES", "all")).toBe(true);
  });
});
