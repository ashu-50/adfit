"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { analysisKeys } from "./use-analyses";
import type { AnalysisStatusPayload, ProgressEvent } from "@/types/api";

type StreamState = {
  events: ProgressEvent[];
  status: AnalysisStatusPayload | null;
  connected: boolean;
  finished: boolean;
};

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

/**
 * Subscribes to the server's progress stream for a running analysis.
 *
 * EventSource rather than a polling query: the pipeline emits stage changes at
 * irregular intervals and a 1s poll would either miss them or hammer the API
 * for a stream that lives about thirty seconds. On completion this invalidates
 * the detail query so the report renders without a manual refresh.
 */
export function useAnalysisEvents(id: string, enabled: boolean): StreamState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<StreamState>({ events: [], status: null, connected: false, finished: false });
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !id) return;

    const source = new EventSource(`/api/analyses/${id}/events`);
    sourceRef.current = source;

    source.onopen = () => setState((s) => ({ ...s, connected: true }));

    source.addEventListener("progress", (e) => {
      const payload = JSON.parse((e as MessageEvent<string>).data) as ProgressEvent;
      // Cap the buffer: a long analysis emits plenty and the panel only shows
      // the tail, so retaining all of them just grows memory.
      setState((s) => ({ ...s, events: [...s.events, payload].slice(-40) }));
    });

    source.addEventListener("status", (e) => {
      const payload = JSON.parse((e as MessageEvent<string>).data) as AnalysisStatusPayload;
      setState((s) => ({ ...s, status: payload }));
    });

    source.addEventListener("done", () => {
      setState((s) => ({ ...s, finished: true, connected: false }));
      void queryClient.invalidateQueries({ queryKey: analysisKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: analysisKeys.all });
      source.close();
    });

    source.onerror = () => {
      setState((s) => ({ ...s, connected: false }));
      // EventSource reconnects on its own; closing here only if the server
      // already signalled completion avoids fighting that behaviour.
      setState((s) => {
        if (s.status && TERMINAL.has(s.status.status)) source.close();
        return s;
      });
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [id, enabled, queryClient]);

  return state;
}
