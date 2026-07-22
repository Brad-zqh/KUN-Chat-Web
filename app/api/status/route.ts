import { env } from "cloudflare:workers";

export async function GET() {
  const runtime = env as unknown as Record<string, string | undefined>;
  const minimaxTts = runtime.MINIMAX_TTS_PUBLIC_ENABLED === "true" && Boolean(runtime.MINIMAX_API_KEY && runtime.MINIMAX_VOICE_ID_KUNKUN);
  return Response.json({
    ready: Boolean(runtime.DEEPSEEK_API_KEY),
    freeMessages: Number(runtime.PUBLIC_FREE_MESSAGES || 5),
    voiceMode: minimaxTts ? "minimax_server" : "not_configured",
    minimaxTts,
    sourcePolicy: "approved_only",
  });
}
