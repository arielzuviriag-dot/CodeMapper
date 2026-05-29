package com.codemapper.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One frame of a parsed stack trace — i.e. one {@code at ...} line.
 *
 * <p>The parser fills the structural fields ({@link #declaringClass},
 * {@link #methodName}, {@link #fileName}, {@link #lineNumber}); the tracer
 * service later resolves {@link #userCode} / {@link #classId} by checking
 * whether the class actually exists in the analysed project. Library/JDK
 * frames stay {@code userCode=false, classId=null} so the frontend can dim
 * them and skip the clickable link.</p>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ExceptionFrameDto {
    /** Declaring class exactly as it appears in the trace — may include the
     *  {@code Outer$Inner} form for nested types. */
    private String declaringClass;
    /** {@link #declaringClass} with any {@code $Inner} suffix stripped — the
     *  top-level type FQN used to match against the project's parsed classes. */
    private String topLevelFqn;
    /** Simple name of the declaring class (last dotted segment, {@code $}
     *  collapsed to the outer name). */
    private String simpleName;
    /** Method (or {@code <init>} / {@code <clinit>} / {@code lambda$..}). */
    private String methodName;
    /** Source file name (e.g. {@code AuthService.java}) or null for native /
     *  unknown-source frames. */
    private String fileName;
    /** 1-based line number, or 0 when the trace didn't carry one. */
    private int lineNumber;
    /** True when {@link #topLevelFqn} resolves to a class in the project. */
    private boolean userCode;
    /** {@code ParsedClass} id (FQN with dots→dashes) for user-code frames so
     *  the frontend can link the text straight to the graph node. Null for
     *  library frames. */
    private String classId;
}
