package com.codemapper.model.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
public class ParsedMethod {
    private String name;
    private String returnType;
    private List<Parameter> parameters = new ArrayList<>();
    private List<String> modifiers = new ArrayList<>();
    private List<String> annotations = new ArrayList<>();
    @JsonProperty("isStatic")
    private boolean isStatic;
    @JsonProperty("isAbstract")
    private boolean isAbstract;
    private int lineCount;
    /** 1-based start line of the method declaration in its source file (0 if unknown). */
    private int startLine;
    /** 1-based inclusive end line of the method body (0 if unknown). */
    private int endLine;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Parameter {
        private String name;
        private String type;
    }
}
