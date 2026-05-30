package com.codemapper.trace;

import com.codemapper.model.dto.trace.TraceSpanDto;
import com.codemapper.service.OtlpProtobufParser;
import com.google.protobuf.ByteString;
import io.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
import io.opentelemetry.proto.common.v1.AnyValue;
import io.opentelemetry.proto.common.v1.KeyValue;
import io.opentelemetry.proto.trace.v1.ResourceSpans;
import io.opentelemetry.proto.trace.v1.ScopeSpans;
import io.opentelemetry.proto.trace.v1.Span;
import io.opentelemetry.proto.trace.v1.Status;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Validates the REAL ingest path: the OpenTelemetry Java agent exports OTLP as
 * {@code application/x-protobuf}, so {@link OtlpProtobufParser} (not the JSON
 * one) is what runs in production. This test builds a serialized
 * ExportTraceServiceRequest with the actual shape of the live plixe trace for
 * {@code GET /api/admin/users} — a SERVER entry span + instrumented method
 * spans + a DB span with no code attribute — and asserts the flattened DTOs
 * are exactly what the frontend graph builder consumes.
 */
class OtlpProtobufParserTest {

    private final OtlpProtobufParser parser = new OtlpProtobufParser();

    private static ByteString id(String hex) {
        byte[] b = new byte[hex.length() / 2];
        for (int i = 0; i < b.length; i++) {
            b[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return ByteString.copyFrom(b);
    }

    private static KeyValue str(String k, String v) {
        return KeyValue.newBuilder().setKey(k)
                .setValue(AnyValue.newBuilder().setStringValue(v).build()).build();
    }

    private static KeyValue intv(String k, long v) {
        return KeyValue.newBuilder().setKey(k)
                .setValue(AnyValue.newBuilder().setIntValue(v).build()).build();
    }

    @Test
    void parsesRealPlixeGetAdminUsersTrace() {
        String traceId = "253be4e2ec34f1f48f8fa75758f48b32";
        String sServer = "1111111111111111";
        String sController = "2222222222222222";
        String sRepo = "3333333333333333";
        String sDb = "4444444444444444";

        // SERVER entry — carries the URL, no code attribute.
        Span server = Span.newBuilder()
                .setTraceId(id(traceId)).setSpanId(id(sServer))
                .setName("GET /api/admin/users")
                .setKind(Span.SpanKind.SPAN_KIND_SERVER)
                .setStartTimeUnixNano(100).setEndTimeUnixNano(200)
                .setStatus(Status.newBuilder().setCode(Status.StatusCode.STATUS_CODE_UNSET).build())
                .addAttributes(str("http.request.method", "GET"))
                .addAttributes(str("url.path", "/api/admin/users"))
                .addAttributes(str("server.address", "localhost"))
                .addAttributes(intv("server.port", 5180))
                .build();

        // Instrumented controller method (methods.include) — code attributes.
        Span controller = Span.newBuilder()
                .setTraceId(id(traceId)).setSpanId(id(sController)).setParentSpanId(id(sServer))
                .setName("AdminUsersController.list")
                .setKind(Span.SpanKind.SPAN_KIND_INTERNAL)
                .setStartTimeUnixNano(130).setEndTimeUnixNano(190)
                .addAttributes(str("code.namespace", "com.plixe.admin.AdminUsersController"))
                .addAttributes(str("code.function", "list"))
                .build();

        // Auto-instrumented Spring Data repository (child of the controller).
        Span repo = Span.newBuilder()
                .setTraceId(id(traceId)).setSpanId(id(sRepo)).setParentSpanId(id(sController))
                .setName("UserRepository.findAll")
                .setKind(Span.SpanKind.SPAN_KIND_INTERNAL)
                .setStartTimeUnixNano(140).setEndTimeUnixNano(180)
                .addAttributes(str("code.namespace", "com.plixe.user.UserRepository"))
                .addAttributes(str("code.function", "findAll"))
                .build();

        // DB span — NO code attribute. Must NOT become a class; the frontend
        // bridges through it. Here we only assert it flattens with null class.
        Span db = Span.newBuilder()
                .setTraceId(id(traceId)).setSpanId(id(sDb)).setParentSpanId(id(sRepo))
                .setName("SELECT plixe.users")
                .setKind(Span.SpanKind.SPAN_KIND_CLIENT)
                .setStartTimeUnixNano(145).setEndTimeUnixNano(170)
                .addAttributes(str("db.system", "postgresql"))
                .build();

        byte[] body = ExportTraceServiceRequest.newBuilder()
                .addResourceSpans(ResourceSpans.newBuilder()
                        .addScopeSpans(ScopeSpans.newBuilder()
                                .addSpans(server).addSpans(controller)
                                .addSpans(repo).addSpans(db)))
                .build().toByteArray();

        List<TraceSpanDto> spans = parser.parse(body);

        assertThat(spans).hasSize(4);

        // Ids are lower-hex round-tripped from the raw bytes.
        TraceSpanDto srv = spans.stream().filter(s -> s.spanId().equals(sServer)).findFirst().orElseThrow();
        assertThat(srv.traceId()).isEqualTo(traceId);
        assertThat(srv.parentSpanId()).isNull();
        assertThat(srv.className()).isNull();                 // SERVER entry, no code
        assertThat(srv.httpUrl()).isEqualTo("localhost:5180/api/admin/users"); // built from attrs
        assertThat(srv.spanName()).isEqualTo("GET /api/admin/users");

        TraceSpanDto ctl = spans.stream().filter(s -> s.spanId().equals(sController)).findFirst().orElseThrow();
        assertThat(ctl.parentSpanId()).isEqualTo(sServer);
        assertThat(ctl.fqcn()).isEqualTo("com.plixe.admin.AdminUsersController");
        assertThat(ctl.className()).isEqualTo("AdminUsersController"); // simple name derived
        assertThat(ctl.method()).isEqualTo("list");

        TraceSpanDto rep = spans.stream().filter(s -> s.spanId().equals(sRepo)).findFirst().orElseThrow();
        assertThat(rep.parentSpanId()).isEqualTo(sController);  // child of the controller
        assertThat(rep.className()).isEqualTo("UserRepository");
        assertThat(rep.method()).isEqualTo("findAll");

        TraceSpanDto dbDto = spans.stream().filter(s -> s.spanId().equals(sDb)).findFirst().orElseThrow();
        assertThat(dbDto.parentSpanId()).isEqualTo(sRepo);
        assertThat(dbDto.className()).isNull();                 // no code attr → not a class
        assertThat(dbDto.httpUrl()).isNull();
    }
}
