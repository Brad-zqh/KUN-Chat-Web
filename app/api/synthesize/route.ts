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

function hexToBytes(hex: string) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) throw new Error("invalid_audio");
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function audioResponse(audio: ArrayBuffer | Uint8Array, cache = false) {
  const body = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
  return new Response(body, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": cache ? "private, max-age=86400" : "private, no-store",
      "content-length": String(body.byteLength),
      "x-content-type-options": "nosniff",
      "x-kun-audio-cache": cache ? "hit" : "miss",
    },
  });
}

async function minimaxWebSocketAudio(
  apiBase: string,
  apiKey: string,
  voiceId: string,
  text: string,
  model: string,
) {
  const base = apiBase.replace(/\/$/, "").replace(/^https:/, "https:").replace(/^http:/, "http:");
  const response = await fetch(`${base}/ws/v1/t2a_v2`, {
    headers: { Upgrade: "websocket", Authorization: `Bearer ${apiKey}` },
  });
  const socket = (response as Response & { webSocket?: WebSocket & { accept(): void } }).webSocket;
  if (!socket) throw new Error(`websocket_upgrade_failed_${response.status}`);
  socket.accept();

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let started = false;
    let finishSent = false;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("websocket_timeout")), 60000);

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { socket.close(); } catch { /* already closed */ }
      if (error) return reject(error);
      const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      if (!length) return reject(new Error("empty_audio"));
      const audio = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        audio.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(audio);
    }

    socket.addEventListener("message", (event: MessageEvent) => {
      try {
        const message = JSON.parse(String(event.data)) as {
          event?: string;
          is_final?: boolean;
          data?: { audio?: string; is_final?: boolean };
          base_resp?: { status_code?: number; status_msg?: string };
        };
        if (message.base_resp?.status_code) {
          return finish(new Error(message.base_resp.status_msg || `minimax_${message.base_resp.status_code}`));
        }
        if (message.event === "connected_success") {
          socket.send(JSON.stringify({
            event: "task_start",
            model,
            language_boost: "Chinese",
            voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0 },
            audio_setting: { sample_rate: 24000, bitrate: 128000, format: "mp3", channel: 1 },
          }));
        } else if (message.event === "task_started" && !started) {
          started = true;
          socket.send(JSON.stringify({ event: "task_continue", text }));
        }
        if (message.data?.audio) chunks.push(hexToBytes(message.data.audio));
        if ((message.is_final || message.data?.is_final) && !finishSent) {
          finishSent = true;
          socket.send(JSON.stringify({ event: "task_finish" }));
        }
        if (message.event === "task_finished") finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error("websocket_message_failed"));
      }
    });
    socket.addEventListener("error", () => finish(new Error("websocket_error")));
    socket.addEventListener("close", () => {
      if (!settled) finish(new Error("websocket_closed"));
    });
  });
}

export async function POST(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined> & { DB?: D1Database };
  if (runtime.MINIMAX_TTS_PUBLIC_ENABLED !== "true" || !runtime.MINIMAX_API_KEY) {
    return Response.json({ error: "MiniMax 云端语音尚未启用。" }, { status: 503 });
  }
  if (!runtime.DB) return Response.json({ error: "语音授权服务暂不可用。" }, { status: 503 });

  const payload = await request.json() as { persona?: PersonaId; text?: string; grant?: string };
  const persona = payload.persona;
  if (!persona || !["kunkun", "fengge", "linqingxia", "tulei"].includes(persona)) return Response.json({ error: "角色无效。" }, { status: 400 });
  const voiceId = runtime[`MINIMAX_VOICE_ID_${persona.toUpperCase()}`];
  if (!voiceId) return Response.json({ error: "当前数字人尚未配置云端声线。" }, { status: 503 });
  const grant = String(payload.grant || "");
  if (!grant) return Response.json({ error: "语音请求无效。" }, { status: 400 });

  const suppliedId = request.headers.get("x-visitor-id") || "anonymous";
  const id = await sha256(`tts:${suppliedId}`);
  await runtime.DB.prepare("CREATE TABLE IF NOT EXISTS tts_grants_v2 (grant_id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, persona TEXT NOT NULL, reply_text TEXT NOT NULL, reply_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, status INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await runtime.DB.prepare("CREATE TABLE IF NOT EXISTS tts_audio_cache (reply_hash TEXT PRIMARY KEY, audio BLOB NOT NULL, created_at INTEGER NOT NULL)").run();
  const claim = await runtime.DB.prepare("SELECT grant_id, status, reply_text, reply_hash FROM tts_grants_v2 WHERE grant_id = ? AND visitor_id = ? AND persona = ? AND expires_at >= ?")
    .bind(grant, id, persona, Date.now())
    .first<{ grant_id: string; status: number; reply_text: string; reply_hash: string }>();
  if (!claim) return Response.json({ error: "这段回复的语音凭证已失效，请重新对话。" }, { status: 403 });
  const replyHash = claim.reply_hash;
  const text = cleanForSpeech(claim.reply_text);
  if (!text) return Response.json({ error: "语音请求无效。" }, { status: 400 });

  const cached = await runtime.DB.prepare("SELECT audio FROM tts_audio_cache WHERE reply_hash = ?").bind(replyHash).first<{ audio: ArrayBuffer }>();
  if (cached?.audio) return audioResponse(cached.audio, true);

  const locked = await runtime.DB.prepare("UPDATE tts_grants_v2 SET status = 1 WHERE grant_id = ? AND status = 0").bind(grant).run();
  if (!locked.meta.changes) return Response.json({ error: "语音正在生成，请稍后再点一次。" }, { status: 409 });

  try {
    if ((runtime.MINIMAX_TTS_TRANSPORT || "http").toLowerCase() === "websocket") {
      const audio = await minimaxWebSocketAudio(
        runtime.MINIMAX_API_BASE || "https://api.minimax.io",
        runtime.MINIMAX_API_KEY,
        voiceId,
        text,
        runtime.MINIMAX_TTS_MODEL || "speech-2.8-hd",
      );
      const exactAudio = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
      await runtime.DB.batch([
        runtime.DB.prepare("INSERT INTO tts_audio_cache (reply_hash, audio, created_at) VALUES (?, ?, ?) ON CONFLICT(reply_hash) DO UPDATE SET audio=excluded.audio, created_at=excluded.created_at").bind(replyHash, exactAudio, Date.now()),
        runtime.DB.prepare("UPDATE tts_grants_v2 SET status = 2 WHERE grant_id = ?").bind(grant),
      ]);
      return audioResponse(audio);
    }
    const upstream = await fetch(`${(runtime.MINIMAX_API_BASE || "https://api.minimax.io").replace(/\/$/, "")}/v1/t2a_v2`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${runtime.MINIMAX_API_KEY}` },
      body: JSON.stringify({
        model: runtime.MINIMAX_TTS_MODEL || "speech-2.8-turbo",
        text,
        stream: false,
        output_format: "hex",
        language_boost: "Chinese",
        voice_setting: { voice_id: voiceId, speed: 1.03, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 24000, bitrate: 128000, format: "mp3", channel: 1 },
      }),
    });
    const data = await upstream.json() as { data?: { audio?: string }; base_resp?: { status_code?: number; status_msg?: string } };
    if (!upstream.ok || data.base_resp?.status_code !== 0 || !data.data?.audio) throw new Error(data.base_resp?.status_msg || "upstream_failed");
    const audio = hexToBytes(data.data.audio);
    const exactAudio = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
    await runtime.DB.batch([
      runtime.DB.prepare("INSERT INTO tts_audio_cache (reply_hash, audio, created_at) VALUES (?, ?, ?) ON CONFLICT(reply_hash) DO UPDATE SET audio=excluded.audio, created_at=excluded.created_at").bind(replyHash, exactAudio, Date.now()),
      runtime.DB.prepare("UPDATE tts_grants_v2 SET status = 2 WHERE grant_id = ?").bind(grant),
    ]);
    return audioResponse(audio);
  } catch {
    await runtime.DB.prepare("UPDATE tts_grants_v2 SET status = 0 WHERE grant_id = ?").bind(grant).run();
    return Response.json({ error: "MiniMax 语音服务暂时没有响应，请稍后重试。" }, { status: 502 });
  }
}
