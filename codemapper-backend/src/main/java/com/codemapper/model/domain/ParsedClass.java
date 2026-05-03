package com.codemapper.model.domain;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
public class ParsedClass {
    private String id;
    private String name;
    private String fullyQualifiedName;
    private String packageName;
    private ClassType type;
    private List<String> annotations = new ArrayList<>();
    private List<String> modifiers = new ArrayList<>();
    private String filePath;
    private int lineCount;

    private List<ParsedField> fields = new ArrayList<>();
    private List<ParsedMethod> methods = new ArrayList<>();
}
