package com.codemapper.model.event;

import com.codemapper.model.dto.UnresolvedReference;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

/**
 * Emitted by FocusTracerService each time a diagnostic finding is produced
 * during deep analysis. Streamed in real time so the frontend's diagnostics
 * panel populates progressively, alongside the connection peripherals.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class UnresolvedReferenceEvent extends BaseEvent {
    private UnresolvedReference reference;

    @Override
    public String eventName() {
        return "unresolved_reference";
    }
}
