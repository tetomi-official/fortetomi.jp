"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "./types";
import { mockUsers } from "./mock-data";

// ===================================================
// モック認証
// localStorage にユーザーを保持するだけの簡易実装。
// 要件フェーズで Supabase Auth（セッション/Cookie）に差し替える。
// ===================================================

const AUTH_KEY = "tetomi_user";

interface AuthContextValue {
  user: User | null;
  ready: boolean;
  loginAsDemo: (userId: string) => void;
  loginOrCreate: (input: Partial<User> & { name: string; email: string }) => void;
  updateProfile: (patch: Partial<User>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* noop */
    }
    setReady(true);
  }, []);

  const persist = useCallback((u: User | null) => {
    setUser(u);
    try {
      if (u) localStorage.setItem(AUTH_KEY, JSON.stringify(u));
      else localStorage.removeItem(AUTH_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const loginAsDemo = useCallback(
    (userId: string) => {
      const found = mockUsers.find((u) => u.id === userId);
      if (found) persist(found);
    },
    [persist],
  );

  const loginOrCreate = useCallback(
    (input: Partial<User> & { name: string; email: string }) => {
      const existing = mockUsers.find((u) => u.email === input.email);
      if (existing) {
        persist(existing);
        return;
      }
      const created: User = {
        id: `user_${Date.now()}`,
        name: input.name,
        email: input.email,
        university: input.university ?? "",
        faculty: input.faculty ?? "",
        grade: input.grade ?? "3年",
        rating: 5,
        rating_count: 0,
      };
      persist(created);
    },
    [persist],
  );

  const updateProfile = useCallback(
    (patch: Partial<User>) => {
      setUser((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(AUTH_KEY, JSON.stringify(next));
        } catch {
          /* noop */
        }
        return next;
      });
    },
    [],
  );

  const logout = useCallback(() => persist(null), [persist]);

  return (
    <AuthContext.Provider
      value={{ user, ready, loginAsDemo, loginOrCreate, updateProfile, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
