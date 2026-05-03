package com.codemapper.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ClassSourceResponse {
    private String className;
    private String packageName;
    private String fullyQualifiedName;
    private String sourceCode;
    private String filePath;
    private int lineCount;
}
