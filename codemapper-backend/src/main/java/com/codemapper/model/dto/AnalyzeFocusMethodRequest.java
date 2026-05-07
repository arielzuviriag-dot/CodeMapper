package com.codemapper.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class AnalyzeFocusMethodRequest {

    @NotBlank(message = "projectPath is required")
    private String projectPath;

    @NotBlank(message = "focusFile is required")
    private String focusFile;

    @NotBlank(message = "methodName is required")
    private String methodName;

    private String demoMode;
}
