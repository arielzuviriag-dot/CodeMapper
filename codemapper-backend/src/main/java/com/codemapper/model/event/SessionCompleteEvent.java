package com.codemapper.model.event;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class SessionCompleteEvent extends BaseEvent {
    private int totalClasses;
    private int totalConnections;
    private long durationMs;

    @Override
    public String eventName() {
        return "session_complete";
    }
}
