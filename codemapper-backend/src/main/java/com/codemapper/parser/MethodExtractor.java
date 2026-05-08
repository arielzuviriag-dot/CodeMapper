package com.codemapper.parser;

import com.codemapper.model.domain.ParsedMethod;
import com.github.javaparser.ast.body.BodyDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.type.ReferenceType;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class MethodExtractor {

    /** Spring-style and JSR-250 security gates we surface as a shield badge.
     *  Detection is by simple-name match — works on shaded reannotations and
     *  custom subclasses that follow the same naming. */
    private static final Set<String> SECURITY_ANNOTATION_NAMES = Set.of(
            "PreAuthorize", "PostAuthorize", "PreFilter", "PostFilter",
            "Secured", "RolesAllowed", "DenyAll", "PermitAll",
            "RequiredRole", "RequiresRoles", "RequiresPermissions"
    );

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
        pm.setThrownExceptions(extractThrows(md.getThrownExceptions()));
        pm.setSecurityAnnotations(extractSecurityAnnotations(md.getAnnotations()));
        pm.setStatic(md.isStatic());
        pm.setAbstract(md.isAbstract());
        md.getRange().ifPresent(r -> {
            pm.setLineCount(r.end.line - r.begin.line + 1);
            pm.setStartLine(r.begin.line);
            pm.setEndLine(r.end.line);
        });
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
        pm.setThrownExceptions(extractThrows(cd.getThrownExceptions()));
        pm.setSecurityAnnotations(extractSecurityAnnotations(cd.getAnnotations()));
        pm.setStatic(false);
        pm.setAbstract(false);
        cd.getRange().ifPresent(r -> {
            pm.setLineCount(r.end.line - r.begin.line + 1);
            pm.setStartLine(r.begin.line);
            pm.setEndLine(r.end.line);
        });
        return pm;
    }

    private List<ParsedMethod.Parameter> extractParameters(List<Parameter> parameters) {
        return parameters.stream()
                .map(p -> new ParsedMethod.Parameter(p.getNameAsString(), p.getTypeAsString()))
                .collect(Collectors.toCollection(ArrayList::new));
    }

    /** Extract simple class names from a `throws X, Y` clause. We deliberately
     *  use the source-form name (not FQN) so the cluster chip stays readable —
     *  resolving each FQN here would be costly and noisy for non-imported types. */
    private List<String> extractThrows(com.github.javaparser.ast.NodeList<ReferenceType> thrown) {
        if (thrown == null || thrown.isEmpty()) {
            return new ArrayList<>();
        }
        return thrown.stream()
                .map(ReferenceType::asString)
                .collect(Collectors.toCollection(ArrayList::new));
    }

    private List<String> extractSecurityAnnotations(com.github.javaparser.ast.NodeList<AnnotationExpr> annotations) {
        if (annotations == null || annotations.isEmpty()) {
            return new ArrayList<>();
        }
        return annotations.stream()
                .map(AnnotationExpr::getNameAsString)
                .filter(SECURITY_ANNOTATION_NAMES::contains)
                .map(name -> "@" + name)
                .collect(Collectors.toCollection(ArrayList::new));
    }
}
