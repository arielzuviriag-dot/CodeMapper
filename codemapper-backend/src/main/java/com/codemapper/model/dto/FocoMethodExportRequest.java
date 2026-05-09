package com.codemapper.model.dto;

import com.codemapper.model.event.FocusConnectionEvent;
import com.codemapper.model.event.FocusMethodLoadedEvent;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Body of {@code POST /api/foco/export/method-pdf}. Mirror of
 * {@link FocoExportRequest} but anchored on a focus METHOD instead of a
 * focus class. The frontend ships exactly what its store has (method
 * payload + connections it received via SSE) and the backend renders the
 * PDF — no re-analysis, no I/O. Guarantees the PDF mirrors the visible
 * graph including the FREE-tier truncation.
 */
@Data
@NoArgsConstructor
public class FocoMethodExportRequest {
    /** The focus method as streamed by `focus_method_loaded`. */
    private FocusMethodLoadedEvent focusMethod;
    /** Method-context connections as streamed by `connection_found`, in
     *  arrival order. Expected types: INVOKES_METHOD (incoming callers)
     *  and INVOKES_OUTGOING (outgoing calls from inside the method body). */
    private List<FocusConnectionEvent> connections;
    /** Whether the session was running with `?demo=pro` (no limit). */
    private boolean pro;
    /** True if the FREE limit truncated the connection list. */
    private boolean limitApplied;
    /** Total connections detected before the FREE truncation (used in the warning). */
    private int totalAvailable;
}
