import { env } from "cloudflare:workers";
import { ensureRagSchema, type PersonaId } from "../../../lib/rag";

type ImportRecord = { record_id?: string; text?: string; title?: string; url?: string; tags_json?: string };

export async function POST(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined> & { DB?: D1Database };
  const authorization = request.headers.get("authorization") || "";
  if (!runtime.RAG_IMPORT_SECRET || authorization !== `Bearer ${runtime.RAG_IMPORT_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!runtime.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });

  const payload = await request.json() as { persona?: PersonaId; kind?: "facts" | "styles"; reset?: boolean; records?: ImportRecord[] };
  const personas: PersonaId[] = ["kunkun", "fengge", "linqingxia", "tulei"];
  if (!payload.persona || !personas.includes(payload.persona) || !["facts", "styles"].includes(payload.kind || "") || !Array.isArray(payload.records) || payload.records.length > 100) {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }
  const records = payload.records.map((record) => ({
    record_id: String(record.record_id || "").slice(0, 240),
    text: String(record.text || "").trim().slice(0, 12000),
    title: String(record.title || "").trim().slice(0, 500),
    url: String(record.url || "").trim().slice(0, 1800),
    tags_json: String(record.tags_json || "[]").slice(0, 2000),
  })).filter((record) => record.record_id && record.text);

  await ensureRagSchema(runtime.DB);
  const table = payload.kind === "facts" ? "rag_facts" : "rag_styles";
  if (payload.reset) await runtime.DB.prepare(`DELETE FROM ${table} WHERE persona = ?`).bind(payload.persona).run();
  if (records.length) {
    const statements = records.map((record) => payload.kind === "facts"
      ? runtime.DB!.prepare("INSERT INTO rag_facts (persona, record_id, text, title, url) VALUES (?, ?, ?, ?, ?) ON CONFLICT(persona, record_id) DO UPDATE SET text=excluded.text, title=excluded.title, url=excluded.url").bind(payload.persona, record.record_id, record.text, record.title, record.url)
      : runtime.DB!.prepare("INSERT INTO rag_styles (persona, record_id, text, title, url, tags_json) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(persona, record_id) DO UPDATE SET text=excluded.text, title=excluded.title, url=excluded.url, tags_json=excluded.tags_json").bind(payload.persona, record.record_id, record.text, record.title, record.url, record.tags_json));
    await runtime.DB.batch(statements);
  }
  const count = await runtime.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE persona = ?`).bind(payload.persona).first<{ count: number }>();
  return Response.json({ ok: true, persona: payload.persona, kind: payload.kind, imported: records.length, total: Number(count?.count || 0) });
}
