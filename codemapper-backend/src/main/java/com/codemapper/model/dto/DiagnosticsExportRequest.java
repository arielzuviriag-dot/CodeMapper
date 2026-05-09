package com.codemapper.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Body of the diagnostics PDF export endpoint. The frontend ships the data
 * the user is currently looking at (the contents of the DiagnosticsPanel)
 * and the backend renders it as a printable report. Stateless: no
 * re-analysis happens server-side.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DiagnosticsExportRequest {
    /** Simple class name of the focus (used in the title and filename). */
    private String focusName;
    /** Fully-qualified name of the focus (printed under the title). */
    private String focusFqn;
    /** Optional project name (printed in the header). */
    private String projectName;
    /** Optional detected Java version (printed in the header). */
    private String javaVersion;
    /** True when the user is on PRO. The PDF service uses this to decide
     *  whether to cap the detail to {@code FREE_DIAGNOSTICS_LIMIT} items
     *  with a locked PRO section, or render the full list. The header
     *  totals stay honest in both modes. */
    private boolean pro;
    /** Pre-grouped or flat list of findings. The service splits them by
     *  {@link UnresolvedReference#getKind()} when rendering. */
    private List<UnresolvedReference> diagnostics;
}
