"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { openStream } from "@/lib/sse";
import { streamUrl } from "@/lib/api";
import { useGraphStore } from "@/store/graphStore";
import type {
  ClassFoundPayload,
  ConnectionFoundPayload,
  ErrorPayload,
  FieldsParsedPayload,
  FocusClassLoadedPayload,
  FocusConnectionPayload,
  LimitReachedPayload,
  MethodsParsedPayload,
  PackageFoundPayload,
  SessionCompletePayload,
  SessionStartPayload,
} from "@/lib/types";

const FLUSH_INTERVAL_MS = 100;

interface Buffer {
  classes: ClassFoundPayload[];
  fields: FieldsParsedPayload[];
  methods: MethodsParsedPayload[];
  connections: ConnectionFoundPayload[];
  packages: string[];
}

function emptyBuffer(): Buffer {
  return {
    classes: [],
    fields: [],
    methods: [],
    connections: [],
    packages: [],
  };
}

export function useSSE(sessionId: string | null) {
  const addClassesBatch = useGraphStore((s) => s.addClassesBatch);
  const updateFieldsBatch = useGraphStore((s) => s.updateClassesFieldsBatch);
  const updateMethodsBatch = useGraphStore((s) => s.updateClassesMethodsBatch);
  const addConnectionsBatch = useGraphStore((s) => s.addConnectionsBatch);
  const addPackagesBatch = useGraphStore((s) => s.addPackagesBatch);
  const setStatus = useGraphStore((s) => s.setStatus);
  const setStats = useGraphStore((s) => s.setStats);
  const setLimitReached = useGraphStore((s) => s.setLimitReached);
  const setFocusClass = useGraphStore((s) => s.setFocusClass);
  const addFocusConnection = useGraphStore((s) => s.addFocusConnection);

  const bufferRef = useRef<Buffer>(emptyBuffer());

  useEffect(() => {
    if (!sessionId) return;

    setStatus("streaming");
    setStats({ parseStartTime: Date.now() });

    let totalConnsSeen = 0;
    const flush = () => {
      const buf = bufferRef.current;
      if (
        buf.classes.length === 0 &&
        buf.fields.length === 0 &&
        buf.methods.length === 0 &&
        buf.connections.length === 0 &&
        buf.packages.length === 0
      )
        return;
      bufferRef.current = emptyBuffer();
      if (buf.connections.length) {
        console.log(
          `[CodeMapper] flush: classes=${buf.classes.length} fields=${buf.fields.length} methods=${buf.methods.length} connections=${buf.connections.length}`,
          buf.connections[0],
        );
      }
      // Order matters: classes first so subsequent updates find them.
      if (buf.packages.length) addPackagesBatch(buf.packages);
      if (buf.classes.length) addClassesBatch(buf.classes);
      if (buf.fields.length) updateFieldsBatch(buf.fields);
      if (buf.methods.length) updateMethodsBatch(buf.methods);
      if (buf.connections.length) {
        const beforeStore = useGraphStore.getState().edges.length;
        addConnectionsBatch(buf.connections);
        const afterStore = useGraphStore.getState().edges.length;
        console.log(
          `[CodeMapper] connections store: +${afterStore - beforeStore} (total in store: ${afterStore})`,
        );
      }
    };

    const interval = setInterval(flush, FLUSH_INTERVAL_MS);

    let esRef: EventSource | null = null;
    const es = openStream(streamUrl(sessionId), {
      onOpen: () => {
        console.log("[CodeMapper] SSE open", streamUrl(sessionId));
        setStatus("streaming");
      },
      onError: (err) => {
        const rs = esRef?.readyState;
        console.warn(
          `[CodeMapper] SSE error/close. readyState=${rs} (0=connecting,1=open,2=closed). conns received so far=${totalConnsSeen}`,
          err,
        );
        // readyState 2 = closed, won't reconnect. Surface the failure so the
        // loader doesn't hang if the stream died before session_complete.
        if (rs === 2 && useGraphStore.getState().sessionStatus !== "complete") {
          flush();
          setStatus("error");
          toast.error("Stream cerrado inesperadamente");
        }
      },
      onEvent: (type, data) => {
        switch (type) {
          case "session_start": {
            const p = data as SessionStartPayload;
            setStats({
              projectName: p.projectName ?? "Proyecto",
              parseStartTime: p.startedAt ?? Date.now(),
            });
            break;
          }
          case "package_found": {
            const p = data as PackageFoundPayload;
            if (p?.packageName) bufferRef.current.packages.push(p.packageName);
            break;
          }
          case "class_found":
            bufferRef.current.classes.push(data as ClassFoundPayload);
            break;
          case "fields_parsed":
            bufferRef.current.fields.push(data as FieldsParsedPayload);
            break;
          case "methods_parsed":
            bufferRef.current.methods.push(data as MethodsParsedPayload);
            break;
          case "connection_found":
            totalConnsSeen++;
            if (useGraphStore.getState().focusMode) {
              // FOCUS mode: payload is a class node + connectionType + position.
              // Skip the batched buffer and write directly so the radial UI can
              // animate connections one-by-one.
              addFocusConnection(data as FocusConnectionPayload);
            } else {
              bufferRef.current.connections.push(data as ConnectionFoundPayload);
            }
            break;
          case "focus_class_loaded": {
            const p = data as FocusClassLoadedPayload;
            console.log("[CodeMapper] focus_class_loaded", p.fullyQualifiedName);
            setFocusClass(p);
            setStats({ projectName: p.name });
            break;
          }
          case "session_complete": {
            const p = data as SessionCompletePayload;
            console.log(
              `[CodeMapper] session_complete recv. SSE conns received=${totalConnsSeen}, backend reports totalConnections=${p?.totalConnections}, totalClasses=${p?.totalClasses}`,
              p,
            );
            flush();
            setStats({
              parseEndTime: Date.now(),
              totalClasses: p.totalClasses,
              totalConnections: p.totalConnections,
            });
            setStatus("complete");
            toast.success("Análisis completado");
            es.close();
            clearInterval(interval);
            break;
          }
          case "limit_reached": {
            const p = data as LimitReachedPayload;
            console.log("[CodeMapper] limit_reached recv", p);
            setLimitReached({
              reached: true,
              limit: p.limit,
              totalAvailable: p.totalFilesAvailable,
              parsed: p.filesParsed,
              message: p.message,
            });
            break;
          }
          case "error": {
            const p = data as ErrorPayload;
            console.error("[CodeMapper] SSE error event", p);
            flush();
            setStatus("error");
            toast.error(p?.message ?? "Error en el stream de análisis");
            es.close();
            clearInterval(interval);
            break;
          }
        }
      },
    });

    esRef = es;

    return () => {
      clearInterval(interval);
      flush();
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
}
