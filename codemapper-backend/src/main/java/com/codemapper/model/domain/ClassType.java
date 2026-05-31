package com.codemapper.model.domain;

public enum ClassType {
    CLASS,
    INTERFACE,
    ENUM,
    RECORD,
    ABSTRACT_CLASS,
    /** Not a Java class — a front-end screen/module that calls the backend.
     *  Emitted by the cross-stack linker so the web layer shows in the graph. */
    WEB_SCREEN
}
