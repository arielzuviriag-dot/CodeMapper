package com.codemapper.model.domain;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Connection {
    private String from;
    private String to;
    private ConnectionType type;
    private String label;
}
