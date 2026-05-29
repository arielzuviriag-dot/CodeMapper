package com.codemapper.model.event;

import com.codemapper.model.dto.MobileOriginDto;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Mobile (React Native) screens that reach endpoints in the exception chain.
 * Emitted (once) by the exception tracer when a mobile project path was given
 * and at least one screen→endpoint match was found.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class MobileOriginsEvent extends BaseEvent {
    private List<MobileOriginDto> origins;

    @Override
    public String eventName() {
        return "mobile_origins";
    }
}
