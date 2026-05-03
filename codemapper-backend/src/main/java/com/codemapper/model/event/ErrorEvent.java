package com.codemapper.model.event;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class ErrorEvent extends BaseEvent {
    private String message;
    private String classId;
    private String filePath;

    @Override
    public String eventName() {
        return "error";
    }
}
