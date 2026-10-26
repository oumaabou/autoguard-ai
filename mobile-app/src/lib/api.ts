/**
 * api.ts
 * ======
 * Thin client for the AutoGuard AI chatbot backend. The app never talks to
 * Supabase or Gemini directly - only this HTTP API.
 *
 * API_BASE_URL: points at the backend deployed on Render (backend-server/,
 * see that repo's README) - reachable from any device, not just your own
 * machine, which is what a real EAS build needs since it won't be running
 * on the same computer as the backend. If you're back to iterating locally
 * against `uvicorn app.main:app --reload --port 8000` instead, swap this
 * back to "http://10.0.2.2:8000" (Android emulator's alias for your
 * computer's loopback) or your computer's LAN IP for a real device on wifi.
 */

import { File, UploadType } from "expo-file-system";

const API_BASE_URL = "https://autoguard-ai-backend.onrender.com";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** FastAPI's `detail` field is a plain string for our own HTTPExceptions,
 * but for automatic request-validation failures (422s) it's an array of
 * {loc, msg, type} objects instead - without this, those show up in the UI
 * as a useless "[object Object]". */
function extractErrorMessage(data: any, status: number): string {
  const detail = data?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((d) => {
        if (d && typeof d.msg === "string") {
          const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null;
          return field ? `${field}: ${d.msg}` : d.msg;
        }
        return typeof d === "string" ? d : JSON.stringify(d);
      })
      .join("; ");
  }
  return `Request failed (${status})`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Network-level failure (backend not running, wrong URL, no wifi/host
    // route) - fetch throws before there's ever a response to read.
    throw new ApiError(
      `Could not reach the AutoGuard backend at ${API_BASE_URL}. Is it running (uvicorn app.main:app --reload --port 8000)?`,
      0
    );
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(extractErrorMessage(data, res.status), res.status);
  }
  return data as T;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(
      `Could not reach the AutoGuard backend at ${API_BASE_URL}. Is it running (uvicorn app.main:app --reload --port 8000)?`,
      0
    );
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(extractErrorMessage(data, res.status), res.status);
  }
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`);
  } catch (err) {
    throw new ApiError(
      `Could not reach the AutoGuard backend at ${API_BASE_URL}. Is it running (uvicorn app.main:app --reload --port 8000)?`,
      0
    );
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(extractErrorMessage(data, res.status), res.status);
  }
  return data as T;
}

async function del<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { method: "DELETE" });
  } catch (err) {
    throw new ApiError(
      `Could not reach the AutoGuard backend at ${API_BASE_URL}. Is it running (uvicorn app.main:app --reload --port 8000)?`,
      0
    );
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(extractErrorMessage(data, res.status), res.status);
  }
  return data as T;
}

export interface FaultKnowledgeRow {
  id: string;
  fault_type: string;
  title: string;
  vehicle_context: string;
  explanation: string;
  causes: string[];
  symptoms: string[];
  urgency: string;
  urgency_note: string;
  typical_cost_low: number | null;
  typical_cost_high: number | null;
  cost_notes: string | null;
  questions_to_ask_mechanic: string[];
  sources: string[];
  applicable_powertrains: string[];
  [key: string]: unknown;
}

export interface DiagnoseResponse {
  fault_type: string;
  explanation: string;
  knowledge: FaultKnowledgeRow;
}

export interface AskResponse {
  answer: string;
  matched_fault_types: string[];
}

/** A trimmed-down chat turn sent to /ask for follow-up context - kept as a
 * local, minimal shape (rather than importing ChatMessage from
 * lib/chatHistory.ts) since that file already imports from this one. */
export interface ChatHistoryTurn {
  role: "user" | "bot";
  text: string;
}

/** Given a fault_type the on-device model just predicted, get a clear,
 * driver-facing explanation grounded in the knowledge base. This is the
 * "opening message" of a chat thread. */
export function diagnoseFault(
  faultType: string,
  confidence: number | null,
  powertrain: string | null
): Promise<DiagnoseResponse> {
  return post<DiagnoseResponse>("/diagnose", {
    fault_type: faultType,
    confidence: confidence ?? undefined,
    powertrain: powertrain ?? undefined,
  });
}

/** Open-ended follow-up question, answered via semantic search over the
 * knowledge base (or general automotive knowledge / a redirect, if the
 * question is off-topic) - see backend-server/app/rag_engine.py.
 *
 * history: the last few chat turns (oldest first), so a follow-up like
 * "what about the second one" can refer back to what was already said. */
export function askQuestion(
  question: string,
  faultType: string | null,
  powertrain: string | null,
  history?: ChatHistoryTurn[],
  language?: string | null
): Promise<AskResponse> {
  return post<AskResponse>("/ask", {
    question,
    fault_type: faultType ?? undefined,
    powertrain: powertrain ?? undefined,
    history: history && history.length > 0 ? history : undefined,
    language: language ?? undefined,
  });
}

/** Direct Supabase lookup, no Gemini call - just the stored cost/urgency
 * data. Used by the Price Evaluator screen. */
export function getFaultKnowledge(faultType: string): Promise<FaultKnowledgeRow> {
  return get<FaultKnowledgeRow>(`/fault-knowledge/${encodeURIComponent(faultType)}`);
}

export interface ExchangeRatesResponse {
  base: "USD";
  rates: Record<string, number>;
  updated_at: string | null;
  /** How expensive each currency's country is relative to the US (World
   * Bank PPP / market exchange rate) - scales the USD baseline toward a
   * realistic local estimate instead of just currency-converting it. See
   * backend-server/app/exchange_rates.py for the full explanation. */
  price_level_ratios: Record<string, number>;
  price_levels_updated_at: string | null;
}

/** Live USD -> currency rates AND price-level ratios (server-cached, see
 * backend-server/app/exchange_rates.py) - used to convert AND localize
 * fault_knowledge's USD-stored cost figures for the user's chosen
 * currency. */
export function getExchangeRates(): Promise<ExchangeRatesResponse> {
  return get<ExchangeRatesResponse>("/exchange-rates");
}

// --- Auth ---------------------------------------------------------------

export interface AuthResponse {
  user_id: string;
  email: string;
  access_token: string | null;
  /** True if Supabase requires email confirmation before a session is
   * issued (default for a fresh project) - access_token will be null in
   * that case. See backend-server/app/auth.py for how to turn this off
   * during development. */
  needs_email_confirmation: boolean;
}

export function signUp(email: string, password: string, username: string): Promise<AuthResponse> {
  return post<AuthResponse>("/auth/signup", { email, password, username });
}

/** identifier can be either the account's email or its username. */
export function logIn(identifier: string, password: string): Promise<AuthResponse> {
  return post<AuthResponse>("/auth/login", { identifier, password });
}

/** Verifies current_password server-side (by signing in with it) before
 * applying new_password - see backend-server/app/auth.py's change_password. */
export function changePassword(email: string, currentPassword: string, newPassword: string): Promise<{ user_id: string; email: string }> {
  return post<{ user_id: string; email: string }>("/auth/change-password", {
    email,
    current_password: currentPassword,
    new_password: newPassword,
  });
}

// --- Conversations --------------------------------------------------------
// Raw Supabase row shape (snake_case) - see lib/chatHistory.ts for the
// camelCase app-facing version these get converted into.

export interface ConversationRow {
  id: string;
  user_id: string;
  fault_type: string | null;
  confidence: number | null;
  powertrain: string | null;
  title: string;
  messages: unknown[];
  /** Diagnosis-card snapshot, captured at save time - independent of
   * `messages`, which only holds actual chat turns and may be empty. */
  severity: "healthy" | "warning" | "critical" | null;
  cost_low: number | null;
  cost_high: number | null;
  created_at: string;
  updated_at: string;
}

export function apiCreateConversation(params: {
  user_id: string;
  fault_type: string | null;
  confidence: number | null;
  powertrain: string | null;
  title: string;
  messages: unknown[];
  severity?: "healthy" | "warning" | "critical" | null;
  cost_low?: number | null;
  cost_high?: number | null;
}): Promise<ConversationRow> {
  return post<ConversationRow>("/conversations", params);
}

export function apiAppendMessages(conversationId: string, messages: unknown[]): Promise<ConversationRow> {
  return post<ConversationRow>(`/conversations/${conversationId}/messages`, { messages });
}

export function apiListConversations(userId: string): Promise<ConversationRow[]> {
  return get<ConversationRow[]>(`/conversations?user_id=${encodeURIComponent(userId)}`);
}

export function apiGetConversation(conversationId: string): Promise<ConversationRow> {
  return get<ConversationRow>(`/conversations/${conversationId}`);
}

export function apiDeleteConversation(conversationId: string): Promise<{ deleted: boolean }> {
  return del<{ deleted: boolean }>(`/conversations/${conversationId}`);
}

// --- Profile ---------------------------------------------------------------

export interface ProfileRow {
  user_id: string;
  display_name: string | null;
  powertrain: string | null;
  currency: string;
  avatar_url: string | null;
  has_completed_onboarding: boolean;
  created_at: string;
  updated_at: string;
  /** ISO code (en/es/fr/de/ja) - see constants/language.ts. Which language
   * the Advocacy AI chatbot replies in. */
  language: string;
}

export function apiGetProfile(userId: string): Promise<ProfileRow> {
  return get<ProfileRow>(`/profile?user_id=${encodeURIComponent(userId)}`);
}

export function apiUpdateProfile(params: {
  user_id: string;
  display_name?: string | null;
  powertrain?: string | null;
  currency?: string | null;
  has_completed_onboarding?: boolean | null;
  language?: string | null;
}): Promise<ProfileRow> {
  return put<ProfileRow>("/profile", params);
}

/** Multipart upload - takes a local file URI (e.g. from expo-image-picker)
 * and uploads it as-is; the backend stores it in Supabase Storage and
 * returns the new public URL.
 *
 * Uses expo-file-system's File.upload() (a native multipart implementation)
 * instead of fetch()+FormData. RN's JS-level FormData/fetch has a known
 * failure mode reading `content://` URIs - which is what expo-image-picker
 * can return on Android once allowsEditing/native-cropping is skipped - and
 * that failure surfaces as a bare "could not reach the backend" network
 * error with no request ever actually leaving the device. File.upload()
 * reads the file at the native layer (via ContentResolver on Android),
 * which handles content:// URIs correctly. */
export async function apiUploadAvatar(userId: string, fileUri: string, fileName: string, mimeType: string): Promise<string> {
  let result: { body: string; status: number };
  try {
    const file = new File(fileUri);
    result = await file.upload(`${API_BASE_URL}/profile/avatar?user_id=${encodeURIComponent(userId)}`, {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "file", // must match main.py's `file: UploadFile = File(...)` param name
      mimeType,
    });
  } catch (err) {
    throw new ApiError(`Could not reach the AutoGuard backend at ${API_BASE_URL}.`, 0);
  }

  let data: any = null;
  try {
    data = result.body ? JSON.parse(result.body) : null;
  } catch {
    data = null;
  }
  if (result.status < 200 || result.status >= 300) {
    throw new ApiError(extractErrorMessage(data, result.status), result.status);
  }
  return (data as { avatar_url: string }).avatar_url;
}
