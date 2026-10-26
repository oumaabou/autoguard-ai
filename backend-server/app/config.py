"""
config.py
=========
Loads environment variables and builds the shared Supabase client. Import
`settings` and `supabase` from here rather than reading os.environ directly
elsewhere, so there's one place that knows how configuration is wired up.
"""

import os

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()


class Settings:
    GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
    # Groq is a completely separate inference provider (its own
    # infrastructure, unrelated to Google) used as an automatic fallback in
    # rag_engine._generate() whenever Gemini fails - see that file. Optional:
    # if this is blank, the fallback is simply skipped and Gemini errors
    # surface as before. Get a free key at https://console.groq.com/keys.
    GROQ_API_KEY: str = os.environ.get("GROQ_API_KEY", "")
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.environ.get("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    # gemini-flash-latest: fast + cheap, good fit for short conversational
    # explanations rather than long-form reasoning.
    GEMINI_MODEL = "gemini-flash-latest"
    # gemini-embedding-001: current generally-available embedding model,
    # truncated to 768 dims (see EMBEDDING_DIMENSIONS) to keep the pgvector
    # index compact. Must match the dimension used in the Supabase schema
    # (fault_knowledge.embedding is vector(768)) and in
    # scripts/generate_embeddings.py - if you ever change this, you need to
    # re-run that script and update the column type together.
    GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"
    EMBEDDING_DIMENSIONS = 768

    # openai/gpt-oss-120b: Groq's flagship open-weight production model as
    # of console.groq.com/docs/models (checked live after llama-3.3-70b-
    # versatile - what this was originally set to - started 404ing; Groq's
    # lineup changes without much notice, so if this ever starts failing
    # with "does not exist or you do not have access to it", re-check that
    # page and swap the model id here). Used only for the rare Gemini-
    # failure fallback, so its slightly higher latency vs. the 20b model
    # doesn't matter, and the extra reasoning quality keeps answers
    # consistent with Gemini's.
    GROQ_MODEL = "openai/gpt-oss-120b"

    def validate(self) -> list[str]:
        """Returns a list of human-readable problems with the current config,
        empty if everything required is present."""
        problems = []
        if not self.GEMINI_API_KEY:
            problems.append("GEMINI_API_KEY is not set (see .env.example)")
        if not self.SUPABASE_URL:
            problems.append("SUPABASE_URL is not set")
        if not self.SUPABASE_SERVICE_ROLE_KEY:
            problems.append(
                "SUPABASE_SERVICE_ROLE_KEY is not set - get it from the Supabase "
                "dashboard (Project Settings -> API -> service_role secret)"
            )
        return problems


settings = Settings()

# The backend is a trusted server-side context, so it uses the service role
# (or new-format secret) key, which bypasses Row Level Security - this lets
# it write embeddings, read/write conversations, etc. The mobile app never
# talks to Supabase directly or holds any Supabase key; it only ever calls
# this backend's HTTP API.
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY,
)

# IMPORTANT: don't ever call `supabase.auth.*` on the client above. The
# supabase-py client is stateful - a successful sign_in/sign_up mutates the
# client's default Authorization header to that user's own session JWT
# (role "authenticated"), permanently replacing the service-role/secret key
# for every *subsequent* request made with that client instance for the
# rest of the process's life. Since `supabase` above is a module-level
# singleton shared by every request, one user logging in would silently
# downgrade every other admin DB call (e.g. conversations.py inserts) from
# service-role to that user's low-privilege role, tripping RLS - which is
# exactly what caused the persistent 42501 "row violates row-level security
# policy" error on POST /conversations. Auth calls (app/auth.py) must use
# this separate client instead, built with the low-privilege anon/
# publishable key since that's the correct key for user-facing auth flows
# anyway.
supabase_auth: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_ANON_KEY or settings.SUPABASE_SERVICE_ROLE_KEY,
)
