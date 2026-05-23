package com.codemapper.exception;

/**
 * P4 — thrown when a PRO-only endpoint is hit from a FREE session. Handled
 * by {@link GlobalExceptionHandler} → HTTP 403 with the original message,
 * which the frontend renders as the paywall toast.
 */
public class ProRequiredException extends RuntimeException {
    public ProRequiredException(String message) {
        super(message);
    }
}
