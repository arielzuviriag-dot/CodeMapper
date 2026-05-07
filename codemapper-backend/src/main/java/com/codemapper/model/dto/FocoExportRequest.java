package com.codemapper.model.dto;

import com.codemapper.model.event.FocusClassLoadedEvent;
import com.codemapper.model.event.FocusConnectionEvent;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Body of {@code POST /api/foco/export/pdf}. The frontend sends the exact
 * data it has in its store (the same payloads the SSE stream produced),
 * plus a couple of context flags. The backend renders a PDF — it does NOT
 * re-analyze or re-fetch anything. This guarantees the PDF mirrors what the
 * user sees, including the FREE limit.
 */
@Data
@NoArgsConstructor
public class FocoExportRequest {
    /** The focus class as streamed by `focus_class_loaded`. */
    private FocusClassLoadedEvent focusClass;
    /** Level-1 connections as streamed by `connection_found`, in arrival order. */
    private List<FocusConnectionEvent> connections;
    /** Whether the session was running with `?demo=pro` (no limit). */
    private boolean pro;
    /** True if the FREE limit truncated the connection list. */
    private boolean limitApplied;
    /** Total connections detected before the FREE truncation (used in the warning). */
    private int totalAvailable;
}
