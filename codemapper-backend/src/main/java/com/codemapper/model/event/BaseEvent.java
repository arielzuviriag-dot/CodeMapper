package com.codemapper.model.event;

import com.fasterxml.jackson.annotation.JsonIgnore;

public abstract class BaseEvent {

    @JsonIgnore
    public abstract String eventName();
}
