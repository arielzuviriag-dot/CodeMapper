package com.codemapper.parser;

import com.codemapper.model.domain.ParsedMethod;
import com.github.javaparser.ast.body.BodyDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.TypeDeclaration;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class MethodExtractor {

    public List<ParsedMethod> extract(TypeDeclaration<?> type) {
        List<ParsedMethod> result = new ArrayList<>();
        for (BodyDeclaration<?> member : type.getMembers()) {
            if (member instanceof MethodDeclaration md) {
                result.add(fromMethod(md));
            } else if (member instanceof ConstructorDeclaration cd) {
                result.add(fromConstructor(cd));
            }
        }
        return result;
    }

    private ParsedMethod fromMethod(MethodDeclaration md) {
        ParsedMethod pm = new ParsedMethod();
        pm.setName(md.getNameAsString());
        pm.setReturnType(md.getTypeAsString());
        pm.setParameters(extractParameters(md.getParameters()));
        pm.setModifiers(md.getModifiers().stream()
                .map(m -> m.getKeyword().asString())
                .collect(Collectors.toCollection(ArrayList::new)));
        pm.setAnnotations(md.getAnnotations().stream()
                .map(a -> "@" + a.getNameAsString())
                .collect(Collectors.toCollection(ArrayList::new)));
        pm.setStatic(md.isStatic());
        pm.setAbstract(md.isAbstract());
        pm.setLineCount(md.getRange().map(r -> r.end.line - r.begin.line + 1).orElse(0));
        return pm;
    }

    private ParsedMethod fromConstructor(ConstructorDeclaration cd) {
        ParsedMethod pm = new ParsedMethod();
        pm.setName(cd.getNameAsString());
        pm.setReturnType("<constructor>");
        pm.setParameters(extractParameters(cd.getParameters()));
        pm.setModifiers(cd.getModifiers().stream()
                .map(m -> m.getKeyword().asString())
                .collect(Collectors.toCollection(ArrayList::new)));
        pm.setAnnotations(cd.getAnnotations().stream()
                .map(a -> "@" + a.getNameAsString())
                .collect(Collectors.toCollection(ArrayList::new)));
        pm.setStatic(false);
        pm.setAbstract(false);
        pm.setLineCount(cd.getRange().map(r -> r.end.line - r.begin.line + 1).orElse(0));
        return pm;
    }

    private List<ParsedMethod.Parameter> extractParameters(List<Parameter> parameters) {
        return parameters.stream()
                .map(p -> new ParsedMethod.Parameter(p.getNameAsString(), p.getTypeAsString()))
                .collect(Collectors.toCollection(ArrayList::new));
    }
}
