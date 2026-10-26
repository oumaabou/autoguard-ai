/**
 * authStore.tsx
 * =============
 * Real login/signup against the backend's /auth/signup + /auth/login
 * (Supabase Auth under the hood - see backend-server/app/auth.py). The
 * session is persisted with AsyncStorage so it survives app restarts, and
 * exposed two ways:
 *   - useAuth() - for screens/components (auth.tsx, profile.tsx sign out)
 *   - getSession() - a plain async function for non-component code that
 *     needs to know who's logged in (lib/chatHistory.ts)
 *
 * AuthProvider also gates navigation: if there's no session and the current
 * route isn't the welcome screen or the auth screen itself, it redirects to
 * /auth. This is the only screen-access control in the app right now - the
 * backend does not currently verify the access_token on requests, so this
 * is UI-level gating, not a security boundary. Good enough for this app's
 * current scope; tightening that is a later step if it's ever needed.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useSegments } from "expo-router";
import { signUp as apiSignUp, logIn as apiLogIn, type AuthResponse } from "./api";

const STORAGE_KEY = "autoguard:session";

export interface Session {
  userId: string;
  email: string;
  accessToken: string | null;
}

let cachedSession: Session | null = null;
let hasLoaded = false;

async function loadSession(): Promise<Session | null> {
  if (hasLoaded) return cachedSession;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  cachedSession = raw ? (JSON.parse(raw) as Session) : null;
  hasLoaded = true;
  return cachedSession;
}

/** Plain async getter for non-component modules (e.g. chatHistory.ts). */
export async function getSession(): Promise<Session | null> {
  return loadSession();
}

async function persist(session: Session | null): Promise<void> {
  cachedSession = session;
  hasLoaded = true;
  if (session) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else await AsyncStorage.removeItem(STORAGE_KEY);
}

function toSession(res: AuthResponse): Session {
  return { userId: res.user_id, email: res.email, accessToken: res.access_token };
}

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  signUp: (email: string, password: string, username: string) => Promise<{ needsEmailConfirmation: boolean }>;
  logIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Route segments that don't require a logged-in session.
const PUBLIC_SEGMENTS = new Set(["", "auth", "index"]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    loadSession().then((s) => {
      setSession(s);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const current = segments[0] ?? "";
    if (!session && !PUBLIC_SEGMENTS.has(current)) {
      router.replace("/auth" as any);
    }
  }, [session, isLoading, segments]);

  const signUp = async (email: string, password: string, username: string) => {
    const result = await apiSignUp(email, password, username);
    if (result.access_token) {
      const s = toSession(result);
      await persist(s);
      setSession(s);
    }
    return { needsEmailConfirmation: result.needs_email_confirmation };
  };

  const logIn = async (identifier: string, password: string) => {
    const result = await apiLogIn(identifier, password);
    const s = toSession(result);
    await persist(s);
    setSession(s);
  };

  const signOut = async () => {
    await persist(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, isLoading, signUp, logIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
