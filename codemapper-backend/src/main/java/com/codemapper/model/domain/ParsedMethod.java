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
    /** Simple class names of exceptions declared in the `throws` clause. Empty
     *  for methods that don't declare any. F1 contract: surfaced as the
     *  exception cluster under the FocusCenterNode. */
    private List<String> thrownExceptions = new ArrayList<>();
    /** Subset of {@link #annotations} that match Spring/JSR security gates
     *  (@PreAuthorize, @Secured, @RolesAllowed, @RequiredRole). Drives the
     *  shield badge in the contract surface. Empty for unprotected methods. */
    private List<String> securityAnnotations = new ArrayList<>();
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
