package com.codemapper.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class AnalyzeGithubRequest {

    @NotBlank(message = "repoUrl is required")
    private String repoUrl;
}
