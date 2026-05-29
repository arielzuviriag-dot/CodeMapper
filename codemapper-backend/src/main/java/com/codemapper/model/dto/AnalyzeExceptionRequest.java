package com.codemapper.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class AnalyzeExceptionRequest {

    @NotBlank(message = "projectPath is required")
    private String projectPath;

    @NotBlank(message = "stackTrace is required")
    private String stackTrace;

    /** Optional — absolute path to a React Native project to link mobile
     *  screens to the backend endpoints in the chain. */
    private String mobilePath;

    private String demoMode;
}
