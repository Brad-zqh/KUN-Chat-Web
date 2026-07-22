import { env } from "cloudflare:workers";

export async function GET() {
  const runtime = env as unknown as Record<string, string | undefined>;
  return Response.json({
    ready: Boolean(runtime.DEEPSEEK_API_KEY),
    freeMessages: Number(runtime.PUBLIC_FREE_MESSAGES || 5),
    voiceMode: "browser",
    sourcePolicy: "approved_only",
  });
}
