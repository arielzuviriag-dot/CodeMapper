package com.codemapper.model.domain;

public enum FocusConnectionType {
    EXTENDS,
    IMPLEMENTS,
    CALLED_BY,
    CALLS,
    USES_PROPERTIES,
    /** Used when the focus is a method (not a class) — every connection is a class
     *  that contains at least one invocation of that method (incoming side). */
    INVOKES_METHOD,
    /** Outgoing side of a method-focus session: a class that the focus method
     *  invokes inside its body. Carries the target method name in
     *  {@code viaMethodInTarget} and, when present, the enclosing control-flow
     *  context in {@code controlContext}. */
    INVOKES_OUTGOING
}
