package com.codemapper.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class AnalyzePathRequest {

    @NotBlank(message = "absolutePath is required")
    private String absolutePath;

    /** Optional absolute path to the front-end project (web or React Native).
     *  When present, the analysis links its screens → backend controllers. */
    private String frontendPath;

    /** "web" | "react-native". Context for the front-end scan. */
    private String frontendKind;

    private String demoMode;
}
