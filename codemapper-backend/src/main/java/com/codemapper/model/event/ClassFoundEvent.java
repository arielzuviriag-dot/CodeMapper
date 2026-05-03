package com.codemapper.model.event;

import com.codemapper.model.domain.ClassType;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class ClassFoundEvent extends BaseEvent {
    private String id;
    private String name;
    private String fullyQualifiedName;
    private String packageName;
    private ClassType type;
    private List<String> annotations;
    private String filePath;
    private int lineCount;
    private List<String> modifiers;

    @Override
    public String eventName() {
        return "class_found";
    }
}
