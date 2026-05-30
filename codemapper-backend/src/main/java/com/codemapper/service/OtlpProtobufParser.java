package com.codemapper.service;

import com.codemapper.model.dto.trace.TraceSpanDto;
import com.google.protobuf.ByteString;
import io.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
import io.opentelemetry.proto.common.v1.AnyValue;
import io.opentelemetry.proto.common.v1.KeyValue;
import io.opentelemetry.proto.trace.v1.ResourceSpans;
import io.opentelemetry.proto.trace.v1.ScopeSpans;
import io.opentelemetry.proto.trace.v1.Span;
import io.opentelemetry.proto.trace.v1.Status;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * "Escuchando" mode — parses an OTLP/HTTP <b>protobuf</b> body (the format the
 * OpenTelemetry Java agent actually exports, with
 * {@code otel.exporter.otlp.protocol=http/protobuf}).
 *
 * <p>This is the counterpart to {@link OtlpTraceParser} (which handles the JSON
 * shape used by tools/tests). Real agents never send JSON — the agent's OTLP
 * exporter only supports grpc and http/protobuf — so this protobuf path is what
 * makes live tracing of a real app work. Both parsers emit the same flat
 * {@link TraceSpanDto}, so the broadcaster/frontend don't care which was used.
 */
@Slf4j
@Component
public class OtlpProtobufParser {

    private static final char[] HEX = "0123456789abcdef".toCharArray();

    /** Parse a serialized ExportTraceServiceRequest into flat spans. */
    public List<TraceSpanDto> parse(byte[] body) {
        List<TraceSpanDto> out = new ArrayList<>();
        if (body == null || body.length == 0) return out;
        final ExportTraceServiceRequest request;
        try {
            request = ExportTraceServiceRequest.parseFrom(body);
        } catch (Exception e) {
            log.warn("Not a valid OTLP protobuf body: {}", e.getMessage());
            return out;
        }
        for (ResourceSpans rs : request.getResourceSpansList()) {
            for (ScopeSpans ss : rs.getScopeSpansList()) {
                for (Span sp : ss.getSpansList()) {
                    TraceSpanDto dto = mapSpan(sp);
                    if (dto != null) out.add(dto);
                }
            }
        }
        return out;
    }

    private TraceSpanDto mapSpan(Span span) {
        String traceId = hex(span.getTraceId());
        String spanId = hex(span.getSpanId());
        String parentSpanId = span.getParentSpanId().isEmpty() ? null : hex(span.getParentSpanId());
        String spanName = span.getName();

        long startNano = span.getStartTimeUnixNano();
        long endNano = span.getEndTimeUnixNano();
        long durationMs = (endNano > 0 && endNano >= startNano)
                ? Math.round((endNano - startNano) / 1_000_000.0)
                : 0L;

        Map<String, String> attrs = flatten(span.getAttributesList());
        String fqcn = attrs.get("code.namespace");
        String method = attrs.get("code.function");
        String className = simpleClassName(fqcn);
        String httpUrl = OtlpTraceParser.httpUrl(attrs);

        String status = mapStatus(span.getStatus());

        TraceSpanDto.TraceErrorDto error = extractError(span, status);
        if (error != null && !"ERROR".equals(status)) {
            status = "ERROR";
        }

        return new TraceSpanDto(traceId, spanId, parentSpanId, fqcn, className,
                method, spanName, httpUrl, status, startNano, durationMs, error);
    }

    private String mapStatus(Status status) {
        return switch (status.getCode()) {
            case STATUS_CODE_OK -> "OK";
            case STATUS_CODE_ERROR -> "ERROR";
            default -> "UNSET";
        };
    }

    private TraceSpanDto.TraceErrorDto extractError(Span span, String status) {
        for (Span.Event ev : span.getEventsList()) {
            if ("exception".equals(ev.getName())) {
                Map<String, String> ea = flatten(ev.getAttributesList());
                return new TraceSpanDto.TraceErrorDto(
                        ea.get("exception.type"),
                        ea.get("exception.message"),
                        ea.get("exception.stacktrace"));
            }
        }
        if ("ERROR".equals(status)) {
            String msg = span.getStatus().getMessage();
            return new TraceSpanDto.TraceErrorDto(null, msg.isEmpty() ? null : msg, null);
        }
        return null;
    }

    private Map<String, String> flatten(List<KeyValue> attributes) {
        Map<String, String> map = new LinkedHashMap<>();
        for (KeyValue kv : attributes) {
            map.put(kv.getKey(), anyValueToString(kv.getValue()));
        }
        return map;
    }

    private String anyValueToString(AnyValue v) {
        if (v.hasStringValue()) return v.getStringValue();
        if (v.hasIntValue()) return Long.toString(v.getIntValue());
        if (v.hasDoubleValue()) return Double.toString(v.getDoubleValue());
        if (v.hasBoolValue()) return Boolean.toString(v.getBoolValue());
        return null;
    }

    private String simpleClassName(String fqcn) {
        if (fqcn == null || fqcn.isBlank()) return null;
        int lastDot = fqcn.lastIndexOf('.');
        return lastDot >= 0 && lastDot < fqcn.length() - 1 ? fqcn.substring(lastDot + 1) : fqcn;
    }

    private String hex(ByteString bytes) {
        if (bytes == null || bytes.isEmpty()) return null;
        byte[] b = bytes.toByteArray();
        char[] out = new char[b.length * 2];
        for (int i = 0; i < b.length; i++) {
            out[i * 2] = HEX[(b[i] >> 4) & 0xF];
            out[i * 2 + 1] = HEX[b[i] & 0xF];
        }
        return new String(out);
    }
}
