package com.codemapper.model.event;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class SessionStartEvent extends BaseEvent {
    private int totalFiles;
    private String projectName;
    private Instant startTime;

    @Override
    public String eventName() {
        return "session_start";
    }
}
