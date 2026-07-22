import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the public KUN Chat product instead of the starter", async () => {
  const [page, layout, chatRoute, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /KUN Chat/);
  assert.match(page, /坤坤/);
  assert.match(page, /峰哥/);
  assert.match(page, /林青霞/);
  assert.match(page, /涂磊/);
  assert.match(layout, /公开表达型 AI 对话平台/);
  assert.match(chatRoute, /DEEPSEEK_API_KEY/);
  assert.match(chatRoute, /approved_only|人物专属RAG仍在审核/);
  assert.match(hosting, /"d1": "DB"/);
  assert.doesNotMatch(page + layout, /codex-preview|Your site is taking shape|SkeletonPreview/);
});
