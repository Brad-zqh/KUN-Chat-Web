import { env } from "cloudflare:workers";

export async function GET() {
  const runtime = env as unknown as Record<string, string | undefined>;
  const voicePersonas = ["KUNKUN", "FENGGE", "LINQINGXIA", "TULEI"].filter((persona) => Boolean(runtime[`MINIMAX_VOICE_ID_${persona}`])).map((persona) => persona.toLowerCase());
  const minimaxTts = runtime.MINIMAX_TTS_PUBLIC_ENABLED === "true" && Boolean(runtime.MINIMAX_API_KEY && voicePersonas.length);
  return Response.json({
    ready: Boolean(runtime.DEEPSEEK_API_KEY),
    freeMessages: Number(runtime.PUBLIC_FREE_MESSAGES || 5),
    voiceMode: minimaxTts ? "minimax_server" : "not_configured",
    minimaxTts,
    voicePersonas,
    sourcePolicy: "approved_only",
  });
}
