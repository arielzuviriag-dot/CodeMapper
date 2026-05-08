package com.codemapper.model.event;

import com.codemapper.model.domain.ClassType;
import com.codemapper.model.domain.ParsedField;
import com.codemapper.model.domain.ParsedMethod;
import com.codemapper.model.dto.BehaviorChip;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

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
    /** Detected Spring/JSR behavioral annotations on this class and its
     *  methods (@Transactional, @Cacheable, @Async, @Scheduled, etc.).
     *  Empty list when the class doesn't carry any — frontend hides the
     *  BehaviorChipBar entirely in that case. */
    private List<BehaviorChip> behaviorAnnotations;
    /** Class-level Jacoco LINE coverage (0–100). Null when no jacoco.xml
     *  was found in the project — frontend hides the donut entirely. */
    private Double coveragePercent;
    /** Per-method coverage keyed by simple method name. Empty when no
     *  jacoco.xml. Drives the per-method drill-down in the sheet. */
    private Map<String, Double> methodCoverage;

    @Override
    public String eventName() {
        return "focus_class_loaded";
    }
}
