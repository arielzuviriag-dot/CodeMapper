package com.codemapper.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * One exception in the causal chain. The first cause in
 * {@link ExceptionReportDto#getCauses()} is the top-level (outermost) exception;
 * each subsequent entry is what the previous one was {@code Caused by}.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ExceptionCauseDto {
    /** Exception type — FQN when the trace carried it, simple name otherwise. */
    private String exceptionType;
    /** Message after the {@code :} on the exception line. Empty when none. */
    private String message;
    /** Frames of this exception, in trace order: throw site first, entry last. */
    private List<ExceptionFrameDto> frames;
}
