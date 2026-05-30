package com.codemapper.service;

import com.codemapper.model.dto.trace.TraceSpanDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * "Escuchando" mode — parses an OTLP/HTTP <b>JSON</b> payload (the body the
 * OpenTelemetry Java agent POSTs to {@code /v1/traces} when configured with
 * {@code otel.exporter.otlp.protocol=http/json}) into a flat list of
 * {@link TraceSpanDto}.
 *
 * <p>This deliberately works off a {@code Map<String,Object>} (Jackson's
 * untyped tree) rather than generated OTLP classes, because:
 * <ul>
 *   <li>we don't want a protobuf/OTLP dependency, and</li>
 *   <li>OTLP/JSON is full of shape quirks that are easier to defend against by
 *       hand: trace/span ids are hex (older agents: base64) strings, the
 *       {@code *UnixNano} timestamps are uint64 <em>strings</em>, {@code status.code}
 *       is an enum that serializes as either an int (0/1/2) or a string
 *       ("STATUS_CODE_ERROR"), and {@code attributes} is an array of
 *       {@code {key, value:{stringValue|intValue|...}}} rather than a map.</li>
 * </ul>
 *
 * <p>Every accessor is null-tolerant: a malformed or partial payload yields
 * fewer spans, never an exception. The controller still answers 200 either way.
 */
@Slf4j
@Component
public class OtlpTraceParser {

    /**
     * Walk {@code resourceSpans -> scopeSpans -> spans} and flatten every span.
     * Returns an empty list (never null) for any missing/garbage input.
     */
    @SuppressWarnings("unchecked")
    public List<TraceSpanDto> parse(Map<String, Object> body) {
        List<TraceSpanDto> out = new ArrayList<>();
        if (body == null) return out;

        for (Object rs : asList(body.get("resourceSpans"))) {
            Map<String, Object> resourceSpans = asMap(rs);
            // OTLP nests an extra "scopeSpans" (1.x) — older payloads used
            // "instrumentationLibrarySpans". Accept both so we don't silently
            // drop data from an older agent.
            List<Object> scopeSpansList = asList(resourceSpans.get("scopeSpans"));
            if (scopeSpansList.isEmpty()) {
                scopeSpansList = asList(resourceSpans.get("instrumentationLibrarySpans"));
            }
            for (Object ss : scopeSpansList) {
                Map<String, Object> scopeSpans = asMap(ss);
                for (Object sp : asList(scopeSpans.get("spans"))) {
                    TraceSpanDto dto = parseSpan(asMap(sp));
                    if (dto != null) out.add(dto);
                }
            }
        }
        return out;
    }

    private TraceSpanDto parseSpan(Map<String, Object> span) {
        if (span.isEmpty()) return null;

        String traceId = str(span.get("traceId"));
        String spanId = str(span.get("spanId"));
        String parentSpanId = str(span.get("parentSpanId"));
        if (parentSpanId != null && parentSpanId.isBlank()) parentSpanId = null;
        String spanName = str(span.get("name"));

        long startNano = nano(span.get("startTimeUnixNano"));
        long endNano = nano(span.get("endTimeUnixNano"));
        long durationMs = (endNano > 0 && endNano >= startNano)
                ? Math.round((endNano - startNano) / 1_000_000.0)
                : 0L;

        Map<String, String> attrs = flattenAttributes(span.get("attributes"));
        String fqcn = attrs.get("code.namespace");
        String method = attrs.get("code.function");
        String className = simpleClassName(fqcn);
        String httpUrl = httpUrl(attrs);

        String status = mapStatus(span.get("status"));

        TraceSpanDto.TraceErrorDto error = extractError(span, status);
        // An "exception" event means the call really did throw, even if the
        // agent left the status UNSET — surface it as ERROR so the node turns red.
        if (error != null && !"ERROR".equals(status)) {
            status = "ERROR";
        }

        return new TraceSpanDto(traceId, spanId, parentSpanId, fqcn, className,
                method, spanName, httpUrl, status, startNano, durationMs, error);
    }

    /** Map OTLP status.code (int 0/1/2 or "STATUS_CODE_*" string) → OK/ERROR/UNSET. */
    private String mapStatus(Object statusObj) {
        Map<String, Object> status = asMap(statusObj);
        Object code = status.get("code");
        if (code == null) return "UNSET";
        if (code instanceof Number n) {
            return switch (n.intValue()) {
                case 1 -> "OK";
                case 2 -> "ERROR";
                default -> "UNSET";
            };
        }
        String s = code.toString().toUpperCase();
        if (s.contains("ERROR")) return "ERROR";
        if (s.contains("OK")) return "OK";
        return "UNSET";
    }

    /**
     * Pull exception detail from the span's "exception" event (preferred — it
     * carries the stacktrace) and/or the status message. Returns null when the
     * span is healthy and carries no exception event.
     */
    private TraceSpanDto.TraceErrorDto extractError(Map<String, Object> span, String status) {
        for (Object ev : asList(span.get("events"))) {
            Map<String, Object> event = asMap(ev);
            if ("exception".equals(str(event.get("name")))) {
                Map<String, String> ea = flattenAttributes(event.get("attributes"));
                return new TraceSpanDto.TraceErrorDto(
                        ea.get("exception.type"),
                        ea.get("exception.message"),
                        ea.get("exception.stacktrace"));
            }
        }
        if ("ERROR".equals(status)) {
            // No exception event, but the span is flagged ERROR — use the
            // status message so the panel still has something to show.
            Map<String, Object> st = asMap(span.get("status"));
            String msg = str(st.get("message"));
            return new TraceSpanDto.TraceErrorDto(null, msg, null);
        }
        return null;
    }

    /**
     * OTLP attributes are {@code [{key:"k", value:{stringValue:"v"}}, ...]}.
     * Flatten to {@code k -> v}. Only the scalar value types we care about are
     * unwrapped; anything else is stringified so a key is never lost.
     */
    private Map<String, String> flattenAttributes(Object attributes) {
        Map<String, String> map = new LinkedHashMap<>();
        for (Object a : asList(attributes)) {
            Map<String, Object> attr = asMap(a);
            String key = str(attr.get("key"));
            if (key == null) continue;
            map.put(key, attrValue(attr.get("value")));
        }
        return map;
    }

    private String attrValue(Object valueObj) {
        Map<String, Object> value = asMap(valueObj);
        if (value.containsKey("stringValue")) return str(value.get("stringValue"));
        if (value.containsKey("intValue")) return str(value.get("intValue"));
        if (value.containsKey("doubleValue")) return str(value.get("doubleValue"));
        if (value.containsKey("boolValue")) return str(value.get("boolValue"));
        // arrayValue / kvlistValue / bytesValue — rare for code.* attrs; keep
        // the raw toString so nothing silently vanishes.
        return value.isEmpty() ? null : value.toString();
    }

    /**
     * Best-effort request URL from a (server) span's HTTP attributes. Tries
     * stable semconv first (url.full, then server.address[:port]+url.path),
     * then older conventions (http.url/http.target), then http.route. Returns
     * null for non-HTTP spans (e.g. internal method spans).
     */
    static String httpUrl(Map<String, String> attrs) {
        String full = attrs.get("url.full");
        if (full != null) return full;
        full = attrs.get("http.url");
        if (full != null) return full;
        String path = attrs.get("url.path");
        if (path == null) path = attrs.get("http.target");
        String host = attrs.get("server.address");
        if (host == null) host = attrs.get("net.host.name");
        if (path != null) {
            String port = attrs.get("server.port");
            if (host != null) {
                return host + (port != null ? ":" + port : "") + path;
            }
            return path;
        }
        return attrs.get("http.route");
    }

    private String simpleClassName(String fqcn) {
        if (fqcn == null || fqcn.isBlank()) return null;
        int lastDot = fqcn.lastIndexOf('.');
        return lastDot >= 0 && lastDot < fqcn.length() - 1
                ? fqcn.substring(lastDot + 1)
                : fqcn;
    }

    /** Parse a uint64-as-string (or number) nano timestamp; 0 on anything odd. */
    private long nano(Object value) {
        if (value == null) return 0L;
        if (value instanceof Number n) return n.longValue();
        try {
            // uint64 can exceed Long.MAX as text in theory; BigInteger is safe.
            return new BigInteger(value.toString().trim()).longValue();
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private String str(Object value) {
        return value == null ? null : value.toString();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object value) {
        return value instanceof Map ? (Map<String, Object>) value : Map.of();
    }

    @SuppressWarnings("unchecked")
    private List<Object> asList(Object value) {
        return value instanceof List ? (List<Object>) value : List.of();
    }
}
