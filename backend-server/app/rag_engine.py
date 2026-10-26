"""
rag_engine.py
=============
Core retrieval-augmented-generation logic for the AutoGuard AI chatbot.

One entry point:
  - answer_question(question, fault_type)  -> open-ended follow-up Q&A,
                                               grounded via semantic search
                                               over fault_knowledge

(The old explain_fault() opening-message generator was replaced by
opening_templates.build_opening_message() - hand-written, template-based,
no LLM call - since the CNN's classification is already the diagnosis and
translating a fixed label into plain words doesn't need Gemini every time.)

Talks to Gemini directly over HTTP (matching the REST API shape Google
documents) rather than through the SDK, to keep the dependency footprint
small and the request/response shape easy to debug. Falls back to Groq (a
separate provider, independent infrastructure from Google) if Gemini fails
for any reason and GROQ_API_KEY is configured - see _generate() below.
"""

import asyncio
import logging
import random

import httpx

from .config import settings, supabase

logger = logging.getLogger("autoguard")

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions"

# Gemini's free/shared-capacity tier returns 503 UNAVAILABLE ("high demand")
# and occasionally 429 fairly often - these are transient, not our bug, and
# usually clear up within a couple seconds. Retry once with a short delay
# before giving up, so a momentary blip doesn't surface as an error - but
# keep this cheap: every retry stacks directly onto how long the user is
# staring at the typing indicator, and 3 attempts with growing backoff was
# adding several extra seconds on top of Gemini's own (already slow under
# load) response time.
_RETRYABLE_STATUS = {429, 503}
_MAX_ATTEMPTS = 2
_BASE_DELAY_SECONDS = 0.8


class RagEngineError(Exception):
    """Raised when Gemini or Supabase fails in a way the caller should see."""


# Keep in sync with mobile-app/src/constants/language.ts's LANGUAGES - the
# app only ever sends one of these codes (persisted in profiles.language,
# defaulting to "en"). Mapped to a full English name here rather than
# trusting the client to send free text, so the prompt instruction is always
# an unambiguous word the model can't misinterpret, and an unrecognized code
# just falls back to English instead of erroring.
LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "ja": "Japanese",
    "ms": "Malay",
}
DEFAULT_LANGUAGE = "en"


def _gemini_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "X-goog-api-key": settings.GEMINI_API_KEY,
    }


async def _post_with_retry(url: str, body: dict) -> httpx.Response:
    last_exc: Exception | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, headers=_gemini_headers(), json=body)
        except httpx.HTTPError as exc:
            last_exc = exc
        else:
            if resp.status_code not in _RETRYABLE_STATUS:
                return resp
            last_exc = RagEngineError(f"Gemini call failed ({resp.status_code}): {resp.text}")

        if attempt < _MAX_ATTEMPTS:
            delay = _BASE_DELAY_SECONDS * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
            await asyncio.sleep(delay)

    if isinstance(last_exc, RagEngineError):
        raise last_exc
    raise RagEngineError(f"Could not reach Gemini (network error): {last_exc!r}")


def _groq_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
    }


async def _generate_groq(prompt: str) -> str:
    """Fallback path when Gemini is unavailable. Groq runs its own
    infrastructure entirely separate from Google's, so a Gemini outage
    doesn't take this down too - and its OpenAI-compatible chat completions
    endpoint means the request/response shape is a small, self-contained
    translation from Gemini's. See https://console.groq.com/docs/models."""
    body = {
        "model": settings.GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(GROQ_BASE, headers=_groq_headers(), json=body)
    except httpx.HTTPError as exc:
        raise RagEngineError(f"Could not reach Groq (network error): {exc!r}") from exc

    if resp.status_code != 200:
        raise RagEngineError(f"Groq chat completion failed ({resp.status_code}): {resp.text}")

    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError) as exc:
        raise RagEngineError(f"Unexpected Groq response shape: {data}") from exc


async def _generate_gemini(prompt: str) -> str:
    url = f"{GEMINI_BASE}/models/{settings.GEMINI_MODEL}:generateContent"
    body = {"contents": [{"parts": [{"text": prompt}]}]}

    resp = await _post_with_retry(url, body)

    if resp.status_code != 200:
        raise RagEngineError(f"Gemini generateContent failed ({resp.status_code}): {resp.text}")

    data = resp.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError) as exc:
        raise RagEngineError(f"Unexpected Gemini response shape: {data}") from exc


async def _generate(prompt: str) -> str:
    """Calls Gemini's generateContent (with its existing retry-on-503/429
    behavior) and returns the plain text response. If that still fails and
    GROQ_API_KEY is configured, falls through to Groq once as a same-request
    fallback - this is what actually cuts down how often the chatbot ever
    shows an error, since Gemini's free-tier "high demand" 503s can persist
    for longer than 2 retries are worth waiting through."""
    try:
        return await _generate_gemini(prompt)
    except RagEngineError as exc:
        if not settings.GROQ_API_KEY:
            raise
        logger.warning("Gemini call failed (%s) - falling back to Groq", exc)
        return await _generate_groq(prompt)


async def embed_text(text: str) -> list[float]:
    """Calls Gemini's embedContent and returns a 768-dim vector.

    Shared by scripts/generate_embeddings.py (populating the DB) and
    answer_question() (embedding the user's live question) - both MUST use
    the same model + output_dimensionality, or the vectors won't be
    comparable.
    """
    url = f"{GEMINI_BASE}/models/{settings.GEMINI_EMBEDDING_MODEL}:embedContent"
    body = {
        "content": {"parts": [{"text": text}]},
        "outputDimensionality": settings.EMBEDDING_DIMENSIONS,
    }

    resp = await _post_with_retry(url, body)

    if resp.status_code != 200:
        raise RagEngineError(f"Gemini embedContent failed ({resp.status_code}): {resp.text}")

    data = resp.json()
    try:
        return data["embedding"]["values"]
    except KeyError as exc:
        raise RagEngineError(f"Unexpected Gemini embedding response shape: {data}") from exc


def _get_fault_row(fault_type: str) -> dict | None:
    result = (
        supabase.table("fault_knowledge")
        .select("*")
        .eq("fault_type", fault_type)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_knowledge_row(fault_type: str) -> dict | None:
    """Public wrapper around _get_fault_row - a direct Supabase lookup with
    NO Gemini call, for UI elements that just need the raw stored data (e.g.
    the Price Evaluator screen showing typical_cost_low/high) rather than a
    generated explanation. Keep this Gemini-free so a quick price lookup
    never costs an LLM call."""
    return _get_fault_row(fault_type)


def _format_row_for_prompt(row: dict, powertrain: str | None = None, include_cost: bool = False) -> str:
    # explanation_variants holds per-powertrain rewrites (e.g. "electric"
    # talks about a traction motor, "petrol" talks about an alternator) for
    # fault types whose real-world component differs by powertrain. Falls
    # back to the generic explanation when there's no variant or no
    # powertrain was given - see the add_powertrain_filtering migration.
    variants = row.get("explanation_variants") or {}
    explanation = (variants.get(powertrain) if powertrain else None) or row.get("explanation") or ""

    causes = "; ".join(row.get("causes") or []) or "not specified"
    symptoms = "; ".join(row.get("symptoms") or []) or "not specified"
    text = (
        f"Title: {row['title']}\n"
        f"Likely component: {row.get('vehicle_context') or 'unspecified'}\n"
        f"Explanation: {explanation}\n"
        f"Common causes: {causes}\n"
        f"Symptoms: {symptoms}\n"
        f"Urgency: {row.get('urgency') or 'unspecified'} - {row.get('urgency_note') or ''}"
    )
    # include_cost defaults to False on purpose - cost_notes is an
    # unlabeled number with no currency attached, and the chatbot should
    # never be the one stating a price (see answer_question's prompt: it
    # always redirects cost questions to the Price Evaluator screen, which
    # shows the same figures correctly formatted in the user's actual
    # chosen currency). Keeping it out of the prompt context entirely means
    # the model can't quote a number even if asked to.
    if include_cost:
        text += f"\nTypical repair cost: {row.get('cost_notes') or 'not specified'}"
    return text


async def answer_question(
    question: str,
    fault_type: str | None = None,
    powertrain: str | None = None,
    history: list[dict] | None = None,
    language: str | None = None,
) -> dict:
    """Open-ended follow-up Q&A. Embeds the question, finds the most
    semantically relevant fault_knowledge rows via Supabase's
    match_fault_knowledge RPC (pgvector cosine similarity), and asks Gemini
    to answer - grounded in that context when relevant, but not limited to
    it for general car questions, and refusing anything not car-related at
    all. See the prompt below for the exact scoping rules.

    powertrain (if given) is passed straight to the RPC, which both filters
    out fault types that don't apply to that powertrain and swaps in the
    right explanation_variants text - see the add_powertrain_filtering
    migration, function match_fault_knowledge.

    If fault_type is given (the common case - this chatbot is opened from
    an already-completed diagnosis), that row is fetched directly and
    ALWAYS included as context, instead of relying on semantic search to
    happen to surface it. Semantic search only runs when there's no known
    fault_type - a short follow-up like "why is this happening?" often
    doesn't embed close enough to its own diagnosis row to be matched by
    similarity search, which is what caused the bot to ask the user to
    describe their symptoms again even though AutoGuard already knew.
    Skipping the extra embed_text() + RPC round trip in the common case
    also roughly halves per-message latency (one Gemini call instead of
    two).

    history (optional): the last few chat turns, oldest first, each shaped
    like {"role": "user" | "bot", "text": str} - passed in by the mobile
    client so a follow-up like "how much would that cost" or "what about
    the second thing you said" can refer back to what was just discussed.
    Capped at the last 6 turns here too (belt-and-suspenders on top of the
    client already trimming it) so a long-running chat doesn't blow up the
    prompt.

    language: an ISO code from profiles.language (see LANGUAGE_NAMES above),
    e.g. "es" for Spanish - the whole reply is generated in that language,
    not translated afterward. Defaults to English for None/unrecognized
    codes."""
    language_name = LANGUAGE_NAMES.get(language or DEFAULT_LANGUAGE, LANGUAGE_NAMES[DEFAULT_LANGUAGE])
    diagnosed_row = _get_fault_row(fault_type) if fault_type else None

    matches: list[dict] = []
    if not diagnosed_row:
        query_embedding = await embed_text(question)
        result = supabase.rpc(
            "match_fault_knowledge",
            {"query_embedding": query_embedding, "match_count": 3, "p_powertrain": powertrain},
        ).execute()
        matches = result.data or []

    # Deliberately NOT including cost_notes/typical-cost figures here (see
    # prompt below) - the chatbot should never state a price itself, since
    # those figures are unlabeled numbers with no currency attached, while
    # the Price Evaluator screen shows the same data correctly formatted in
    # the user's actual chosen currency (see mobile-app's evaluator.tsx /
    # lib/profile.tsx). Keeping cost data out of the model's context
    # entirely - rather than just instructing it not to use it - means it
    # physically can't quote a number even if it tried.
    context_parts = []
    if diagnosed_row:
        context_parts.append(
            "[THE DIAGNOSED ISSUE - AutoGuard's on-device model just detected this from "
            f"the vehicle's sound]\n{_format_row_for_prompt(diagnosed_row, powertrain)}\n"
            "Questions worth asking a mechanic: "
            + ("; ".join(diagnosed_row.get("questions_to_ask_mechanic") or []) or "unspecified")
        )
    for m in matches:
        context_parts.append(
            f"[{m['fault_type']}] {m['title']} (relevance {m['similarity']:.2f})\n"
            f"{m['explanation']}\n"
            f"Urgency: {m['urgency']}\n"
            f"Questions worth asking a mechanic: "
            f"{'; '.join(m.get('questions_to_ask_mechanic') or []) or 'unspecified'}"
        )
    context = "\n\n".join(context_parts) if context_parts else "No specific AutoGuard reference entries matched this question."

    history_lines = []
    for turn in (history or [])[-6:]:
        text = (turn.get("text") or "").strip()
        if not text:
            continue
        speaker = "User" if turn.get("role") == "user" else "AutoGuard AI"
        history_lines.append(f"{speaker}: {text}")
    history_block = (
        "Recent conversation so far, oldest first (for context only - don't "
        "repeat what was already said):\n" + "\n".join(history_lines) + "\n\n"
        if history_lines
        else ""
    )

    diagnosed_line = (
        f"This vehicle was JUST diagnosed with: {diagnosed_row['title']}. Treat every follow-up "
        "question as being about THIS diagnosis unless it clearly asks about something else - "
        "you already know what's wrong, so never ask the user to describe their symptoms, "
        "noise, or warning light again.\n"
        if diagnosed_row
        else ""
    )

    prompt = (
        "You are AutoGuard AI, teaching someone who knows nothing about cars "
        "- the whole point is helping people with zero car knowledge "
        "understand their vehicle and avoid being overcharged at a repair "
        "shop.\n\n"
        "Step 1 - check relevance: if the question has nothing to do with "
        "vehicles (e.g. weather, general trivia, unrelated topics), don't "
        "answer it. Say briefly that it's outside what you help with and "
        "redirect them back to their car, in 1 short sentence. Stop there.\n\n"
        "Step 2 - if it IS about their vehicle, car problems, sounds, or "
        "maintenance: answer it directly, like a teacher giving a beginner "
        "the short version, not like a friend chatting. Plain everyday "
        "words, short sentences, no jargon, no metaphors or analogies, no "
        "small talk or greetings. Prefer the reference information below "
        "when relevant - it's specific, verified data, so use it for "
        "mechanic questions or anything about the fault types AutoGuard "
        "screens for. For broader car questions it doesn't cover, answer "
        "from general automotive knowledge instead of refusing.\n\n"
        "Step 2b - COST QUESTIONS, an exception to Step 2: if they ask what "
        "a repair should cost, what's fair to pay, or anything about price "
        "- do NOT state a number, not even a rough range, no matter what "
        "reference information is or isn't available. You don't know their "
        "chosen currency, so any number you say would likely be wrong. "
        "Instead, in 1 short sentence, tell them to check the Price "
        "Evaluator screen in the app for a fair price range in their own "
        "currency.\n\n"
        "STRICT LENGTH LIMIT: 2-3 short sentences, no headers or bullet "
        "lists. Only go longer if the question truly needs a step-by-step "
        "answer (e.g. they ask for instructions) - even then, stay as short "
        "as possible.\n\n"
        f"LANGUAGE: Respond entirely in {language_name}, including the "
        "Step 1 redirect if the question is off-topic. Keep the same plain, "
        "beginner-friendly tone - don't get more formal just because the "
        "language changed.\n\n"
        f"{diagnosed_line}"
        f"{history_block}"
        f"User's question: {question}\n\n"
        f"Reference information (may or may not be relevant to this question):\n{context}"
    )

    answer = await _generate(prompt)
    matched_fault_types = ([diagnosed_row["fault_type"]] if diagnosed_row else []) + [
        m["fault_type"] for m in matches
    ]
    return {"answer": answer, "matched_fault_types": matched_fault_types}
