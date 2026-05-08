package com.codemapper.model.event;

import com.codemapper.model.domain.ClassType;
import com.codemapper.model.domain.FocusConnectionType;
import com.codemapper.model.domain.ParsedField;
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
public class FocusConnectionEvent extends BaseEvent {
    private String id;
    private String fullyQualifiedName;
    /** Simple class name (or filename for property files). */
    private String name;
    private String packageName;
    private ClassType type;
    private List<String> annotations;
    private FocusConnectionType connectionType;
    private List<ParsedField> fields;
    private List<ParsedMethod> methods;
    /** 1-based emission order across all connections (used for staggered rendering). */
    private int position;
    /** Source file path of the connected node. */
    private String sourceFile;
    /** Method on the FOCUS side that produces this relationship — e.g. for
     *  CALLS, the focus method that contains the call expression; for
     *  CALLED_BY, this is empty (the focus is the target). May be null when
     *  the relationship is established outside any method body. */
    private String viaMethodInSource;
    /** Method on the OTHER side. For CALLED_BY, the method of the caller class
     *  that invokes the focus. For CALLS / INVOKES_OUTGOING, the simple name
     *  of the method being invoked on the target class. May be null when the
     *  relationship is signature-only. */
    private String viaMethodInTarget;
    /** Optional enclosing control-flow context for the call site, used by the
     *  outgoing side of method focus to render branches/loops. One of:
     *  {@code IF_THEN}, {@code IF_ELSE}, {@code LOOP}, {@code TRY},
     *  {@code CATCH}, {@code SWITCH_CASE}, or {@code null} when the call sits
     *  in the linear top-level body. */
    private String controlContext;
    /** True when the connected class lives under a {@code /test/java/} source
     *  root — drives the test toggle and the dashed grey edge style. */
    private boolean isTest;
    /** True when the connected class is a test that mocks the focus class
     *  (declares a field annotated @Mock/@MockBean/@SpyBean/@InjectMocks
     *  whose simple-name type matches the focus). Drives the mask icon
     *  rendered on the edge midpoint. */
    private boolean isMock;

    @Override
    public String eventName() {
        return "connection_found";
    }
}
