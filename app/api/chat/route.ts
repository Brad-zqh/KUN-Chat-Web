import { env } from "cloudflare:workers";

type PersonaId = "kunkun" | "fengge" | "linqingxia" | "tulei";
type ChatMessage = { role: "user" | "assistant"; content: string };

const personaPrompts: Record<PersonaId, string> = {
  kunkun: "你是根据蔡徐坤公开表达资料设计的AI同人角色，昵称坤坤。不是蔡徐坤本人或工作室。语气温和、克制、自然，适合聊音乐、舞台、创作和练习。先回答用户的具体问题，不重复自我介绍，不编造行程、私生活和未公开观点。",
  fengge: "你是根据峰哥公开表达资料设计的AI同人角色，昵称峰哥。不是峰哥本人。表达直接、节奏快，可以反问，但不刻意冒犯，不编造收入、旅行、投资、直播经历或私人关系。人物专属RAG仍在审核，缺乏证据时直接说明。",
  linqingxia: "你是根据林青霞公开表达资料设计的AI同人角色，昵称林青霞。不是林青霞本人。表达从容、清醒、温暖，适合聊电影、阅读、写作与审美。电影角色台词不等于本人观点，不编造家庭和私人经历。人物专属RAG仍在审核。",
  tulei: "你是根据涂磊公开表达资料设计的AI同人角色，昵称涂磊。不是涂磊本人。表达务实直接，先厘清责任和边界，不训斥用户，不作心理诊断。节目嘉宾故事不是本人经历。人物专属RAG仍在审核。",
};

function clean(text: string) {
  return text.replace(/[（(][^）)\n]{1,40}[）)]/g, "").replace(/^\s+|\s+$/g, "");
}

async function visitorKey(request: Request, supplied: string) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const bytes = new TextEncoder().encode(`${ip}:${supplied}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined> & { DB?: D1Database };
  const apiKey = runtime.DEEPSEEK_API_KEY;
  if (!apiKey) return Response.json({ error: "文字模型尚未配置。" }, { status: 503 });

  const payload = await request.json() as { persona?: PersonaId; message?: string; history?: ChatMessage[] };
  const persona = payload.persona || "kunkun";
  const message = String(payload.message || "").trim().slice(0, 1600);
  if (!personaPrompts[persona] || !message) return Response.json({ error: "请求内容无效。" }, { status: 400 });

  const freeLimit = Math.max(1, Number(runtime.PUBLIC_FREE_MESSAGES || 5));
  const suppliedId = request.headers.get("x-visitor-id") || "anonymous";
  const id = await visitorKey(request, suppliedId);
  let used = 0;
  if (runtime.DB) {
    await runtime.DB.prepare("CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, message_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
    const row = await runtime.DB.prepare("SELECT message_count FROM visitors WHERE id = ?").bind(id).first<{ message_count: number }>();
    used = row?.message_count || 0;
    if (used >= freeLimit) return Response.json({ error: "免费体验次数已用完，账号与充值功能正在开放中。", code: "quota_exhausted", remaining: 0 }, { status: 402 });
  }

  const history = Array.isArray(payload.history) ? payload.history.slice(-10).filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string").map((item) => ({ role: item.role, content: item.content.slice(0, 1600) })) : [];
  const response = await fetch(runtime.DEEPSEEK_BASE_URL || "https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: runtime.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: 0.72,
      max_tokens: 700,
      messages: [{ role: "system", content: `${personaPrompts[persona]} 默认中文，口语化回答。不要显示“（语气平和）”一类舞台提示。` }, ...history, { role: "user", content: message }],
    }),
  });
  if (!response.ok) return Response.json({ error: "模型服务暂时繁忙，请稍后再试。" }, { status: 502 });
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const reply = clean(String(data.choices?.[0]?.message?.content || ""));
  if (!reply) return Response.json({ error: "模型没有返回有效内容。" }, { status: 502 });

  used += 1;
  if (runtime.DB) await runtime.DB.prepare("INSERT INTO visitors (id, message_count, updated_at) VALUES (?, 1, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET message_count = message_count + 1, updated_at = CURRENT_TIMESTAMP").bind(id).run();
  return Response.json({ reply, remaining: Math.max(0, freeLimit - used), persona, disclosure: "AI角色，非真人本人" });
}
