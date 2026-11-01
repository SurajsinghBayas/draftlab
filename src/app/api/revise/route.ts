import { z } from "zod";
import { jsonError, ndjsonResponse, rateLimited } from "@/lib/http";
import { streamWriter, WRITER_MODEL } from "@/lib/llm";
import { buildReviseMessages, buildSelectionMessages } from "@/lib/prompts";
import { DraftInputSchema } from "@/lib/types";

const Body = z
  .object({
    input: DraftInputSchema,
    draft: z.string().min(1).max(20_000),
    instruction: z.string().trim().min(2, "Say what to change").max(600),
    selection: z.object({ start: z.number().int().min(0), end: z.number().int().min(1) }).optional(),
  })
  .refine((b) => !b.selection || (b.selection.start < b.selection.end && b.selection.end <= b.draft.length), {
    message: "The selection is outside the draft",
  });

export async function POST(request: Request) {
  if (rateLimited(request)) return jsonError("Too many requests. Wait a minute and try again.", 429);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
  const { input, draft, instruction, selection } = parsed.data;

  const messages = selection
    ? buildSelectionMessages(input, draft, selection, instruction)
    : buildReviseMessages(input, draft, instruction);

  return ndjsonResponse(async (send) => {
    let wrote = false;
    for await (const event of streamWriter(messages, request.signal)) {
      if (event.type === "thinking") send({ t: "thinking" });
      if (event.type === "text") {
        wrote = true;
        send({ t: "delta", v: event.text });
      }
      if (event.type === "finish") {
        if (!wrote) send({ t: "error", message: "The model returned no text. Your draft is unchanged." });
        else send({ t: "done", model: WRITER_MODEL, finish: event.reason });
      }
    }
  });
}
