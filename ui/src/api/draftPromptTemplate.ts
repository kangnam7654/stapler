import type {
  DraftPromptTemplateRequest,
  DraftPromptTemplateEvent,
} from "@paperclipai/shared";

export async function* streamDraftPromptTemplate(
  companyId: string,
  body: DraftPromptTemplateRequest,
  signal: AbortSignal,
): AsyncIterable<DraftPromptTemplateEvent> {
  const response = await fetch(
    `/api/companies/${encodeURIComponent(companyId)}/agents/draft-prompt-template`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
      credentials: "include",
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `HTTP ${response.status}${text ? ` — ${text.slice(0, 300)}` : ""}`,
    );
  }
  if (!response.body) throw new Error("response has no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = function* (
    raw: string,
  ): Generator<DraftPromptTemplateEvent> {
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      try {
        yield JSON.parse(payload) as DraftPromptTemplateEvent;
      } catch {
        // skip malformed event
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      yield* flush(raw);
    }
  }

  // Flush any trailing event not terminated by "\n\n"
  if (buffer.length > 0) {
    yield* flush(buffer);
    buffer = "";
  }
}
