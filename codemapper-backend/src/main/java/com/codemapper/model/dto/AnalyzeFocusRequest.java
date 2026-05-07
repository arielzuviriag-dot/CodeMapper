package com.codemapper.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class AnalyzeFocusRequest {

    @NotBlank(message = "projectPath is required")
    private String projectPath;

    @NotBlank(message = "focusFile is required")
    private String focusFile;

    private String demoMode;
}
