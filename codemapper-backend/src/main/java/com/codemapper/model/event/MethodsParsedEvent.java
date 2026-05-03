package com.codemapper.model.event;

import com.codemapper.model.domain.ParsedMethod;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class MethodsParsedEvent extends BaseEvent {
    private String classId;
    private List<ParsedMethod> methods;

    @Override
    public String eventName() {
        return "methods_parsed";
    }
}
