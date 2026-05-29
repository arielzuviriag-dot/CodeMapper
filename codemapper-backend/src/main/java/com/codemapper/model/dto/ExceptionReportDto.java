package com.codemapper.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * "Ariadna" — the structured report behind the exception-investigation map.
 * Built by {@code ExceptionTracerService} from a pasted Java stack trace and
 * shipped to the frontend (which renders the Informe panel + clickable links
 * into the radial map).
 *
 * <p>The whole report is DETERMINISTIC: every field comes straight from the
 * trace text + the project's parsed classes. No AI involved — the optional
 * "suggest a fix" step is a separate, on-demand call.</p>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ExceptionReportDto {
    /** Full causal chain. {@code causes[0]} is the outermost exception; the
     *  last entry is the deepest {@code Caused by} (the root cause). */
    private List<ExceptionCauseDto> causes;
    /** Top-level (outermost) exception type + message — what the dev first saw. */
    private String topExceptionType;
    private String topExceptionMessage;
    /** Root-cause exception type + message — the deepest {@code Caused by}. */
    private String rootCauseType;
    private String rootCauseMessage;
    /** Top-level FQN of the class chosen as the map focus: the throw site of
     *  the root cause (deepest user-code frame). Null when no project class
     *  appeared anywhere in the trace. */
    private String focusFqn;
    /** {@code ParsedClass} id of {@link #focusFqn}. */
    private String focusClassId;
    /** Method on the focus class where the root cause was thrown. */
    private String focusMethod;
    /** 1-based line in the focus class where it blew up. 0 when unknown. */
    private int focusLine;
}
