import { requireAuth } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/api";
import {
  classifyInputSchema,
  classifyIssueDescription,
  type ClassifyInput,
} from "@/lib/ai-classifier";

export async function POST(request: Request) {
  // Enforce authentication so only registered students/staff can invoke classification
  const auth = await requireAuth(request, ["reporter", "staff"]);
  if (auth.response) return auth.response;

  const parsed = await readJson<ClassifyInput>(request, classifyInputSchema);
  if (parsed.response) return parsed.response;

  try {
    const result = await classifyIssueDescription(parsed.data!);
    return Response.json({ data: result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Classification failed";
    return errorResponse(500, "CLASSIFIER_ERROR", message);
  }
}
