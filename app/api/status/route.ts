import { env } from "cloudflare:workers";
import { ragCounts } from "../../lib/rag";

export async function GET() {
  const runtime = env as unknown as Record<string, string | undefined> & { DB?: D1Database };
  const configuredPersonas = ["KUNKUN", "FENGGE", "LINQINGXIA", "TULEI", "LAOCAN"];
  const voicePersonas = configuredPersonas.filter((persona) => Boolean(runtime[`MINIMAX_VOICE_ID_${persona}`])).map((persona) => persona.toLowerCase());
  const ttsProviders = Object.fromEntries(configuredPersonas.map((persona) => [persona.toLowerCase(), runtime[`MINIMAX_VOICE_ID_${persona}`] ? "minimax" : "none"]));
  const voiceReady = Object.fromEntries(configuredPersonas.map((persona) => [persona.toLowerCase(), Boolean(runtime[`MINIMAX_VOICE_ID_${persona}`])]));
  const ttsSpeeds = Object.fromEntries(configuredPersonas.map((persona) => [persona.toLowerCase(), Number(runtime[`MINIMAX_TTS_SPEED_${persona}`] || runtime.MINIMAX_TTS_SPEED || 1)]));
  const minimaxTts = runtime.MINIMAX_TTS_PUBLIC_ENABLED === "true" && Boolean(runtime.MINIMAX_API_KEY && voicePersonas.length);
  const counts = runtime.DB ? await ragCounts(runtime.DB) : {};
  return Response.json({
    ready: Boolean(runtime.DEEPSEEK_API_KEY),
    freeMessages: Number(runtime.PUBLIC_FREE_MESSAGES || 5),
    voiceMode: minimaxTts ? "minimax_server" : "not_configured",
    minimaxTts,
    voicePersonas,
    ttsProviders,
    voiceReady,
    ttsSpeeds,
    sourcePolicy: "approved_production_only",
    ragMode: "facts_and_style",
    ragCounts: counts,
  });
}
