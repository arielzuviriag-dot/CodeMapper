package com.codemapper.model.domain;

public enum ClassType {
    CLASS,
    INTERFACE,
    ENUM,
    RECORD,
    ABSTRACT_CLASS,
    /** Not a Java class — a front-end (web) screen/module that calls the
     *  backend. Emitted by the cross-stack linker so the web layer shows. */
    WEB_SCREEN,
    /** A mobile (React Native / Expo) screen — same idea as WEB_SCREEN but for
     *  the mobile front-end, drawn on its own row with a phone marker. */
    MOBILE_SCREEN
}
