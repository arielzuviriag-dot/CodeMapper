package com.codemapper.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One mobile (React Native) screen that can reach a backend endpoint present
 * in the exception chain. Built by matching the RN api calls
 * ({@code apiX.post('/appointments')}) against the controller's HTTP mapping.
 *
 * <p>Drives the FIRST node(s) of the exception flow graph: the screen (with
 * the action that triggers the call) linked to the controller class.</p>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class MobileOriginDto {
    /** Screen file name without extension, e.g. {@code book-appointment}. */
    private String screenName;
    /** Path to the screen file (for display). */
    private String screenFile;
    /** The API wrapper the screen calls, e.g. {@code createAppointment} — this
     *  is "el botón / la acción" that fires the request. */
    private String apiFunction;
    /** File where {@link #apiFunction} is declared (the api module). */
    private String apiFile;
    /** HTTP verb (GET/POST/...) and path that matched the backend endpoint. */
    private String method;
    private String path;
    /** Graph node id of the controller class this screen reaches — the flow
     *  graph draws the edge screen → controller. */
    private String attachClassId;
    private String attachFqn;
}
