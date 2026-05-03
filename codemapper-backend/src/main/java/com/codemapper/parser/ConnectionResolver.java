package com.codemapper.parser;

import com.codemapper.model.domain.Connection;
import com.codemapper.model.domain.ConnectionType;
import com.codemapper.model.domain.ParsedClass;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.resolution.types.ResolvedReferenceType;
import com.github.javaparser.resolution.types.ResolvedType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Slf4j
@Component
public class ConnectionResolver {

    private static final Set<String> INJECTION_ANNOTATIONS = Set.of("Autowired", "Inject", "Resource");
    private static final Set<String> SPRING_STEREOTYPES = Set.of(
            "Service", "Component", "RestController", "Repository", "Controller"
    );

    public static class TypedClass {
        public final ParsedClass parsedClass;
        public final TypeDeclaration<?> declaration;

        public TypedClass(ParsedClass parsedClass, TypeDeclaration<?> declaration) {
            this.parsedClass = parsedClass;
            this.declaration = declaration;
        }
    }

    public List<Connection> resolve(List<TypedClass> typedClasses, Map<String, ParsedClass> byId) {
        Set<Connection> connections = new LinkedHashSet<>();

        for (TypedClass tc : typedClasses) {
            String sourceId = tc.parsedClass.getId();
            TypeDeclaration<?> td = tc.declaration;

            if (td instanceof ClassOrInterfaceDeclaration coi) {
                resolveExtendsImplements(coi, sourceId, byId, connections);
            }

            resolveFieldConnections(td, sourceId, byId, connections);

            if (isSpringBean(tc.parsedClass) && td instanceof ClassOrInterfaceDeclaration coi) {
                resolveConstructorInjection(coi, sourceId, byId, connections);
            }

            // TODO v2: detectar llamadas entre métodos con MethodCallExpr y SymbolSolver
            // (METHOD_CALL connections)
        }

        return new ArrayList<>(connections);
    }

    private void resolveExtendsImplements(ClassOrInterfaceDeclaration coi,
                                          String sourceId,
                                          Map<String, ParsedClass> byId,
                                          Set<Connection> out) {
        for (ClassOrInterfaceType ext : coi.getExtendedTypes()) {
            resolveTypeFqn(ext).ifPresent(fqn -> addIfInternal(
                    out, sourceId, fqn, ConnectionType.EXTENDS, "extends", byId));
        }
        for (ClassOrInterfaceType impl : coi.getImplementedTypes()) {
            resolveTypeFqn(impl).ifPresent(fqn -> addIfInternal(
                    out, sourceId, fqn, ConnectionType.IMPLEMENTS, "implements", byId));
        }
    }

    private void resolveFieldConnections(TypeDeclaration<?> td,
                                         String sourceId,
                                         Map<String, ParsedClass> byId,
                                         Set<Connection> out) {
        for (FieldDeclaration field : td.getFields()) {
            boolean injected = field.getAnnotations().stream()
                    .map(a -> a.getNameAsString())
                    .anyMatch(INJECTION_ANNOTATIONS::contains);
            ConnectionType ctype = injected ? ConnectionType.DEPENDENCY_INJECTION : ConnectionType.COMPOSITION;

            for (VariableDeclarator var : field.getVariables()) {
                String label = injected ? "injects" : var.getNameAsString();
                Set<String> typeFqns = collectTypeFqns(var.getType());
                for (String fqn : typeFqns) {
                    addIfInternal(out, sourceId, fqn, ctype, label, byId);
                }
            }
        }
    }

    private void resolveConstructorInjection(ClassOrInterfaceDeclaration coi,
                                             String sourceId,
                                             Map<String, ParsedClass> byId,
                                             Set<Connection> out) {
        for (ConstructorDeclaration ctor : coi.getConstructors()) {
            for (Parameter param : ctor.getParameters()) {
                Set<String> typeFqns = collectTypeFqns(param.getType());
                for (String fqn : typeFqns) {
                    addIfInternal(out, sourceId, fqn,
                            ConnectionType.DEPENDENCY_INJECTION, "injects", byId);
                }
            }
        }
    }

    private boolean isSpringBean(ParsedClass pc) {
        return pc.getAnnotations().stream()
                .map(a -> a.startsWith("@") ? a.substring(1) : a)
                .anyMatch(SPRING_STEREOTYPES::contains);
    }

    private void addIfInternal(Set<Connection> out,
                               String sourceId,
                               String targetFqn,
                               ConnectionType type,
                               String label,
                               Map<String, ParsedClass> byId) {
        String targetId = ClassExtractor.toId(targetFqn);
        if (byId.containsKey(targetId) && !targetId.equals(sourceId)) {
            out.add(new Connection(sourceId, targetId, type, label));
        }
    }

    private Optional<String> resolveTypeFqn(ClassOrInterfaceType type) {
        try {
            ResolvedReferenceType resolved = type.resolve();
            return Optional.ofNullable(resolved.getQualifiedName());
        } catch (Exception e) {
            log.trace("Could not resolve type {}: {}", type, e.getMessage());
            return Optional.empty();
        }
    }

    private Set<String> collectTypeFqns(Type type) {
        Set<String> result = new LinkedHashSet<>();
        collectTypeFqnsRec(type, result);
        return result;
    }

    private void collectTypeFqnsRec(Type type, Set<String> out) {
        if (type == null || !type.isClassOrInterfaceType()) {
            return;
        }
        ClassOrInterfaceType cot = type.asClassOrInterfaceType();
        try {
            ResolvedType resolved = cot.resolve();
            if (resolved.isReferenceType()) {
                String fqn = resolved.asReferenceType().getQualifiedName();
                if (fqn != null) {
                    out.add(fqn);
                }
            }
        } catch (Exception e) {
            log.trace("Could not resolve type {}: {}", cot, e.getMessage());
        }
        cot.getTypeArguments().ifPresent(args -> {
            for (Type arg : args) {
                collectTypeFqnsRec(arg, out);
            }
        });
    }
}
