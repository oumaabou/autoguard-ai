/**
 * profile.tsx
 * ===========
 * Server-backed per-user settings (display name, powertrain, currency,
 * avatar) - replaces the old in-memory-only vehicleSettings.tsx now that
 * there's a backend `profiles` table to persist to (see
 * backend-server/app/profiles.py). Loaded once per login and cached in
 * memory for the rest of the session; each setter calls the backend then
 * updates local state so the UI reflects the change immediately.
 *
 * Must be rendered inside AuthProvider (see _layout.tsx) - it reads
 * useAuth()'s session to know which profile to fetch, and clears itself on
 * sign-out.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PowertrainType } from "../constants/powertrain";
import { DEFAULT_CURRENCY, type CurrencyCode } from "../constants/currency";
import { DEFAULT_LANGUAGE, type LanguageCode } from "../constants/language";
import { useAuth } from "./authStore";
import { apiGetProfile, apiUpdateProfile, apiUploadAvatar, type ProfileRow } from "./api";

export interface ProfileState {
  displayName: string | null;
  powertrain: PowertrainType | null;
  currency: CurrencyCode;
  avatarUrl: string | null;
  hasCompletedOnboarding: boolean;
  /** Which language the Advocacy AI chatbot replies in - see
   * constants/language.ts and lib/api.ts's askQuestion(). */
  language: LanguageCode;
}

function fromRow(row: ProfileRow): ProfileState {
  return {
    displayName: row.display_name,
    powertrain: (row.powertrain as PowertrainType | null) ?? null,
    currency: (row.currency as CurrencyCode) || DEFAULT_CURRENCY,
    // Every re-upload writes to the SAME storage path (upsert=true server-
    // side - see profiles.py's upload_avatar), so the URL itself never
    // changes even though the file behind it did. Without a cache-busting
    // query param, the <Image> component (and the underlying Android/iOS
    // image loader) just keeps showing whatever it already has cached for
    // that exact URL - appending updated_at gives a stable key that only
    // changes when the row (and therefore possibly the avatar) actually
    // does, so a normal profile reload doesn't force a pointless re-fetch.
    avatarUrl: row.avatar_url ? `${row.avatar_url}?v=${encodeURIComponent(row.updated_at)}` : null,
    hasCompletedOnboarding: row.has_completed_onboarding,
    language: (row.language as LanguageCode) || DEFAULT_LANGUAGE,
  };
}

interface ProfileContextValue {
  profile: ProfileState | null;
  isLoading: boolean;
  // Kept as `powertrain`/`setPowertrain` to match the old
  // useVehicleSettings() API, so it only affects chatbot content (never the
  // ML fault detector) - same rule as before.
  powertrain: PowertrainType | null;
  setPowertrain: (p: PowertrainType) => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  setCurrency: (code: CurrencyCode) => Promise<void>;
  setLanguage: (code: LanguageCode) => Promise<void>;
  uploadAvatar: (fileUri: string, fileName: string, mimeType: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

// A profile fetch that fails while the backend happens to be mid-restart
// (e.g. right after `uvicorn --reload` picks up a change) used to leave
// `profile` permanently null for the rest of the session - which made the
// hero card fall back to showing the account email instead of the real
// display name, with the actual username sitting untouched in the database
// the whole time. Retrying a couple times with a short backoff before
// giving up means a normal restart-window blip self-heals instead of
// leaving the UI stuck on that fallback.
const PROFILE_LOAD_MAX_RETRIES = 2;
const PROFILE_LOAD_RETRY_DELAY_MS = 1500;

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = async () => {
    if (!session) {
      setProfile(null);
      return;
    }
    setIsLoading(true);
    for (let attempt = 0; attempt <= PROFILE_LOAD_MAX_RETRIES; attempt++) {
      try {
        const row = await apiGetProfile(session.userId);
        setProfile(fromRow(row));
        setIsLoading(false);
        return;
      } catch {
        if (attempt < PROFILE_LOAD_MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, PROFILE_LOAD_RETRY_DELAY_MS));
        }
      }
    }
    // All attempts failed (backend genuinely unreachable, not just a brief
    // restart blip) - leave profile null, screens fall back to sane
    // defaults (email as display name, DEFAULT_CURRENCY, no powertrain
    // selected) rather than blocking on this.
    setIsLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId]);

  const setPowertrain = async (p: PowertrainType) => {
    if (!session) return;
    setProfile((prev) => (prev ? { ...prev, powertrain: p } : prev));
    const row = await apiUpdateProfile({ user_id: session.userId, powertrain: p });
    setProfile(fromRow(row));
  };

  const setDisplayName = async (name: string) => {
    if (!session) return;
    setProfile((prev) => (prev ? { ...prev, displayName: name } : prev));
    const row = await apiUpdateProfile({ user_id: session.userId, display_name: name });
    setProfile(fromRow(row));
  };

  const setCurrency = async (code: CurrencyCode) => {
    if (!session) return;
    setProfile((prev) => (prev ? { ...prev, currency: code } : prev));
    const row = await apiUpdateProfile({ user_id: session.userId, currency: code });
    setProfile(fromRow(row));
  };

  const setLanguage = async (code: LanguageCode) => {
    if (!session) return;
    setProfile((prev) => (prev ? { ...prev, language: code } : prev));
    const row = await apiUpdateProfile({ user_id: session.userId, language: code });
    setProfile(fromRow(row));
  };

  const uploadAvatar = async (fileUri: string, fileName: string, mimeType: string) => {
    if (!session) return;
    const avatarUrl = await apiUploadAvatar(session.userId, fileUri, fileName, mimeType);
    // Same cache-busting need as fromRow() above, but there's no fresh
    // updated_at here (this is a plain URL string, not a row) - a fresh
    // timestamp is fine since this only runs once, right after a real
    // upload just happened.
    setProfile((prev) => (prev ? { ...prev, avatarUrl: `${avatarUrl}?v=${Date.now()}` } : prev));
  };

  const completeOnboarding = async () => {
    if (!session) return;
    // Optimistic - dismiss immediately, don't make the user wait on a
    // network round trip to close a tutorial.
    setProfile((prev) => (prev ? { ...prev, hasCompletedOnboarding: true } : prev));
    try {
      await apiUpdateProfile({ user_id: session.userId, has_completed_onboarding: true });
    } catch {
      // Not critical if this fails to persist - worst case the walkthrough
      // shows again next launch, which is harmless.
    }
  };

  return (
    <ProfileContext.Provider
      value={{
        profile,
        isLoading,
        powertrain: profile?.powertrain ?? null,
        setPowertrain,
        setDisplayName,
        setCurrency,
        setLanguage,
        uploadAvatar,
        completeOnboarding,
        refresh: load,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within a ProfileProvider");
  return ctx;
}
