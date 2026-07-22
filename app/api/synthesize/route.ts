import { env } from "cloudflare:workers";

type PersonaId = "kunkun" | "fengge" | "linqingxia" | "tulei";

function cleanForSpeech(text: string) {
  const cues = /语气|平静|平和|轻声|低声|温柔|认真|坚定|微笑|叹气|停顿|沉默|放松|思考|缓慢/;
  return text
    .replace(/[（(\[]([^）)\]\n]{1,40})[）)\]]/g, (whole, cue: string) => cues.test(cue) ? "" : whole)
    .replace(/[#*_`>]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 1200);
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function visitorKey(request: Request, supplied: string) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  return sha256(`${ip}:${supplied}`);
}

function hexToBytes(hex: string) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) throw new Error("invalid_audio");
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

export async function POST(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined> & { DB?: D1Database };
  if (runtime.MINIMAX_TTS_PUBLIC_ENABLED !== "true" || !runtime.MINIMAX_API_KEY || !runtime.MINIMAX_VOICE_ID_KUNKUN) {
    return Response.json({ error: "MiniMax 云端语音尚未启用。" }, { status: 503 });
  }
  if (!runtime.DB) return Response.json({ error: "语音授权服务暂不可用。" }, { status: 503 });

  const payload = await request.json() as { persona?: PersonaId; text?: string; grant?: string };
  if (payload.persona !== "kunkun") return Response.json({ error: "当前角色尚未配置云端语音。" }, { status: 400 });
  const text = cleanForSpeech(String(payload.text || ""));
  const grant = String(payload.grant || "");
  if (!text || !grant) return Response.json({ error: "语音请求无效。" }, { status: 400 });

  const suppliedId = request.headers.get("x-visitor-id") || "anonymous";
  const id = await visitorKey(request, suppliedId);
  await runtime.DB.prepare("CREATE TABLE IF NOT EXISTS tts_grants (grant_id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, reply_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, status INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const claim = await runtime.DB.prepare("SELECT grant_id FROM tts_grants WHERE grant_id = ? AND visitor_id = ? AND reply_hash = ? AND expires_at >= ? AND status = 0")
    .bind(grant, id, await sha256(text), Date.now())
    .first<{ grant_id: string }>();
  if (!claim) return Response.json({ error: "这段回复的语音凭证已失效，请重新对话。" }, { status: 403 });
  const locked = await runtime.DB.prepare("UPDATE tts_grants SET status = 1 WHERE grant_id = ? AND status = 0").bind(grant).run();
  if (!locked.meta.changes) return Response.json({ error: "语音正在生成或已经生成。" }, { status: 409 });

  try {
    const upstream = await fetch(`${(runtime.MINIMAX_API_BASE || "https://api.minimax.io").replace(/\/$/, "")}/v1/t2a_v2`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${runtime.MINIMAX_API_KEY}` },
      body: JSON.stringify({
        model: runtime.MINIMAX_TTS_MODEL || "speech-2.8-turbo",
        text,
        stream: false,
        output_format: "hex",
        language_boost: "Chinese",
        voice_setting: { voice_id: runtime.MINIMAX_VOICE_ID_KUNKUN, speed: 1.03, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 24000, bitrate: 128000, format: "mp3", channel: 1 },
      }),
    });
    const data = await upstream.json() as { data?: { audio?: string }; base_resp?: { status_code?: number; status_msg?: string } };
    if (!upstream.ok || data.base_resp?.status_code !== 0 || !data.data?.audio) throw new Error(data.base_resp?.status_msg || "upstream_failed");
    const audio = hexToBytes(data.data.audio);
    return new Response(audio, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "private, no-store",
        "content-length": String(audio.byteLength),
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    await runtime.DB.prepare("UPDATE tts_grants SET status = 0 WHERE grant_id = ?").bind(grant).run();
    return Response.json({ error: "MiniMax 语音服务暂时没有响应，请稍后重试。" }, { status: 502 });
  }
}
