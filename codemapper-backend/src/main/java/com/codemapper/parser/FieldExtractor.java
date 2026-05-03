package com.codemapper.parser;

import com.codemapper.model.domain.ParsedField;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class FieldExtractor {

    public List<ParsedField> extract(TypeDeclaration<?> type) {
        List<ParsedField> result = new ArrayList<>();
        for (FieldDeclaration field : type.getFields()) {
            List<String> modifiers = field.getModifiers().stream()
                    .map(m -> m.getKeyword().asString())
                    .collect(Collectors.toCollection(ArrayList::new));
            List<String> annotations = field.getAnnotations().stream()
                    .map(a -> "@" + a.getNameAsString())
                    .collect(Collectors.toCollection(ArrayList::new));

            for (VariableDeclarator var : field.getVariables()) {
                ParsedField pf = new ParsedField();
                pf.setName(var.getNameAsString());
                pf.setType(var.getTypeAsString());
                pf.setModifiers(new ArrayList<>(modifiers));
                pf.setAnnotations(new ArrayList<>(annotations));
                result.add(pf);
            }
        }
        return result;
    }
}
