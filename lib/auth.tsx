"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { User } from "./types";
import { mockUsers } from "./mock-data";
import { createClient } from "./supabase/client";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail, isValidEmail } from "./constants";

// ===================================================
// Supabase Auth（メール+パスワード / 方針B）
// - 登録は「大学メール」を仮IDにして確認 → 在籍証明。
//   その後「個人メール」へログインIDを切り替える（promotePersonalEmail）。
// - プロフィール項目は profiles テーブルに保持（docs/supabase-setup.sql）。
// - デモユーザーは Supabase 非経由で localStorage 併存（開発・体験用）。
// ===================================================

const DEMO_KEY = "tetomi_demo_user";

export interface SignUpInput {
  name: string;
  /** 大学メール（@g.chuo-u.ac.jp）。在籍確認に使う仮ID */
  universityEmail: string;
  /** 個人メール。登録完了後のログインID */
  personalEmail: string;
  password: string;
  university?: string;
  faculty?: string;
  grade?: string;
  gender?: string;
}

interface AuthContextValue {
  user: User | null;
  ready: boolean;
  /** デモユーザーで即ログイン（Supabase 非経由） */
  loginAsDemo: (userId: string) => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    input: SignUpInput,
  ) => Promise<{ error: string | null; needsConfirm: boolean }>;
  /** 在籍確認後、ログインIDを個人メールへ切り替える（確認メールが個人宛に飛ぶ） */
  promotePersonalEmail: () => Promise<{ error: string | null; email: string | null }>;
  updateProfile: (patch: Partial<User>) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** profiles テーブルの1行（カラムは docs/supabase-setup.sql 参照） */
interface ProfileRow {
  id: string;
  name: string | null;
  university: string | null;
  faculty: string | null;
  grade: string | null;
  gender: string | null;
  university_email: string | null;
  pending_personal_email: string | null;
  enrollment_verified: boolean | null;
  rating: number | null;
  rating_count: number | null;
}

function rowToUser(session: Session, row: ProfileRow | null): User {
  return {
    id: session.user.id,
    name: row?.name ?? session.user.email?.split("@")[0] ?? "",
    email: session.user.email ?? "", // 確認完了後は個人メール
    university_email: row?.university_email ?? "",
    university: row?.university ?? "",
    faculty: row?.faculty ?? "",
    grade: row?.grade ?? "",
    gender: row?.gender ?? "",
    rating: row?.rating ?? 5,
    rating_count: row?.rating_count ?? 0,
  };
}

function readDemo(): User | null {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function hydrate(session: Session) {
      const { data: row } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();
      if (active) setUser(rowToUser(session, row));
    }

    async function init() {
      const demo = readDemo();
      if (demo) {
        setUser(demo);
        setReady(true);
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) await hydrate(session);
      if (active) setReady(true);
    }
    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (readDemo()) return;
      if (session) void hydrate(session);
      else setUser(null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const loginAsDemo = useCallback((userId: string) => {
    const found = mockUsers.find((u) => u.id === userId);
    if (!found) return;
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(found));
    } catch {
      /* noop */
    }
    setUser(found);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    // 大学メールは許可ドメイン、個人メールは形式チェック（最終防御）
    if (!isAllowedEmail(input.universityEmail)) {
      return {
        error: `大学メールは @${ALLOWED_EMAIL_DOMAIN} のアドレスのみ登録できます`,
        needsConfirm: false,
      };
    }
    if (!isValidEmail(input.personalEmail)) {
      return { error: "個人メールアドレスの形式が正しくありません", needsConfirm: false };
    }

    const supabase = createClient();

    // 同一大学メールでの複数登録を事前にチェック（UX 用の早期リターン）。
    // 確実な防御は DB 側の部分ユニークインデックス profiles_university_email_uniq。
    // ※auth.users.email は確認後に個人メールへ置き換わるため、
    //   大学メールの重複は profiles.university_email を見ないと判定できない。
    const normalizedUnivEmail = input.universityEmail.trim().toLowerCase();
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("university_email", normalizedUnivEmail)
      .limit(1);
    if (existing && existing.length > 0) {
      return {
        error: "この大学メールアドレスはすでに登録に使用されています",
        needsConfirm: false,
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email: input.universityEmail, // 仮ID = 大学メール
      password: input.password,
      options: {
        // profiles 行はこのメタデータから DB トリガーが作成する
        data: {
          name: input.name,
          university: input.university ?? "",
          faculty: input.faculty ?? "",
          grade: input.grade ?? "",
          gender: input.gender ?? "",
          personal_email: input.personalEmail, // 後でログインIDへ昇格
        },
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/confirm`
            : undefined,
      },
    });
    if (error) {
      // 事前チェックをすり抜けた競合時は、DB のユニーク制約が
      // handle_new_user トリガー内で発火し、GoTrue は汎用的な
      // 「Database error saving new user」を返す。重複の可能性として案内する。
      if (/database error/i.test(error.message)) {
        return {
          error: "この大学メールアドレスはすでに登録に使用されている可能性があります",
          needsConfirm: false,
        };
      }
      return { error: error.message, needsConfirm: false };
    }
    return { error: null, needsConfirm: !data.session };
  }, []);

  const promotePersonalEmail = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return { error: "ログインしていません", email: null };

    const { data: row } = await supabase
      .from("profiles")
      .select("pending_personal_email")
      .eq("id", authUser.id)
      .maybeSingle();

    const personal = row?.pending_personal_email;
    if (!personal) {
      return { error: "登録された個人メールが見つかりません", email: null };
    }

    // すでに個人メールに切り替わっていれば何もしない
    if (authUser.email?.toLowerCase() === personal.toLowerCase()) {
      return { error: null, email: personal };
    }

    const { error } = await supabase.auth.updateUser(
      { email: personal },
      {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/confirm`
            : undefined,
      },
    );
    if (error) return { error: error.message, email: personal };
    return { error: null, email: personal };
  }, []);

  const updateProfile = useCallback(async (patch: Partial<User>) => {
    if (readDemo()) {
      setUser((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(DEMO_KEY, JSON.stringify(next));
        } catch {
          /* noop */
        }
        return next;
      });
      return { error: null };
    }

    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return { error: "ログインしていません" };

    const { error } = await supabase
      .from("profiles")
      .update({
        name: patch.name,
        university: patch.university,
        faculty: patch.faculty,
        grade: patch.grade,
        gender: patch.gender,
      })
      .eq("id", authUser.id);
    if (error) return { error: error.message };

    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
    return { error: null };
  }, []);

  const logout = useCallback(async () => {
    try {
      localStorage.removeItem(DEMO_KEY);
    } catch {
      /* noop */
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        loginAsDemo,
        signIn,
        signUp,
        promotePersonalEmail,
        updateProfile,
        logout,
      }}
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
