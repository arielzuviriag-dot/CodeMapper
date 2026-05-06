package com.codemapper.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class AnalyzePathRequest {

    @NotBlank(message = "absolutePath is required")
    private String absolutePath;

    private String demoMode;
}
