"""
conversations.py
=================
Plain Supabase CRUD for saved chatbot threads (no Gemini involved - that's
rag_engine.py). Backed by the `conversations` table (see the
create_conversations_table + conversations_use_real_user_id migrations):
id, user_id, fault_type, confidence, powertrain, title, messages (jsonb
array), created_at, updated_at.

Scoped by user_id (auth.users.id, from Supabase Auth - see app/auth.py and
main.py's /auth/signup + /auth/login routes). Every route that touches
conversations requires a logged-in user.
"""

from datetime import datetime, timezone

from .config import supabase


class ConversationError(Exception):
    """Raised when a conversations operation fails in a way the caller should see."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_conversation(
    user_id: str,
    fault_type: str | None,
    confidence: float | None,
    powertrain: str | None,
    title: str,
    messages: list[dict],
    severity: str | None = None,
    cost_low: float | None = None,
    cost_high: float | None = None,
) -> dict:
    result = (
        supabase.table("conversations")
        .insert(
            {
                "user_id": user_id,
                "fault_type": fault_type,
                "confidence": confidence,
                "powertrain": powertrain,
                "title": title,
                "messages": messages,
                "severity": severity,
                "cost_low": cost_low,
                "cost_high": cost_high,
            }
        )
        .execute()
    )
    if not result.data:
        raise ConversationError("Insert into conversations returned no row")
    return result.data[0]


def append_messages(conversation_id: str, new_messages: list[dict]) -> dict | None:
    existing = (
        supabase.table("conversations")
        .select("messages")
        .eq("id", conversation_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        return None

    current_messages = existing.data[0].get("messages") or []
    updated = (
        supabase.table("conversations")
        .update({"messages": current_messages + new_messages, "updated_at": _now()})
        .eq("id", conversation_id)
        .execute()
    )
    return updated.data[0] if updated.data else None


def list_conversations(user_id: str) -> list[dict]:
    result = (
        supabase.table("conversations")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data or []


def get_conversation(conversation_id: str) -> dict | None:
    result = (
        supabase.table("conversations")
        .select("*")
        .eq("id", conversation_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def delete_conversation(conversation_id: str) -> bool:
    """Deletes a saved diagnosis/discussion permanently. Returns True if a
    row was actually deleted, False if no conversation with that id existed
    (so the route can 404 instead of silently succeeding)."""
    result = (
        supabase.table("conversations")
        .delete()
        .eq("id", conversation_id)
        .execute()
    )
    return bool(result.data)
