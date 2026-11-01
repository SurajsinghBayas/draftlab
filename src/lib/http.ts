import type { StreamEvent } from "./types";

/** Newline-delimited JSON, so an error after streaming starts can still reach the client. */
export function ndjsonResponse(run: (send: (event: StreamEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        await run(send);
      } catch (error) {
        // A reader that left on purpose is not a failure, and there is nobody to tell.
        if (!closed) {
          console.error("[stream]", error);
          send({ t: "error", message: publicMessage(error) });
        }
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Provider errors can echo request details, so the client gets a generic message by status. */
function publicMessage(error: unknown): string {
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403) return "The model provider rejected the API key.";
  if (status === 429) return "The model provider is rate limiting requests. Try again shortly.";
  if (error instanceof Error && error.message.includes("must be set")) return error.message;
  return "The model request failed. Try again.";
}

const hits = new Map<string, number[]>();

/** A small per-IP limit, so one script cannot spend the API allowance. Per process only. */
export function rateLimited(request: Request, limit = 30, windowMs = 60_000): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > limit;
}

export const jsonError = (message: string, status: number) => Response.json({ error: message }, { status });
