import { jsonError, ndjsonResponse, rateLimited } from "@/lib/http";
import { streamWriter, WRITER_MODEL } from "@/lib/llm";
import { buildGenerateMessages } from "@/lib/prompts";
import { DraftInputSchema } from "@/lib/types";

export async function POST(request: Request) {
  if (rateLimited(request)) return jsonError("Too many requests. Wait a minute and try again.", 429);
  const parsed = DraftInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid brief", 400);

  return ndjsonResponse(async (send) => {
    let wrote = false;
    for await (const event of streamWriter(buildGenerateMessages(parsed.data), request.signal)) {
      if (event.type === "thinking") send({ t: "thinking" });
      if (event.type === "text") {
        wrote = true;
        send({ t: "delta", v: event.text });
      }
      if (event.type === "finish") {
        if (!wrote) send({ t: "error", message: "The model returned no text. Try again." });
        else send({ t: "done", model: WRITER_MODEL, finish: event.reason });
      }
    }
  });
}
