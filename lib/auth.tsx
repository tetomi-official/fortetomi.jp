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
import { createClient } from "./supabase/client";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail, isValidEmail } from "./constants";
import { isEnrollmentActive } from "./enrollment";
import {
  clearSessionExp,
  isSessionExpired,
  readSessionExp,
  writeSessionExp,
} from "./supabase/session";

// ===================================================
// Supabase Auth（メール+パスワード / 方針B）
// - 登録は「大学メール」を仮IDにして確認 → 在籍証明。
//   その後「個人メール」へログインIDを切り替える（promotePersonalEmail）。
// - プロフィール項目は profiles テーブルに保持（docs/supabase-setup.sql）。
// - デモユーザーはシード済みアカウント（docs/supabase-seed.sql）で実セッションを張る。
//   これにより一覧・検索・出品など本物のログインと同じ経路で動作する（開発・体験用）。
// ===================================================

const DEMO_KEY = "tetomi_demo_user";
// デモ用シードアカウントの共通パスワード（docs/supabase-seed.sql と一致）。
const DEMO_PASSWORD = "password123";

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
  /** 在籍（大学メール）が現在有効か。失効中は出品・購入を停止する。 */
  enrollmentActive: boolean;
  /** デモユーザーでログイン（シード済みアカウントで実セッションを張る） */
  loginAsDemo: (email: string) => Promise<{ error: string | null }>;
  /** remember=true でログイン保持30日、false（既定）で24時間の絶対期限。 */
  signIn: (
    email: string,
    password: string,
    remember?: boolean,
  ) => Promise<{ error: string | null }>;
  signUp: (
    input: SignUpInput,
  ) => Promise<{ error: string | null; needsConfirm: boolean }>;
  /** 登録確認メール（大学メール宛）を再送する。届かない/期限切れ時の救済。 */
  resendSignupEmail: (email: string) => Promise<{ error: string | null }>;
  /** パスワード再設定メールを送る（PB-012）。リンクは /auth/confirm?type=recovery。 */
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  /** 回復セッション中に新しいパスワードを設定する（PB-012）。 */
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  /** 在籍確認後、ログインIDを個人メールへ切り替える（確認メールが個人宛に飛ぶ） */
  promotePersonalEmail: () => Promise<{ error: string | null; email: string | null }>;
  updateProfile: (patch: Partial<User>) => Promise<{ error: string | null }>;
  /** 現在のセッションの profiles を再取得して user を更新（再認証後の状態反映用）。 */
  refreshUser: () => Promise<void>;
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
  enrollment_valid_until: string | null;
  rating: number | null;
  rating_count: number | null;
}

// profiles に profiles_private を埋め込んだ取得結果を、フラットな ProfileRow に正規化する。
// PostgREST の to-one 埋め込みはオブジェクト/配列どちらの形もありうるので両対応。
function flattenProfile(row: unknown): ProfileRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown> & { profiles_private?: unknown };
  const pv = Array.isArray(r.profiles_private) ? r.profiles_private[0] : r.profiles_private;
  return { ...r, ...((pv as object) ?? {}) } as unknown as ProfileRow;
}

function rowToUser(session: Session, row: ProfileRow | null): User {
  return {
    id: session.user.id,
    name: row?.name ?? session.user.email?.split("@")[0] ?? "",
    email: session.user.email ?? "", // 確認完了後は個人メール
    university_email: row?.university_email ?? "",
    enrollment_valid_until: row?.enrollment_valid_until ?? null,
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
        .select("*, profiles_private(university_email, pending_personal_email, gender)")
        .eq("id", session.user.id)
        .maybeSingle();
      if (active) setUser(rowToUser(session, flattenProfile(row)));
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
      // ログイン保持の絶対期限が切れていたらローカルサインアウト（proxy と同じ判定）。
      if (session && isSessionExpired(readSessionExp())) {
        await supabase.auth.signOut({ scope: "local" });
        if (active) {
          setUser(null);
          setReady(true);
        }
        return;
      }
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

  const loginAsDemo = useCallback(async (email: string) => {
    // シード済みアカウントで実際にサインインする。以後は通常ログインと同じ経路で
    // profiles が hydrate され、一覧・検索・出品（在籍有効）が本物同様に動く。
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: DEMO_PASSWORD,
    });
    // デモも proxy の失効ゲート対象（実セッションを張るため）。保持30日で設定。
    if (!error) writeSessionExp(true);
    return { error: error?.message ?? null };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string, remember = false) => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      // ログイン保持の絶対期限を設定（true=30日 / false=24時間）。proxy が期限で打ち切る。
      writeSessionExp(remember);
      return { error: null };
    },
    [],
  );

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
    // profiles は本人行しか読めない（PII保護）ため、メアド本体は露出せず
    // 存在有無の boolean だけを返す SECURITY DEFINER 関数で判定する。
    const { data: alreadyTaken } = await supabase.rpc("is_university_email_taken", {
      p_email: normalizedUnivEmail,
    });
    if (alreadyTaken) {
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

  // 登録確認メールの再送。signUp と同じ大学メール宛・同じ確認導線（/auth/confirm）に送る。
  // 連打・多重送信の抑止は UI 側のクールダウンで行い、最終的なレート制限は Supabase 側に委ねる。
  const resendSignupEmail = useCallback(async (email: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/confirm`
            : undefined,
      },
    });
    return { error: error?.message ?? null };
  }, []);

  // パスワード再設定メールを送る。リンクを開くと /auth/confirm(type=recovery) が
  // 回復セッションを張り、/reset-password で新パスワードを設定する。
  const sendPasswordReset = useCallback(async (email: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/confirm`
          : undefined,
    });
    return { error: error?.message ?? null };
  }, []);

  // 回復セッション中に新しいパスワードを設定する。
  const updatePassword = useCallback(async (password: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }, []);

  const promotePersonalEmail = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return { error: "ログインしていません", email: null };

    const { data: row } = await supabase
      .from("profiles_private")
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

    // 公開安全な列は profiles、PII（gender）は profiles_private に分けて更新する。
    const { error } = await supabase
      .from("profiles")
      .update({
        name: patch.name,
        university: patch.university,
        faculty: patch.faculty,
        grade: patch.grade,
      })
      .eq("id", authUser.id);
    if (error) return { error: error.message };

    if (patch.gender !== undefined) {
      const { error: privErr } = await supabase
        .from("profiles_private")
        .update({ gender: patch.gender })
        .eq("id", authUser.id);
      if (privErr) return { error: privErr.message };
    }

    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
    return { error: null };
  }, []);

  const refreshUser = useCallback(async () => {
    if (readDemo()) return; // デモは常に有効・固定
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setUser(null);
      return;
    }
    const { data: row } = await supabase
      .from("profiles")
      .select("*, profiles_private(university_email, pending_personal_email, gender)")
      .eq("id", session.user.id)
      .maybeSingle();
    setUser(rowToUser(session, flattenProfile(row)));
  }, []);

  const logout = useCallback(async () => {
    try {
      localStorage.removeItem(DEMO_KEY);
    } catch {
      /* noop */
    }
    clearSessionExp();
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const enrollmentActive = isEnrollmentActive(user?.enrollment_valid_until);

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        enrollmentActive,
        loginAsDemo,
        signIn,
        signUp,
        resendSignupEmail,
        sendPasswordReset,
        updatePassword,
        promotePersonalEmail,
        updateProfile,
        refreshUser,
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
