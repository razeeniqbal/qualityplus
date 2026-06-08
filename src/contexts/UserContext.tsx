import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { apiClient } from '../lib/api-client';

interface User {
  id: string;
  displayName: string;
  role: 'admin' | 'user';
}

interface UserContextValue {
  user: User | null;
  isLoading: boolean;
  isLoggingIn: boolean;
  loginError: string | null;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ needsEmailConfirmation: boolean }>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  isLoading: true,
  isLoggingIn: false,
  loginError: null,
  login: async () => {},
  signUp: async () => ({ needsEmailConfirmation: false }),
  logout: async () => {},
});

async function resolveUser(session: Session | null): Promise<User | null> {
  if (!session?.user) return null;
  try {
    const row = await apiClient.getAppUserByAuthId(session.user.id);
    if (!row) return null;
    return {
      id: row.id as string,
      displayName: row.display_name as string,
      role: (row.role as 'admin' | 'user') ?? 'user',
    };
  } catch (err) {
    console.error('Failed to resolve app user from session', err);
    return null;
  }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    let initialCheckDone = false;

    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (initialCheckDone) return;
        initialCheckDone = true;
        const resolved = await resolveUser(data.session);
        if (!cancelled) {
          setUser(resolved);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to get auth session', err);
        if (!cancelled) {
          initialCheckDone = true;
          setUser(null);
          setIsLoading(false);
        }
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      initialCheckDone = true;
      // Defer async work out of the callback — awaiting Supabase calls directly
      // inside onAuthStateChange can deadlock the auth client.
      setTimeout(async () => {
        const resolved = await resolveUser(session);
        if (!cancelled) {
          setUser(resolved);
          setIsLoading(false);
        }
      }, 0);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function login(email: string, password: string) {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Failed to sign in. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function signUp(email: string, password: string, displayName: string) {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;
      return { needsEmailConfirmation: !data.session };
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Failed to create account. Please try again.');
      return { needsEmailConfirmation: false };
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setLoginError(null);
  }

  return (
    <UserContext.Provider value={{ user, isLoading, isLoggingIn, loginError, login, signUp, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
