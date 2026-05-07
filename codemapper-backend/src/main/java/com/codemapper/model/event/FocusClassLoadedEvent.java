package com.codemapper.model.event;

import com.codemapper.model.domain.ClassType;
import com.codemapper.model.domain.ParsedField;
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
public class FocusClassLoadedEvent extends BaseEvent {
    private String id;
    private String fullyQualifiedName;
    /** Simple class name. */
    private String name;
    private String packageName;
    private ClassType type;
    private List<String> annotations;
    private List<String> modifiers;
    private List<ParsedField> fields;
    private List<ParsedMethod> methods;
    /** FQNs of interfaces this class declares to implement. */
    private List<String> implementsList;
    /** FQN of the superclass declared (if any). */
    private String extendsClass;
    /** Absolute path of the source file. */
    private String sourceFile;
    private int lineCount;

    @Override
    public String eventName() {
        return "focus_class_loaded";
    }
}
