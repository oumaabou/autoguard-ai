/**
 * chatHistory.ts
 * ==============
 * Saved chatbot conversations - backed by Supabase via the backend's
 * /conversations routes, scoped by the logged-in user (lib/authStore.ts).
 * Survives app restarts and reinstalls (as long as the person logs back
 * into the same account), unlike the earlier on-device-only version.
 *
 * Exports the same shape/function signatures as the original AsyncStorage
 * version on purpose, so advocacy.tsx and history.tsx don't need to know
 * where this data actually lives.
 */

import { getSession } from "./authStore";
import {
  apiAppendMessages,
  apiCreateConversation,
  apiDeleteConversation,
  apiGetConversation,
  apiListConversations,
  type ConversationRow,
} from "./api";

export type MessageRole = "bot" | "user";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  time: string; // display string, e.g. "09:12 AM"
  isRecommendation?: boolean;
}

export type Severity = "healthy" | "warning" | "critical";

export interface Conversation {
  id: string;
  faultType: string | null;
  confidence: number | null;
  powertrain: string | null;
  title: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  messages: ChatMessage[];
  /** Diagnosis-card snapshot (color-coded urgency + fair-price range),
   * captured at save time - present even when `messages` is empty, i.e.
   * a diagnosis was saved but no chat discussion has happened yet. */
  severity: Severity | null;
  costLow: number | null;
  costHigh: number | null;
}

function fromRow(row: ConversationRow): Conversation {
  return {
    id: row.id,
    faultType: row.fault_type,
    confidence: row.confidence,
    powertrain: row.powertrain,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: (row.messages as ChatMessage[]) ?? [],
    severity: row.severity,
    costLow: row.cost_low,
    costHigh: row.cost_high,
  };
}

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("Not logged in - can't load or save chat history.");
  return session.userId;
}

/** Newest-first, for the Saved Discussions list. */
export async function listConversations(): Promise<Conversation[]> {
  const userId = await requireUserId();
  const rows = await apiListConversations(userId);
  return rows.map(fromRow);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  try {
    return fromRow(await apiGetConversation(id));
  } catch {
    return null;
  }
}

export async function createConversation(params: {
  faultType: string | null;
  confidence: number | null;
  powertrain: string | null;
  title: string;
  messages: ChatMessage[];
  severity?: Severity | null;
  costLow?: number | null;
  costHigh?: number | null;
}): Promise<Conversation> {
  const userId = await requireUserId();
  const row = await apiCreateConversation({
    user_id: userId,
    fault_type: params.faultType,
    confidence: params.confidence,
    powertrain: params.powertrain,
    title: params.title,
    messages: params.messages,
    severity: params.severity ?? null,
    cost_low: params.costLow ?? null,
    cost_high: params.costHigh ?? null,
  });
  return fromRow(row);
}

/** Appends messages to an existing conversation. Returns the updated
 * conversation, or null if the id no longer exists. */
export async function appendMessages(
  id: string,
  newMessages: ChatMessage[]
): Promise<Conversation | null> {
  try {
    return fromRow(await apiAppendMessages(id, newMessages));
  } catch {
    return null;
  }
}

/** Permanently deletes a saved diagnosis/discussion. Returns true if it was
 * deleted, false if it no longer existed (already gone). */
export async function deleteConversation(id: string): Promise<boolean> {
  try {
    const { deleted } = await apiDeleteConversation(id);
    return deleted;
  } catch {
    return false;
  }
}
