package com.codemapper.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * "If I change this Java, what blows up?" — F4 contract.
 *
 * <ul>
 *   <li>{@link #totalImpact}: total distinct classes that transitively depend
 *   on the focus (direct + N-level callers, deduped).</li>
 *   <li>{@link #totalTests}: subset of {@link #totalImpact} that lives under
 *   {@code /test/java/} — the test surface that needs re-running.</li>
 *   <li>{@link #hasCycles}: true when at least one caller chain comes back
 *   to the focus, signalling circular coupling.</li>
 *   <li>{@link #directCallers}: FQN list of level-1 callers (for the "naranja
 *   sólido" highlight in the simulate-change overlay).</li>
 *   <li>{@link #transitiveCallers}: FQN list of level-2+ callers (for the
 *   tenuous orange tint).</li>
 *   <li>{@link #affectedTests}: FQN list of test classes that depend on the
 *   focus directly or transitively. Drives the pulsing red outline.</li>
 *   <li>{@link #cycles}: when {@link #hasCycles} is true, the FQN paths that
 *   loop back to the focus. Empty otherwise. Path is ordered focus → ... →
 *   focus.</li>
 * </ul>
 *
 * FREE mode: only the three count/flag fields ship populated; the four list
 * fields come back empty. PRO mode ships everything so the frontend can
 * render the full simulate-change view.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ImpactReport {
    private int totalImpact;
    private int totalTests;
    private boolean hasCycles;
    private List<String> directCallers;
    private List<String> transitiveCallers;
    private List<String> affectedTests;
    private List<List<String>> cycles;
}
