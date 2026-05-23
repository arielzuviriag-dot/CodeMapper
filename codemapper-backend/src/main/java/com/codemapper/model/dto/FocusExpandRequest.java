package com.codemapper.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * P4 — request body for {@code POST /api/analyze/focus/{sessionId}/expand}.
 * The peripheral FQN must already exist in the parent session's
 * parsedClasses (the .java was opened during the level-1 trace); the
 * sub-focus run reuses that file.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class FocusExpandRequest {
    @NotBlank
    private String peripheralFqn;
}
