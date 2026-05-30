package com.codemapper.trace;

import com.codemapper.model.dto.trace.TraceSpanDto;
import com.codemapper.service.OtlpTraceParser;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the OTLP/JSON shape quirks {@link OtlpTraceParser} has to defend
 * against — the things that silently break a naive parser.
 */
class OtlpTraceParserTest {

    private final OtlpTraceParser parser = new OtlpTraceParser();
    private final ObjectMapper mapper = new ObjectMapper();

    @SuppressWarnings("unchecked")
    private Map<String, Object> json(String s) throws Exception {
        return mapper.readValue(s, Map.class);
    }

    @Test
    void parsesFullSpanWithCodeAttributesAndStringNanos() throws Exception {
        Map<String, Object> body = json("""
            {"resourceSpans":[{"scopeSpans":[{"spans":[{
              "traceId":"abc123","spanId":"s1","parentSpanId":"",
              "name":"UserService.validateLogin",
              "startTimeUnixNano":"1000000000","endTimeUnixNano":"1012000000",
              "status":{"code":1},
              "attributes":[
                {"key":"code.namespace","value":{"stringValue":"com.app.UserService"}},
                {"key":"code.function","value":{"stringValue":"validateLogin"}}
              ]
            }]}]}]}
            """);

        List<TraceSpanDto> spans = parser.parse(body);

        assertThat(spans).hasSize(1);
        TraceSpanDto s = spans.get(0);
        assertThat(s.traceId()).isEqualTo("abc123");
        assertThat(s.spanId()).isEqualTo("s1");
        assertThat(s.parentSpanId()).isNull(); // "" normalized to null (root)
        assertThat(s.fqcn()).isEqualTo("com.app.UserService");
        assertThat(s.className()).isEqualTo("UserService");
        assertThat(s.method()).isEqualTo("validateLogin");
        assertThat(s.status()).isEqualTo("OK");
        assertThat(s.durationMs()).isEqualTo(12L); // (1012 - 1000) M nanos = 12ms
        assertThat(s.error()).isNull();
    }

    @Test
    void mapsStatusCodeAsEnumString() throws Exception {
        Map<String, Object> body = json("""
            {"resourceSpans":[{"scopeSpans":[{"spans":[{
              "spanId":"s1","status":{"code":"STATUS_CODE_ERROR"},"attributes":[]
            }]}]}]}
            """);
        assertThat(parser.parse(body).get(0).status()).isEqualTo("ERROR");
    }

    @Test
    void extractsExceptionEventAndForcesErrorStatus() throws Exception {
        // status left UNSET but an exception event present → must become ERROR.
        Map<String, Object> body = json("""
            {"resourceSpans":[{"scopeSpans":[{"spans":[{
              "spanId":"s1","status":{"code":0},
              "events":[{"name":"exception","attributes":[
                {"key":"exception.type","value":{"stringValue":"java.lang.NullPointerException"}},
                {"key":"exception.message","value":{"stringValue":"boom"}},
                {"key":"exception.stacktrace","value":{"stringValue":"at com.app.X(...)"}}
              ]}],
              "attributes":[]
            }]}]}]}
            """);

        TraceSpanDto s = parser.parse(body).get(0);
        assertThat(s.status()).isEqualTo("ERROR");
        assertThat(s.error()).isNotNull();
        assertThat(s.error().type()).isEqualTo("java.lang.NullPointerException");
        assertThat(s.error().message()).isEqualTo("boom");
        assertThat(s.error().stacktrace()).contains("com.app.X");
    }

    @Test
    void toleratesSpanWithoutCodeAttributes() throws Exception {
        // Framework/DB span: no code.namespace. fqcn/className null, still parsed
        // (the frontend bridges parent→child through it).
        Map<String, Object> body = json("""
            {"resourceSpans":[{"scopeSpans":[{"spans":[{
              "spanId":"s1","parentSpanId":"root","name":"GET /api","attributes":[]
            }]}]}]}
            """);
        TraceSpanDto s = parser.parse(body).get(0);
        assertThat(s.fqcn()).isNull();
        assertThat(s.className()).isNull();
        assertThat(s.spanName()).isEqualTo("GET /api");
        assertThat(s.parentSpanId()).isEqualTo("root");
    }

    @Test
    void emptyAndGarbageInputYieldNoSpans() {
        assertThat(parser.parse(null)).isEmpty();
        assertThat(parser.parse(Map.of())).isEmpty();
        assertThat(parser.parse(Map.of("resourceSpans", "not-a-list"))).isEmpty();
    }
}
