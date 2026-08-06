export type PersonaId = "kunkun" | "fengge" | "laocan" | "qiuhao" | "qingliangshanren" | "zouyuxin";

export type RagRecord = {
  record_id: string;
  text: string;
  title: string;
  url: string;
  tags_json?: string;
};

export type RagResult = {
  facts: RagRecord[];
  styles: RagRecord[];
};

export async function ensureRagSchema(db: D1Database) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS rag_facts (persona TEXT NOT NULL, record_id TEXT NOT NULL, text TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', PRIMARY KEY(persona, record_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS rag_styles (persona TEXT NOT NULL, record_id TEXT NOT NULL, text TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]', PRIMARY KEY(persona, record_id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_rag_facts_persona ON rag_facts(persona)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_rag_styles_persona ON rag_styles(persona)"),
  ]);
}

function terms(text: string) {
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  const result = new Set<string>();
  for (const token of normalized.match(/[a-z0-9][a-z0-9._+-]{1,}|[\u3400-\u9fff]/g) || []) result.add(token);
  const chinese = normalized.replace(/[^\u3400-\u9fff]/g, "");
  for (let index = 0; index < chinese.length - 1; index += 1) result.add(chinese.slice(index, index + 2));
  return result;
}

function rank(rows: RagRecord[], query: string, limit: number, includeZero = false) {
  const queryTerms = terms(query);
  return rows
    .map((row, index) => {
      const haystack = `${row.title}\n${row.text}`.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (!haystack.includes(term)) continue;
        score += term.length > 1 ? 4 : 1;
        if (row.title.toLowerCase().includes(term)) score += 2;
      }
      return { row, score, index };
    })
    .filter((item) => includeZero || item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ row }) => row);
}

export async function searchRag(db: D1Database, persona: PersonaId, query: string): Promise<RagResult> {
  await ensureRagSchema(db);
  const [facts, styles] = await Promise.all([
    db.prepare("SELECT record_id, text, title, url FROM rag_facts WHERE persona = ?").bind(persona).all<RagRecord>(),
    db.prepare("SELECT record_id, text, title, url, tags_json FROM rag_styles WHERE persona = ?").bind(persona).all<RagRecord>(),
  ]);
  return {
    facts: rank(facts.results || [], query, 5),
    styles: rank(styles.results || [], query, 4, true),
  };
}

export async function ragCounts(db: D1Database) {
  await ensureRagSchema(db);
  const rows = await db.prepare(`
    SELECT persona, SUM(facts) AS facts, SUM(styles) AS styles FROM (
      SELECT persona, COUNT(*) AS facts, 0 AS styles FROM rag_facts GROUP BY persona
      UNION ALL
      SELECT persona, 0 AS facts, COUNT(*) AS styles FROM rag_styles GROUP BY persona
    ) GROUP BY persona
  `).all<{ persona: PersonaId; facts: number; styles: number }>();
  return Object.fromEntries((rows.results || []).map((row) => [row.persona, { facts: Number(row.facts), styles: Number(row.styles) }]));
}
