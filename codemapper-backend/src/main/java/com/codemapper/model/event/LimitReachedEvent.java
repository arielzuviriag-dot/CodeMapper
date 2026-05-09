package com.codemapper.model.event;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class LimitReachedEvent extends BaseEvent {
    private int limit;
    private int totalFilesAvailable;
    private int filesParsed;
    private String message;
    /** Total real detectado en el proyecto (P1 + P2 sumados, sin importar si se
     *  emitieron por SSE). Diferente de {@link #filesParsed} (lo que SI se
     *  emitio, capeado a {@link #limit}). En FREE permite mostrar "10 / 32"
     *  honesto en el panel de metricas. */
    private int totalConnectionsDetected;
    /** True cuando P2 corto por el hard cap de exploracion (FREE: 200,
     *  PRO: 5000 defensivo). Frontend muestra "200+" en lugar del numero
     *  absoluto cuando es true. */
    private boolean truncated;

    @Override
    public String eventName() {
        return "limit_reached";
    }
}
