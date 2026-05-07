import { SSE_EVENT_NAMES, type SSEEventType } from "./types";

export interface SSEHandlers {
  onEvent: (type: SSEEventType, payload: unknown) => void;
  onOpen?: () => void;
  onError?: (err: Event) => void;
}

export function openStream(url: string, handlers: SSEHandlers): EventSource {
  const es = new EventSource(url);

  es.onopen = () => handlers.onOpen?.();
  es.onerror = (err) => handlers.onError?.(err);

  // Default `message` channel — only fires for events without an `event:` field.
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

  // Named events (`event:foo\ndata:{…}`) MUST be subscribed by name. The list
  // is driven by SSE_EVENT_NAMES so every type the union exposes ends up wired.
  SSE_EVENT_NAMES.forEach((evt) => {
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
