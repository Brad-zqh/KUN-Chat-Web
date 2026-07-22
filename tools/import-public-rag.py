"""Upload only reviewed production RAG records to the protected cloud import API."""

from __future__ import annotations

import json
import os
import sqlite3
import urllib.request
from pathlib import Path

ROOT = Path(r"D:\OneDrive\LLMs")
ENDPOINT = os.environ.get("KUN_RAG_IMPORT_URL", "https://kun-chat-public.zhaoqiuhaobrad.chatgpt.site/api/admin/rag-import")
SECRET = os.environ.get("RAG_IMPORT_SECRET", "")
SITES_BYPASS_TOKEN = os.environ.get("SITES_BYPASS_TOKEN", "")


def rows(db_path: Path, sql: str) -> list[dict]:
    connection = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        return [dict(row) for row in connection.execute(sql)]
    finally:
        connection.close()


def production_records() -> dict[str, dict[str, list[dict]]]:
    kun_db = ROOT / "talk-to-fengge" / "data" / "kunkun-rag.sqlite3"
    result: dict[str, dict[str, list[dict]]] = {
        "kunkun": {
            "facts": rows(kun_db, "SELECT 'kunkun:fact:' || c.id AS record_id, c.content AS text, s.title AS title, s.url AS url FROM chunks c JOIN sources s ON s.id=c.source_id ORDER BY c.id"),
            "styles": rows(kun_db, "SELECT example_key AS record_id, text, title, '' AS url, tags_json FROM style_examples ORDER BY id"),
        }
    }
    for persona in ("fengge", "linqingxia", "tulei"):
        db_path = ROOT / "persona-material" / persona / "production" / f"{persona}-rag.sqlite3"
        result[persona] = {
            "facts": rows(db_path, "SELECT record_id, text, source_title AS title, source_url AS url FROM documents WHERE kind='fact' AND semantic_gate='attributed_fact' ORDER BY record_id"),
            "styles": rows(db_path, "SELECT record_id, text, '' AS title, source_url AS url, style_tags_json AS tags_json FROM style_examples ORDER BY record_id"),
        }
    return result


def upload(persona: str, kind: str, records: list[dict]) -> None:
    for start in range(0, max(1, len(records)), 80):
        batch = records[start:start + 80]
        payload = json.dumps({"persona": persona, "kind": kind, "reset": start == 0, "records": batch}, ensure_ascii=False).encode("utf-8")
        headers = {"authorization": f"Bearer {SECRET}", "content-type": "application/json", "user-agent": "KUN-Chat-RAG-Sync/1.0"}
        if SITES_BYPASS_TOKEN:
            headers["OAI-Sites-Authorization"] = f"Bearer {SITES_BYPASS_TOKEN}"
        request = urllib.request.Request(ENDPOINT, data=payload, method="POST", headers=headers)
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
        print(f"{persona}/{kind}: batch={len(batch)} total={result['total']}")


def main() -> None:
    if not SECRET:
        raise SystemExit("RAG_IMPORT_SECRET is required")
    for persona, groups in production_records().items():
        for kind, records in groups.items():
            upload(persona, kind, records)


if __name__ == "__main__":
    main()
