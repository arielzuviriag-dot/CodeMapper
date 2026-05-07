package com.codemapper.model.event;

import com.codemapper.model.domain.ClassType;
import com.codemapper.model.domain.FocusConnectionType;
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
public class FocusConnectionEvent extends BaseEvent {
    private String id;
    private String fullyQualifiedName;
    /** Simple class name (or filename for property files). */
    private String name;
    private String packageName;
    private ClassType type;
    private List<String> annotations;
    private FocusConnectionType connectionType;
    private List<ParsedField> fields;
    private List<ParsedMethod> methods;
    /** 1-based emission order across all connections (used for staggered rendering). */
    private int position;
    /** Source file path of the connected node. */
    private String sourceFile;

    @Override
    public String eventName() {
        return "connection_found";
    }
}
