package com.codemapper.model.event;

import com.codemapper.model.domain.ConnectionType;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class ConnectionFoundEvent extends BaseEvent {
    private String from;
    private String to;
    private ConnectionType type;
    private String label;

    @Override
    public String eventName() {
        return "connection_found";
    }
}
