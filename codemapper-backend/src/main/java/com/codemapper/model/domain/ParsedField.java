package com.codemapper.model.domain;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
public class ParsedField {
    private String name;
    private String type;
    private List<String> modifiers = new ArrayList<>();
    private List<String> annotations = new ArrayList<>();
}
