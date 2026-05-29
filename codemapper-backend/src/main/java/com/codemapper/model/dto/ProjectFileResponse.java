package com.codemapper.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Raw source of any file inside the session's project or mobile roots. Used
 *  by the mobile-screen code viewer (files that aren't parsed ParsedClasses). */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProjectFileResponse {
    private String fileName;
    private String filePath;
    private String sourceCode;
    private int lineCount;
}
