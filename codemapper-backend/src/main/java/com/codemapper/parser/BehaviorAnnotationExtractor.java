package com.codemapper.parser;

import com.codemapper.model.dto.BehaviorChip;
import com.github.javaparser.ast.body.BodyDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Walks the focus class to surface "behavioral" annotations — things that
 * change runtime semantics implicitly (transactions, caching, scheduling,
 * event listeners, retries). Each match becomes a {@link BehaviorChip} that
 * the frontend renders below the FocusCenterNode header.
 *
 * Detection is name-based: we match the simple annotation name. That works
 * across reannotations and qualified imports without symbol resolution,
 * which keeps this fast even on large classes.
 *
 * Class-level vs method-level matters for navigation: when the chip is
 * clicked the UI either opens the class source (class-level) or jumps to a
 * specific method body (method-level). The extractor reports both.
 */
@Component
public class BehaviorAnnotationExtractor {

    private static final Set<String> BEHAVIOR_ANNOTATIONS = Set.of(
            "Transactional",
            "Cacheable", "CacheEvict", "CachePut", "Caching",
            "Async",
            "Scheduled",
            "EventListener",
            "TransactionalEventListener",
            "Retryable", "Recover",
            "Lock"
    );

    public List<BehaviorChip> extract(TypeDeclaration<?> type) {
        List<BehaviorChip> result = new ArrayList<>();

        // Class-level — applies to every method, so methodName=null tells
        // the frontend to navigate to the class declaration on click.
        for (AnnotationExpr a : type.getAnnotations()) {
            String name = a.getNameAsString();
            if (BEHAVIOR_ANNOTATIONS.contains(name)) {
                result.add(new BehaviorChip("@" + name, extractValue(a), null));
            }
        }

        // Method-level — each chip carries the owning method so the click
        // navigation lands on that method's body in the source sheet.
        for (BodyDeclaration<?> member : type.getMembers()) {
            if (!(member instanceof MethodDeclaration md)) continue;
            String methodName = md.getNameAsString();
            for (AnnotationExpr a : md.getAnnotations()) {
                String name = a.getNameAsString();
                if (BEHAVIOR_ANNOTATIONS.contains(name)) {
                    result.add(new BehaviorChip("@" + name, extractValue(a), methodName));
                }
            }
        }

        return result;
    }

    /** Extract a single-string argument from an annotation when present.
     *  Returns null for marker annotations, complex argument lists, or when
     *  the argument isn't a literal string (e.g. references a constant). */
    private String extractValue(AnnotationExpr a) {
        if (a instanceof SingleMemberAnnotationExpr sma) {
            if (sma.getMemberValue() instanceof StringLiteralExpr sl) {
                return sl.getValue();
            }
            // Non-string single member: render as source so the chip still
            // says something meaningful (e.g. fixedRate=5000).
            return sma.getMemberValue().toString();
        }
        if (a instanceof NormalAnnotationExpr nae) {
            // Prefer the conventional "value" member when the annotation has
            // multiple name=value pairs — that's what most Spring annotations
            // surface as the "main" argument.
            for (var pair : nae.getPairs()) {
                if ("value".equals(pair.getNameAsString())
                        && pair.getValue() instanceof StringLiteralExpr sl) {
                    return sl.getValue();
                }
            }
            // Fall back to the first pair if no "value" key is present.
            if (!nae.getPairs().isEmpty()) {
                var first = nae.getPairs().get(0);
                if (first.getValue() instanceof StringLiteralExpr sl) {
                    return first.getNameAsString() + "=" + sl.getValue();
                }
            }
        }
        return null;
    }
}
