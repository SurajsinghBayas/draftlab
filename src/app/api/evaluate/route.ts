import { z } from "zod";
import { evaluateDraft } from "@/lib/evaluate";
import { jsonError, ndjsonResponse, rateLimited } from "@/lib/http";
import { DraftInputSchema } from "@/lib/types";

const Body = z.object({ input: DraftInputSchema, draft: z.string().trim().min(20, "The draft is too short to evaluate").max(20_000) });

export async function POST(request: Request) {
  if (rateLimited(request, 12)) return jsonError("Too many evaluations. Wait a minute and try again.", 429);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

  return ndjsonResponse(async (send) => {
    const report = await evaluateDraft(parsed.data.input, parsed.data.draft, (metric) => send({ t: "metric", metric }));
    send({ t: "report", report });
  });
}
