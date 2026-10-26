"""
generate_embeddings.py
=======================
One-off setup script: computes a Gemini embedding for each fault_knowledge
row and writes it into the embedding column, so answer_question() in
rag_engine.py can find relevant rows for open-ended follow-up questions.

Run this once after loading/editing fault_knowledge content, from the
backend-server directory:

    python -m scripts.generate_embeddings

Needs GEMINI_API_KEY and SUPABASE_SERVICE_ROLE_KEY set in .env (the service
role key is required because the embedding UPDATE bypasses the read-only
RLS policy on fault_knowledge - see the migration in Supabase).
"""

import asyncio
import sys

sys.path.append("..")  # allow running as a script from backend-server/

from app.config import settings, supabase
from app.rag_engine import embed_text

    """Builds the text that gets embedded - should be everything a user's
    free-text question might semantically match against."""
def _searchable_text(row: dict) -> str:
    """Builds the text that gets embedded - should be everything a user's
    free-text question might semantically match against."""
    parts = [
        row["title"],
        row.get("explanation") or "",
        "Causes: " + "; ".join(row.get("causes") or []),
        "Symptoms: " + "; ".join(row.get("symptoms") or []),
    ]
    return "\n".join(p for p in parts if p)


async def main():
    problems = settings.validate()
    if problems:
        print("Cannot proceed - fix these first:")
        for p in problems:
            print(f"  - {p}")
        return

    rows = supabase.table("fault_knowledge").select("id, fault_type, title, explanation, causes, symptoms").execute().data
    if not rows:
        print("No rows found in fault_knowledge - nothing to embed.")
        return

    for row in rows:
        text = _searchable_text(row)
        print(f"Embedding {row['fault_type']}...", end=" ", flush=True)
        vector = await embed_text(text)
        supabase.table("fault_knowledge").update({"embedding": vector}).eq("id", row["id"]).execute()
        print(f"done ({len(vector)} dims)")

    print(f"\nEmbedded {len(rows)} rows.")


if __name__ == "__main__":
    asyncio.run(main())
