/**
 * language.ts
 * ===========
 * Single source of truth for the "Application Language" picker in Profile.
 * The selection is a persisted per-user setting (profiles.language in
 * Supabase, via lib/profile.tsx) - it's sent to the backend on every
 * Advocacy AI chat message (see lib/api.ts's askQuestion), which instructs
 * Gemini/Groq to generate its whole reply in that language (see
 * backend-server/app/rag_engine.py's LANGUAGE_NAMES). This does NOT
 * translate the app's own UI text, and does NOT affect the on-device ML
 * fault detector or the template-based /diagnose opening message (no LLM
 * call there by design - see opening_templates.py).
 */

export const LANGUAGES = [
  { code: "en", label: "English (US)" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "ja", label: "日本語" },
  { code: "ms", label: "Bahasa Melayu" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function languageLabel(code: string | null | undefined): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? LANGUAGES.find((l) => l.code === DEFAULT_LANGUAGE)!.label;
}
