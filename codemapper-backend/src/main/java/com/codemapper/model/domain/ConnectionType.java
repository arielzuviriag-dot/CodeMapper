package com.codemapper.model.domain;

public enum ConnectionType {
    EXTENDS,
    IMPLEMENTS,
    COMPOSITION,
    DEPENDENCY_INJECTION,
    METHOD_CALL,
    ANNOTATION_USAGE,
    /** A front-end screen → backend controller link (an HTTP call the screen
     *  makes that a Spring mapping handles). Drawn by the cross-stack linker. */
    HTTP_CALL
}
