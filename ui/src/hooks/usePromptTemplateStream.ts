import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftPromptTemplateRequest } from "@paperclipai/shared";
import { streamDraftPromptTemplate } from "../api/draftPromptTemplate";

export type PromptTemplateStreamStatus =
  | "idle"
  | "streaming"
  | "done"
  | "error"
  | "canceled";

export interface UsePromptTemplateStreamResult {
  status: PromptTemplateStreamStatus;
  preview: string;
  error: string | null;
  start: (body: DraftPromptTemplateRequest) => void;
  cancel: () => void;
  reset: () => void;
}

export function usePromptTemplateStream(
  companyId: string | null,
): UsePromptTemplateStreamResult {
  const [status, setStatus] = useState<PromptTemplateStreamStatus>("idle");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight stream when the consuming component unmounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus((prev) => (prev === "streaming" ? "canceled" : prev));
  }, []);

  const reset = useCallback(() => {
    cancel();
    setPreview("");
    setError(null);
    setStatus("idle");
  }, [cancel]);

  const start = useCallback(
    (body: DraftPromptTemplateRequest) => {
      if (!companyId) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setPreview("");
      setError(null);
      setStatus("streaming");

      (async () => {
        try {
          for await (const event of streamDraftPromptTemplate(
            companyId,
            body,
            controller.signal,
          )) {
            if (controller.signal.aborted) return;
            if (event.kind === "delta") {
              setPreview((prev) => prev + event.delta);
            } else if (event.kind === "done") {
              setStatus("done");
              return;
            } else if (event.kind === "error") {
              setError(event.message);
              setStatus("error");
              return;
            }
          }
          // stream ended without explicit done/error
          setStatus((prev) => (prev === "streaming" ? "done" : prev));
        } catch (err) {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : "stream failed");
          setStatus("error");
        } finally {
          if (controllerRef.current === controller) {
            controllerRef.current = null;
          }
        }
      })();
    },
    [companyId],
  );

  return { status, preview, error, start, cancel, reset };
}
