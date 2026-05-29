package com.codemapper.model.event;

import com.codemapper.model.dto.ExceptionReportDto;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * Carries the deterministic {@link ExceptionReportDto} to the frontend so the
 * Informe panel can render the causal chain + clickable links. Emitted once,
 * after the focus class + peripheral connection events, by
 * {@code ExceptionTracerService}.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class ExceptionReportEvent extends BaseEvent {
    private ExceptionReportDto report;

    @Override
    public String eventName() {
        return "exception_report";
    }
}
