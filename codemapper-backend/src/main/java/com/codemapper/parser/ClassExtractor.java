package com.codemapper.parser;

import com.codemapper.model.domain.ClassType;
import com.codemapper.model.domain.ParsedClass;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.EnumDeclaration;
import com.github.javaparser.ast.body.RecordDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class ClassExtractor {

    public ParsedClass extract(TypeDeclaration<?> type, String packageName, String filePath) {
        ParsedClass pc = new ParsedClass();
        pc.setName(type.getNameAsString());
        pc.setPackageName(packageName == null ? "" : packageName);

        String fqn = type.getFullyQualifiedName().orElseGet(() ->
                pc.getPackageName().isEmpty()
                        ? type.getNameAsString()
                        : pc.getPackageName() + "." + type.getNameAsString()
        );
        pc.setFullyQualifiedName(fqn);
        pc.setId(toId(fqn));
        pc.setType(detectClassType(type));

        List<String> annotations = type.getAnnotations().stream()
                .map(a -> "@" + a.getNameAsString())
                .collect(Collectors.toCollection(ArrayList::new));
        pc.setAnnotations(annotations);

        List<String> modifiers = type.getModifiers().stream()
                .map(m -> m.getKeyword().asString())
                .collect(Collectors.toCollection(ArrayList::new));
        pc.setModifiers(modifiers);

        pc.setFilePath(filePath);
        pc.setLineCount(type.getRange()
                .map(r -> r.end.line - r.begin.line + 1)
                .orElse(0));

        return pc;
    }

    private ClassType detectClassType(TypeDeclaration<?> type) {
        if (type instanceof EnumDeclaration) {
            return ClassType.ENUM;
        }
        if (type instanceof RecordDeclaration) {
            return ClassType.RECORD;
        }
        if (type instanceof ClassOrInterfaceDeclaration coi) {
            if (coi.isInterface()) {
                return ClassType.INTERFACE;
            }
            if (coi.isAbstract()) {
                return ClassType.ABSTRACT_CLASS;
            }
        }
        return ClassType.CLASS;
    }

    public static String toId(String fullyQualifiedName) {
        return fullyQualifiedName.replace(".", "-");
    }
}
