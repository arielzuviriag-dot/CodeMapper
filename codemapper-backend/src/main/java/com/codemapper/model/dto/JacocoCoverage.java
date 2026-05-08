package com.codemapper.model.dto;

import java.util.Map;

/**
 * Snapshot of a Jacoco line-coverage report, indexed for quick lookup by
 * the FOCO event emitter. Both maps key on FQN ("com.foo.Bar") so the
 * FocusTracerService can resolve coverage with a single get() per emitted
 * focus class — no path traversal in the hot loop.
 *
 * @param classCoverage   FQN → percent (0–100). Missing FQN means no data.
 * @param methodCoverage  "FQN.methodName" → percent (0–100). Method-level
 *                        granularity for the future drill-down sheet.
 */
public record JacocoCoverage(
        Map<String, Double> classCoverage,
        Map<String, Double> methodCoverage
) {
    public Double classPercent(String fqn) {
        return classCoverage.get(fqn);
    }
}
