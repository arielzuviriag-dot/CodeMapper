package com.codemapper.service;

import com.codemapper.model.dto.trace.TraceSpanDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * "Escuchando" mode — fan-out hub between the OTLP ingest endpoint and every
 * browser watching the live execution.
 *
 * <p>This is a <b>broadcast / pub-sub</b> registry, fundamentally different from
 * {@code AnalysisService.openStream}: there, one analysis thread feeds one
 * session's stream and then completes. Here an <em>external</em> producer (the
 * OTel agent hitting {@code /v1/traces}) pushes spans that must reach <em>all</em>
 * connected clients, on a long-lived stream that never completes on its own.
 *
 * <p>Emitters are created with an effectively-infinite timeout (an idle
 * "Escuchando" tab can sit for minutes before the first request arrives) and
 * kept alive by a periodic SSE comment heartbeat so proxies don't reap the
 * connection. Dead emitters (client closed the tab) are pruned on the first
 * failed write.
 */
@Slf4j
@Service
public class TraceBroadcaster {

    /** ~Infinite: a listening tab may wait a long time before any traffic. */
    private static final long STREAM_TIMEOUT_MS = 24L * 60 * 60 * 1000; // 24h

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    /** Register a new browser subscriber. Called by GET /api/trace/stream. */
    public SseEmitter register() {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        emitter.onCompletion(() -> {
            emitters.remove(emitter);
            log.info("Trace stream closed — {} listener(s) left", emitters.size());
        });
        emitter.onTimeout(() -> {
            emitters.remove(emitter);
            emitter.complete();
        });
        emitter.onError(t -> emitters.remove(emitter));
        emitters.add(emitter);
        log.info("Trace stream opened — {} listener(s) now", emitters.size());

        // Greet immediately so the client's onopen fires and the UI flips from
        // "conectando" to "escuchando" even before any span arrives.
        try {
            emitter.send(SseEmitter.event().name("listening").data("{}"));
        } catch (IOException e) {
            emitters.remove(emitter);
        }
        return emitter;
    }

    /** Push one parsed span to every connected browser as a "span" SSE event. */
    public void broadcast(TraceSpanDto span) {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("span").data(span));
            } catch (IOException | IllegalStateException e) {
                // Client hung up (or emitter already completed) — drop it.
                emitters.remove(emitter);
            }
        }
    }

    /**
     * Heartbeat — an SSE comment (": ping") every 15s keeps idle connections
     * from being closed by intermediaries and lets us detect dead emitters
     * during quiet periods rather than only on the next span.
     */
    @Scheduled(fixedRate = 15_000)
    public void heartbeat() {
        if (emitters.isEmpty()) return;
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().comment("ping"));
            } catch (IOException | IllegalStateException e) {
                emitters.remove(emitter);
            }
        }
    }

    /** Test/diagnostics helper. */
    public int listenerCount() {
        return emitters.size();
    }
}
