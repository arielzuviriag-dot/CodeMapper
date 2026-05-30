"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api";
import { useListeningStore } from "@/store/listeningStore";
import type { TraceSpan } from "@/lib/trace";

/** Same cadence as the analysis stream — batch spans and flush into the store
 *  on a fixed interval so a burst of OTel spans is one React update, not N. */
const FLUSH_INTERVAL_MS = 100;

/**
 * Subscribes to the live OTLP trace SSE stream while {@code active} is true.
 * Buffers incoming "span" events and flushes them into {@link useListeningStore}
 * every {@link FLUSH_INTERVAL_MS}. Closes and tears down on deactivation.
 */
export function useTraceStream(active: boolean) {
  const ingest = useListeningStore((s) => s.ingest);
  const bufferRef = useRef<TraceSpan[]>([]);

  useEffect(() => {
    if (!active) return;

    const flush = () => {
      if (bufferRef.current.length === 0) return;
      const batch = bufferRef.current;
      bufferRef.current = [];
      ingest(batch);
    };
    const interval = setInterval(flush, FLUSH_INTERVAL_MS);

    const url = `${API_BASE_URL}/api/trace/stream`;
    const es = new EventSource(url);

    es.addEventListener("span", (raw) => {
      const me = raw as MessageEvent<string>;
      try {
        const span = JSON.parse(me.data) as TraceSpan;
        if (span?.spanId) bufferRef.current.push(span);
      } catch {
        // Ignore a malformed line — the next span will arrive fine.
      }
    });

    // "listening" is the server's greeting on connect — purely informational.
    es.addEventListener("listening", () => {
      // no-op; onopen already flipped the UI. Kept for clarity/debugging.
    });

    es.onerror = () => {
      // EventSource auto-reconnects on transient errors; only warn if it gave
      // up entirely (readyState CLOSED).
      if (es.readyState === EventSource.CLOSED) {
        toast.error("Se cerró la conexión con el stream de trazas");
      }
    };

    return () => {
      clearInterval(interval);
      flush();
      es.close();
    };
  }, [active, ingest]);
}
