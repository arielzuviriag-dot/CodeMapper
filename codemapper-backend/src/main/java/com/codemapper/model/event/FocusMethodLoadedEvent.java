package com.codemapper.model.event;

import com.codemapper.model.domain.ParsedMethod;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class FocusMethodLoadedEvent extends BaseEvent {
    /** Stable identifier — `<focusClassFqn>#<methodName>`. */
    private String id;
    /** Simple name of the class that owns the method. */
    private String containingClass;
    /** FQN of the class that owns the method. */
    private String containingClassFullyQualifiedName;
    /** Package of the owning class. */
    private String containingClassPackage;
    /** Method simple name. */
    private String methodName;
    /** Single-line declaration string ("public Foo bar(int x, String y)"). */
    private String signature;
    private String returnType;
    private List<ParsedMethod.Parameter> parameters;
    /** Source code of the method declaration + body, exactly as it appears in the file. */
    private String sourceCode;
    private int lineCount;
    private int startLine;
    private int endLine;

    @Override
    public String eventName() {
        return "focus_method_loaded";
    }
}
