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
  assert.match(page, /SpeechRecognition/);
  assert.match(layout, /AI 数字人与赛博同人对话平台/);
  assert.match(page, /MiniMax 云端数字人语音/);
  assert.match(page, /AI 数字人/);
  assert.match(chatRoute, /DEEPSEEK_API_KEY/);
  assert.match(chatRoute, /tts_grants/);
  assert.match(chatRoute, /reviewed_public_context/);
  assert.match(chatRoute, /107 个审核来源、119 个事实块和 424 个短口语风格样本/);
  assert.match(hosting, /"d1": "DB"/);
  assert.doesNotMatch(page + layout, /codex-preview|Your site is taking shape|SkeletonPreview/);
});
