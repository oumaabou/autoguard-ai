"""
main.py
=======
FastAPI entry point for the AutoGuard AI chatbot backend.

Run locally with:
    uvicorn app.main:app --reload --port 8000

The mobile app calls this over HTTP - it never talks to Supabase or Gemini
directly, so no API keys live in the mobile app bundle.
"""

import logging
from typing import Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from .config import settings
from .exchange_rates import get_price_level_ratios, get_rates, last_updated, price_levels_last_updated
from .opening_templates import build_opening_message
from .rag_engine import RagEngineError, answer_question, get_knowledge_row
from .auth import AuthError, change_password, sign_in, sign_up
from .conversations import (
    ConversationError,
    append_messages,
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
)
from .profiles import ProfileError, get_or_create_profile, upload_avatar, upsert_profile

# Matches mobile-app/src/constants/powertrain.ts's PowertrainType exactly -
# keep these in sync if that ever changes.
Powertrain = Literal["petrol", "hybrid", "electric"]

logger = logging.getLogger("autoguard")

app = FastAPI(title="AutoGuard AI Chatbot API")

# rag_engine._generate() already retries Gemini and falls back to Groq on
# failure, so this only fires if BOTH providers are down (or Groq isn't
# configured). Rare, but still expected/transient rather than a bug - the
# raw error is logged here for debugging but never sent to the app, which
# would otherwise render it verbatim as if it were the bot's chat reply.
GEMINI_UNAVAILABLE_MESSAGE = (
    "AutoGuard AI's assistant is getting an unusually high volume of "
    "requests right now. Please try again in a few seconds."
)

# Permissive CORS for development (Expo dev server runs on a changing local
# IP/port). Tighten this to your actual deployed origins before shipping.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class DiagnoseRequest(BaseModel):
    fault_type: str = Field(..., description="One of the 6 CNN class labels, e.g. 'bearing_fault'")
    confidence: float | None = Field(None, ge=0, le=1)
    powertrain: Powertrain | None = Field(
        None, description="The vehicle's powertrain, from Settings, used to pick the right explanation wording"
    )


class ChatTurn(BaseModel):
    role: Literal["user", "bot"]
    text: str


class AskRequest(BaseModel):
    question: str
    fault_type: str | None = Field(
        None, description="The currently-diagnosed fault, if any, for extra context"
    )
    powertrain: Powertrain | None = Field(
        None, description="The vehicle's powertrain, from Settings, used to filter and reword retrieved content"
    )
    history: list[ChatTurn] | None = Field(
        None, description="Last few chat turns (oldest first) so follow-ups can refer back to what was already said"
    )
    language: str | None = Field(
        None, description="ISO code from profiles.language (en/es/fr/de/ja) - the reply is generated in this language, not translated after"
    )


class SignUpRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=6)
    username: str = Field(..., min_length=3, description="Unique display name - also usable to log in instead of the email")


class LoginRequest(BaseModel):
    identifier: str = Field(..., description="Either the account's email or its username")
    password: str


class ChangePasswordRequest(BaseModel):
    email: str
    current_password: str
    new_password: str = Field(..., min_length=6)


class CreateConversationRequest(BaseModel):
    user_id: str
    fault_type: str | None = None
    confidence: float | None = None
    powertrain: Powertrain | None = None
    title: str
    messages: list[dict]
    # Diagnosis-card snapshot (severity color + fair-price range), captured
    # client-side at save time - independent of `messages`, which only
    # holds actual chat turns and may be empty. See conversations.py.
    severity: Literal["healthy", "warning", "critical"] | None = None
    cost_low: float | None = None
    cost_high: float | None = None


class AppendMessagesRequest(BaseModel):
    messages: list[dict]


class UpdateProfileRequest(BaseModel):
    user_id: str
    display_name: str | None = None
    powertrain: Powertrain | None = None
    currency: str | None = None
    has_completed_onboarding: bool | None = None
    language: str | None = None


@app.get("/health")
def health():
    problems = settings.validate()
    return {"status": "ok" if not problems else "misconfigured", "problems": problems}


@app.post("/auth/signup")
def signup(req: SignUpRequest):
    try:
        return sign_up(req.email, req.password, req.username)
    except AuthError as exc:
        status = 409 if "already taken" in str(exc) else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@app.post("/auth/login")
def login(req: LoginRequest):
    try:
        return sign_in(req.identifier, req.password)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.post("/auth/change-password")
def change_password_route(req: ChangePasswordRequest):
    try:
        return change_password(req.email, req.current_password, req.new_password)
    except AuthError as exc:
        status = 400 if "incorrect" in str(exc).lower() else 401
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@app.get("/auth/confirmed", response_class=HTMLResponse)
def auth_confirmed():
    """Where Supabase redirects after someone clicks the email-confirmation
    link. This app has no web frontend, so point Supabase's Dashboard ->
    Authentication -> URL Configuration -> Site URL (and Redirect URLs) at
    this route (e.g. http://localhost:8000/auth/confirmed during local dev)
    instead of the default localhost:3000, which nothing is running on."""
    return """<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Email confirmed - AutoGuard AI</title>
  <style>
    body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; background: #0f1720; color: #e8edf2;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
    .card { max-width: 420px; padding: 32px; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    p { color: #9aa7b2; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Email confirmed</h1>
    <p>Your AutoGuard AI account is verified. You can close this tab and go back to the app to log in.</p>
  </div>
</body>
</html>"""


@app.post("/conversations")
def create_conversation_route(req: CreateConversationRequest):
    try:
        return create_conversation(
            req.user_id,
            req.fault_type,
            req.confidence,
            req.powertrain,
            req.title,
            req.messages,
            req.severity,
            req.cost_low,
            req.cost_high,
        )
    except ConversationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/conversations/{conversation_id}/messages")
def append_messages_route(conversation_id: str, req: AppendMessagesRequest):
    result = append_messages(conversation_id, req.messages)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No conversation with id={conversation_id!r}")
    return result


@app.get("/conversations")
def list_conversations_route(user_id: str):
    return list_conversations(user_id)


@app.get("/conversations/{conversation_id}")
def get_conversation_route(conversation_id: str):
    result = get_conversation(conversation_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No conversation with id={conversation_id!r}")
    return result


@app.delete("/conversations/{conversation_id}")
def delete_conversation_route(conversation_id: str):
    deleted = delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No conversation with id={conversation_id!r}")
    return {"deleted": True}


@app.get("/profile")
def get_profile_route(user_id: str):
    try:
        return get_or_create_profile(user_id)
    except ProfileError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.put("/profile")
def update_profile_route(req: UpdateProfileRequest):
    try:
        return upsert_profile(
            req.user_id,
            req.display_name,
            req.powertrain,
            req.currency,
            has_completed_onboarding=req.has_completed_onboarding,
            language=req.language,
        )
    except ProfileError as exc:
        # 409 for the specific "someone else already has this username"
        # case (a real conflict the user can act on), 502 for anything
        # else (an unexpected upstream failure).
        status = 409 if "already taken" in str(exc) else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@app.post("/profile/avatar")
async def upload_avatar_route(user_id: str, file: UploadFile = File(...)):
    filename = file.filename or "avatar.jpg"
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    content = await file.read()
    try:
        avatar_url = upload_avatar(user_id, content, file.content_type or "image/jpeg", extension)
        return {"avatar_url": avatar_url}
    except ProfileError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/exchange-rates")
async def exchange_rates_route():
    """USD-base live exchange rates AND price-level ratios for the
    currencies the app supports (see constants/currency.ts).
    fault_knowledge's typical_cost_low/high are stored in USD, sourced from
    US repair-cost articles - the mobile client uses `rates` to display
    that figure in the user's chosen currency, and `price_level_ratios` to
    additionally scale it toward what's realistic in that country (a US
    price converted at the FX rate alone is still a US price, not a local
    one). See exchange_rates.py for the full explanation and caveats.
    Cached server-side - never fails outright, worst case it serves stale
    or hand-set fallback values."""
    rates = await get_rates()
    price_level_ratios = await get_price_level_ratios()
    return {
        "base": "USD",
        "rates": rates,
        "updated_at": last_updated(),
        "price_level_ratios": price_level_ratios,
        "price_levels_updated_at": price_levels_last_updated(),
    }


@app.get("/fault-knowledge/{fault_type}")
def get_fault_knowledge(fault_type: str):
    """Direct Supabase lookup, no Gemini call - just the stored data
    (cost, urgency, etc). Used by the Price Evaluator screen so it isn't
    burning an LLM call just to show a number that already lives in the
    database."""
    row = get_knowledge_row(fault_type)
    if row is None:
        raise HTTPException(status_code=404, detail=f"No knowledge base entry for fault_type={fault_type!r}")
    return row


@app.post("/diagnose")
def diagnose(req: DiagnoseRequest):
    """Given a fault_type the CNN already predicted, return a clear,
    driver-facing opening explanation. Fully template-based (see
    opening_templates.py) - no LLM call, so this can never fail with a
    503/high-demand error and returns instantly."""
    row = get_knowledge_row(req.fault_type)
    if row is None:
        raise HTTPException(status_code=404, detail=f"No knowledge base entry for fault_type={req.fault_type!r}")
    explanation = build_opening_message(row, req.powertrain)
    return {"fault_type": req.fault_type, "explanation": explanation, "knowledge": row}


@app.post("/ask")
async def ask(req: AskRequest):
    """Open-ended follow-up question, answered via semantic search over the
    knowledge base."""
    history = [turn.model_dump() for turn in req.history] if req.history else None
    try:
        return await answer_question(req.question, req.fault_type, req.powertrain, history, req.language)
    except RagEngineError as exc:
        logger.warning("answer_question failed: %s", exc)
        raise HTTPException(status_code=502, detail=GEMINI_UNAVAILABLE_MESSAGE) from exc
    except Exception as exc:  # noqa: BLE001 - dev-time catch-all so failures are never a blank 500
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc
