"""
auth.py
=======
Thin wrapper around Supabase Auth (email/password) for the mobile app's
login/signup screen. The mobile app never talks to Supabase directly (same
rule as everywhere else in this backend) - it calls POST /auth/signup and
POST /auth/login, gets back a user_id + access_token, and stores that
locally (see mobile-app/src/lib/authStore.ts).

Every account has both a unique email AND a unique username (profiles.
display_name, enforced by profiles_display_name_unique_idx), and can log in
with either - see sign_in()'s identifier resolution below.

Uses two different Supabase clients on purpose (see config.py's big comment
on this): `supabase_auth` (anon key) for the actual sign_up/sign_in_with_
password calls, and `admin_supabase` (service_role/secret key) only for the
one truly admin-only operation here, resolving a username to its email via
admin.get_user_by_id. That admin call is a plain stateless GET - unlike
sign_in_with_password/sign_up, it does NOT mutate the client's headers, so
it's safe to use the shared admin client for it.
"""

from .config import supabase as admin_supabase
from .config import supabase_auth
from .profiles import find_user_id_by_username, is_username_taken, upsert_profile


class AuthError(Exception):
    """Raised when signup/login fails in a way the caller should see."""


def _clean_message(exc: Exception) -> str:
    msg = str(exc).strip()
    return msg or type(exc).__name__


def _session_dict(auth_response) -> dict:
    user = auth_response.user
    session = auth_response.session
    if user is None:
        raise AuthError("Unexpected response from Supabase Auth - no user returned")
    return {
        "user_id": user.id,
        "email": user.email,
        "access_token": session.access_token if session else None,
        "needs_email_confirmation": session is None,
    }


def sign_up(email: str, password: str, username: str) -> dict:
    username = username.strip()
    if len(username) < 3:
        raise AuthError("Username must be at least 3 characters.")
    if is_username_taken(username):
        raise AuthError("That username is already taken.")

    try:
        result = supabase_auth.auth.sign_up({"email": email, "password": password})
    except Exception as exc:  # gotrue.errors.AuthApiError and friends
        raise AuthError(_clean_message(exc)) from exc

    session = _session_dict(result)
    # A bare profile row already exists (the on_auth_user_created_profile
    # DB trigger creates one the moment the auth.users row is inserted) -
    # this just fills in the username they chose. Not fatal if it fails
    # (e.g. a last-instant race with someone else taking the same name) -
    # they can still set it later from Profile, no need to fail the whole
    # signup over it since the availability check above already covered
    # the common case.
    try:
        upsert_profile(session["user_id"], display_name=username)
    except Exception:
        pass
    return session


def sign_in(identifier: str, password: str) -> dict:
    """identifier can be either the account's email or its username."""
    identifier = identifier.strip()
    email = identifier

    if "@" not in identifier:
        user_id = find_user_id_by_username(identifier)
        if not user_id:
            raise AuthError("No account found with that username.")
        try:
            user_response = admin_supabase.auth.admin.get_user_by_id(user_id)
        except Exception as exc:
            raise AuthError(_clean_message(exc)) from exc
        if not user_response.user or not user_response.user.email:
            raise AuthError("No account found with that username.")
        email = user_response.user.email

    try:
        result = supabase_auth.auth.sign_in_with_password({"email": email, "password": password})
    except Exception as exc:
        raise AuthError(_clean_message(exc)) from exc
    return _session_dict(result)


def change_password(email: str, current_password: str, new_password: str) -> dict:
    """Verifies the current password by signing in with it (this is also
    what establishes the session update_user() below needs - GoTrue's
    update_user() only works against whatever session is currently set on
    the client, there's no "pass a jwt directly" option like get_user()
    has), then updates to the new password.

    Same shared-client caveat as sign_in(): this mutates supabase_auth's
    session for the life of this request. Fine for this app's traffic
    level; would need a per-request client if this backend ever needs to
    handle concurrent requests from different users safely.
    """
    if len(new_password) < 6:
        raise AuthError("New password must be at least 6 characters.")

    try:
        supabase_auth.auth.sign_in_with_password({"email": email, "password": current_password})
    except Exception as exc:
        raise AuthError("Current password is incorrect.") from exc

    try:
        result = supabase_auth.auth.update_user({"password": new_password})
    except Exception as exc:
        raise AuthError(_clean_message(exc)) from exc

    if result.user is None:
        raise AuthError("Unexpected response from Supabase Auth - no user returned")
    return {"user_id": result.user.id, "email": result.user.email}
