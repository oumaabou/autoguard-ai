"""
profiles.py
===========
Per-user app settings - display name, powertrain (for the chatbot), fair-
price currency, avatar. Backed by the `profiles` table (see the
create_profiles_table migration), one row per auth.users row.

A row is created automatically by a DB trigger the moment someone signs up
(on_auth_user_created_profile), so in practice every authenticated user
already has one by the time the app asks for it. get_or_create_profile's
insert is a belt-and-suspenders fallback for that trigger, not the primary
mechanism.
"""

from datetime import datetime, timezone

from postgrest.exceptions import APIError

from .config import supabase

AVATAR_BUCKET = "avatars"

# Postgres error code for a unique-constraint violation - raised when a
# display_name collides with profiles_display_name_unique_idx (see the
# profiles_unique_username_and_onboarding_flag migration).
_UNIQUE_VIOLATION = "23505"


class ProfileError(Exception):
    """Raised when a profiles operation fails in a way the caller should see."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_or_create_profile(user_id: str) -> dict:
    result = (
        supabase.table("profiles").select("*").eq("user_id", user_id).limit(1).execute()
    )
    if result.data:
        return result.data[0]

    inserted = supabase.table("profiles").insert({"user_id": user_id}).execute()
    if not inserted.data:
        raise ProfileError("Could not create a profile row")
    return inserted.data[0]


def find_user_id_by_username(username: str) -> str | None:
    """Case-insensitive lookup, for logging in with a username instead of
    an email (see app/auth.py's sign_in)."""
    result = (
        supabase.table("profiles")
        .select("user_id")
        .ilike("display_name", username)
        .limit(1)
        .execute()
    )
    return result.data[0]["user_id"] if result.data else None


def is_username_taken(username: str) -> bool:
    return find_user_id_by_username(username) is not None


def upsert_profile(
    user_id: str,
    display_name: str | None = None,
    powertrain: str | None = None,
    currency: str | None = None,
    avatar_url: str | None = None,
    has_completed_onboarding: bool | None = None,
    language: str | None = None,
) -> dict:
    """Only touches fields that were actually passed - None means "leave
    unchanged" here, not "clear it" (the app never sends explicit clears
    today, so this keeps callers simple: pass just what changed)."""
    updates: dict = {"updated_at": _now()}
    if display_name is not None:
        updates["display_name"] = display_name
    if powertrain is not None:
        updates["powertrain"] = powertrain
    if currency is not None:
        updates["currency"] = currency
    if avatar_url is not None:
        updates["avatar_url"] = avatar_url
    if has_completed_onboarding is not None:
        updates["has_completed_onboarding"] = has_completed_onboarding
    if language is not None:
        updates["language"] = language

    get_or_create_profile(user_id)  # ensure the row exists before updating it
    try:
        result = (
            supabase.table("profiles").update(updates).eq("user_id", user_id).execute()
        )
    except APIError as exc:
        if exc.code == _UNIQUE_VIOLATION:
            raise ProfileError("That username is already taken.") from exc
        raise ProfileError(exc.message or "Could not update profile") from exc
    if not result.data:
        raise ProfileError("Update to profiles returned no row")
    return result.data[0]


def upload_avatar(user_id: str, file_bytes: bytes, content_type: str, extension: str) -> str:
    """Uploads to the public `avatars` bucket at `{user_id}/avatar.{ext}`
    (upsert=true so re-uploading just replaces it), then saves the public
    URL onto the profile row and returns it."""
    path = f"{user_id}/avatar.{extension}"
    supabase.storage.from_(AVATAR_BUCKET).upload(
        path,
        file_bytes,
        {"content-type": content_type, "upsert": "true"},
    )
    public_url = supabase.storage.from_(AVATAR_BUCKET).get_public_url(path)
    upsert_profile(user_id, avatar_url=public_url)
    return public_url
