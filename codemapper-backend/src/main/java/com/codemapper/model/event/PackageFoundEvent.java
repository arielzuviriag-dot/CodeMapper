package com.codemapper.model.event;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class PackageFoundEvent extends BaseEvent {
    private String packageName;

    @Override
    public String eventName() {
        return "package_found";
    }
}
