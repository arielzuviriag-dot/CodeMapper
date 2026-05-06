package com.codemapper.model.event;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class LimitReachedEvent extends BaseEvent {
    private int limit;
    private int totalFilesAvailable;
    private int filesParsed;
    private String message;

    @Override
    public String eventName() {
        return "limit_reached";
    }
}
