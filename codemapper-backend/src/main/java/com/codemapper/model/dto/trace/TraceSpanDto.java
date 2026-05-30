package com.codemapper.model.dto.trace;

/**
 * "Escuchando" mode — the simple, frontend-friendly shape we push over SSE for
 * each OpenTelemetry span we ingest at {@code /v1/traces}. This is intentionally
 * NOT the raw OTLP structure: {@link OtlpTraceParser} flattens the OTLP/JSON
 * (base64/hex ids, string nanos, attribute arrays, status enums) into these
 * plain fields so the frontend never has to know about OTLP at all.
 *
 * <p>Records serialize cleanly with Jackson (one JSON object per span).
 *
 * @param traceId      groups spans of the same request/execution. The frontend
 *                     builds one call-tree per trace.
 * @param spanId       unique id of this span (hex string).
 * @param parentSpanId id of the parent span, or {@code null}/empty for a root.
 * @param fqcn         {@code code.namespace} — fully-qualified class name, or
 *                     {@code null} when the span carries no code attribute
 *                     (framework/DB/HTTP spans). The frontend bridges through
 *                     these to keep the class graph connected.
 * @param className    simple class name derived from {@code fqcn}.
 * @param method       {@code code.function} — the method that ran, if known.
 * @param spanName     the raw OTLP span name — fallback label when there is no
 *                     code attribute.
 * @param httpUrl      best-effort request URL/path of the root HTTP span
 *                     (from url.full / server.address+url.path / http.route),
 *                     or {@code null} for non-HTTP spans. Lets the frontend
 *                     filter the live graph to traces of a chosen URL.
 * @param status       "OK" | "ERROR" | "UNSET".
 * @param startUnixNano span start time in nanos since epoch — the frontend
 *                     uses it to number classes in true execution order
 *                     (robust against out-of-order batch delivery).
 * @param durationMs   (endTimeUnixNano - startTimeUnixNano) / 1e6, rounded.
 * @param error        populated when status==ERROR or an "exception" event was
 *                     attached; {@code null} otherwise.
 */
public record TraceSpanDto(
        String traceId,
        String spanId,
        String parentSpanId,
        String fqcn,
        String className,
        String method,
        String spanName,
        String httpUrl,
        String status,
        long startUnixNano,
        long durationMs,
        TraceErrorDto error
) {
    /** Exception detail extracted from a span's ERROR status or "exception" event. */
    public record TraceErrorDto(String type, String message, String stacktrace) {}
}
