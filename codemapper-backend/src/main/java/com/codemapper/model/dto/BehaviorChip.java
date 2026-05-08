package com.codemapper.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One detected behavioral annotation on the focus class — drives the
 * BehaviorChipBar under the FocusCenterNode header. Two flavors:
 *
 * <ul>
 *   <li>{@code methodName != null} — annotation lives on a method (e.g.
 *   {@code @Transactional} on a single endpoint). Click in the UI navigates
 *   to that method's source.</li>
 *   <li>{@code methodName == null} — annotation lives on the class itself
 *   and applies to every method (e.g. {@code @Transactional} at class level).
 *   Click navigates to the class declaration.</li>
 * </ul>
 *
 * The {@code value} field carries the literal annotation argument when
 * present (e.g. {@code "auth"} for {@code @Cacheable("auth")}). Null when
 * the annotation has no argument, or the argument is too complex to render
 * inline.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class BehaviorChip {
    /** Annotation simple name including the leading "@" (e.g. "@Transactional"). */
    private String annotation;
    /** Single-string argument when present, or null. */
    private String value;
    /** Method this annotation sits on, or null when it's at class level. */
    private String methodName;
}
