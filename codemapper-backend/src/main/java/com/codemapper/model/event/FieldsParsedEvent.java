package com.codemapper.model.event;

import com.codemapper.model.domain.ParsedField;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class FieldsParsedEvent extends BaseEvent {
    private String classId;
    private List<ParsedField> fields;

    @Override
    public String eventName() {
        return "fields_parsed";
    }
}
