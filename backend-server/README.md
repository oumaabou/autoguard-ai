# backend-server - FastAPI backend

REST API for AutoGuard AI: authentication, profiles and avatars, saved conversations, template-based diagnosis explanations, a RAG chatbot (Gemini + pgvector, Groq fallback) and exchange-rate / price-level data.

## Setup
```bash
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env     # then fill in your own keys (never commit .env)
python -m scripts.generate_embeddings   # once, and after editing knowledge-base content
uvicorn app.main:app --reload --port 8000
```
Check `GET /health` returns `{"status":"ok"}`.

You need your own Supabase project (tables: `profiles`, `conversations`, `fault_knowledge` with a `vector(768)` column, a `match_fault_knowledge` RPC, and an `avatars` storage bucket), a Gemini API key, and optionally a Groq key.

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Config check |
| POST | `/auth/signup`, `/auth/login`, `/auth/change-password` | Auth via Supabase (email or username login) |
| GET / PUT | `/profile` | Read / update display name, powertrain, currency, language |
| POST | `/profile/avatar` | Multipart avatar upload to Supabase Storage |
| POST | `/diagnose` | Template-based explanation for a predicted fault (no LLM) |
| POST | `/ask` | RAG follow-up Q&A (Gemini, Groq failover, replies in the user's language) |
| GET | `/fault-knowledge/{fault_type}` | Stored fault data incl. USD cost range |
| GET | `/exchange-rates` | Live FX rates + World Bank price-level ratios (cached) |
| POST / GET / DELETE | `/conversations...` | Saved diagnoses and chat threads |

## Modules
`auth.py` Supabase Auth wrapper - `profiles.py` profile and avatar logic - `rag_engine.py` retrieval, prompt, Gemini/Groq - `opening_templates.py` hand-written explanations - `exchange_rates.py` FX + PPP - `conversations.py` CRUD - `config.py` settings and clients.

## Tests
```bash
python scripts/test_backend_unit.py     # needs the server running and valid .env
```
