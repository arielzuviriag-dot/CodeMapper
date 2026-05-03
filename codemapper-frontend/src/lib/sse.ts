import type { SSEEventType } from "./types";

export interface SSEHandlers {
  onEvent: (type: SSEEventType, payload: unknown) => void;
  onOpen?: () => void;
  onError?: (err: Event) => void;
}

const KNOWN_EVENTS: SSEEventType[] = [
  "session_start",
  "package_found",
  "class_found",
  "fields_parsed",
  "methods_parsed",
  "connection_found",
  "session_complete",
  "error",
];

export function openStream(url: string, handlers: SSEHandlers): EventSource {
  const es = new EventSource(url);

  es.onopen = () => handlers.onOpen?.();
  es.onerror = (err) => handlers.onError?.(err);

  es.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as { type: SSEEventType; data: unknown };
      if (parsed && parsed.type) {
        handlers.onEvent(parsed.type, parsed.data);
      }
    } catch {
      // ignore non-JSON keep-alives
    }
  };

  KNOWN_EVENTS.forEach((evt) => {
    es.addEventListener(evt, (raw) => {
      const me = raw as MessageEvent<string>;
      try {
        const data = me.data ? JSON.parse(me.data) : {};
        handlers.onEvent(evt, data);
      } catch {
        handlers.onEvent(evt, me.data);
      }
    });
  });

  return es;
}
