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

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Parameter {
        private String name;
        private String type;
    }
}
