package com.codemapper.model.domain;

public enum FocusConnectionType {
    EXTENDS,
    IMPLEMENTS,
    CALLED_BY,
    CALLS,
    USES_PROPERTIES,
    /** Used when the focus is a method (not a class) — every connection is a class
     *  that contains at least one invocation of that method. */
    INVOKES_METHOD
}
