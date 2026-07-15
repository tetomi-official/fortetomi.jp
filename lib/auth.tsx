"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { User } from "./types";
import { createClient } from "./supabase/client";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail, isValidEmail } from "./constants";
import { canChangeLoginEmail } from "./prerelease";
import { isEnrollmentActive, parseEntranceYear } from "./enrollment";
import {
  clearSessionExp,
  isSessionExpired,
  readSessionExp,
  writeSessionExp,
} from "./supabase/session";

// ===================================================
// Supabase Auth（メール+パスワード / 方針C）
// - 登録は「大学メール」を仮IDにして確認 → 在籍証明。以降も大学メールが
//   ログインID（auth.users.email）のまま。登録は確認リンク1回で完結する。
// - 登録時の「個人メール」は復旧用アドレス（recovery_email）として保持し、
//   卒業前に本人が個人メールへログインを切り替える（changeLoginEmail）。
//   切替を忘れてロックアウトした場合は recovery_email 経由で救済する（/recover）。
// - プロフィール項目は profiles / profiles_private テーブルに保持（docs/supabase-setup.sql）。
// - デモユーザーはシード済みアカウント（docs/supabase-seed.sql）で実セッションを張る。
//   これにより一覧・検索・出品など本物のログインと同じ経路で動作する（開発・体験用）。
// ===================================================

// 旧デモ実装が使っていた localStorage キー。現在は掃除（削除）専用に残す。
const DEMO_KEY = "tetomi_demo_user";
// デモ用シードアカウントの共通パスワード（docs/supabase-seed.sql と一致）。
const DEMO_PASSWORD = "password123";

// メール確認リンク・リダイレクトのベースURL。
// これらの呼び出しは全てクライアント（"use client" の useAuth フック内）なので、
// 実際のオリジンを最優先にする。これによりプレビュー（develop）では develop URL、
// 本番（tetomi.jp）では tetomi.jp が自動で使われ、環境ごとに認証を完結できる。
// NEXT_PUBLIC_SITE_URL は window が無い SSR 時のフォールバックに留める。
// ※メール本文リンクの最終的なドメインは Supabase 側テンプレート（{{ .RedirectTo }}）が決める。
function siteOrigin(): string | undefined {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
}

export interface SignUpInput {
  name: string;
  /** 大学メール（@g.chuo-u.ac.jp）。ログインID 兼 在籍確認に使う */
  universityEmail: string;
  /** 個人メール。復旧用アドレス（卒業後の切替先・ロックアウト救済先） */
  recoveryEmail: string;
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
  /** ログインメールを新しいアドレスへ変更する（卒業前の個人メール切替。確認メールが新アドレスに飛ぶ）。 */
  changeLoginEmail: (newEmail: string) => Promise<{ error: string | null }>;
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
  recovery_email: string | null;
  recovery_email_verified: boolean | null;
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
    email: session.user.email ?? "", // ログインID（登録時は大学メール / 切替後は個人メール）
    university_email: row?.university_email ?? "",
    recovery_email: row?.recovery_email ?? "",
    recovery_email_verified: row?.recovery_email_verified ?? false,
    enrollment_valid_until: row?.enrollment_valid_until ?? null,
    university: row?.university ?? "",
    faculty: row?.faculty ?? "",
    grade: row?.grade ?? "",
    gender: row?.gender ?? "",
    rating: row?.rating ?? 5,
    rating_count: row?.rating_count ?? 0,
  };
}

// 旧デモ実装（loginAsDemo が User オブジェクトを localStorage に永続化していた）の
// 残骸を掃除する。現行 loginAsDemo は実セッション方式のためこのキーは不要。
// これを消さないと、過去に旧デモを押したブラウザが起動のたびに古いユーザー
// （例: 削除済みの「鈴木」）を復元し続けてしまう。
function clearLegacyDemo() {
  try {
    localStorage.removeItem(DEMO_KEY);
  } catch {
    /* noop */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  // 在籍自己修復を叩くのはセッションあたり一度だけ（ループ防止）。
  const healTriedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function fetchProfile(userId: string) {
      const { data } = await supabase
        .from("profiles")
        .select("*, profiles_private(university_email, recovery_email, recovery_email_verified, gender)")
        .eq("id", userId)
        .maybeSingle();
      return data;
    }

    async function hydrate(session: Session) {
      let u = rowToUser(session, flattenProfile(await fetchProfile(session.user.id)));

      // 在籍が無効かつ未試行なら、setUser より前にサーバー側の自己修復を試す。
      // 先に付与を済ませてから最終値を一度だけセットするので、バナーが一瞬出て消える
      // ちらつきを防げる。confirm 済みだが在籍付与に取りこぼしたユーザーを救済する。
      // 卒業生・未confirm・許可外ドメインはサーバー側で弾かれ healed:false になる。
      if (!healTriedRef.current && !isEnrollmentActive(u.enrollment_valid_until)) {
        healTriedRef.current = true;
        try {
          const res = await fetch("/api/enrollment/heal", { method: "POST" });
          const json = (await res.json().catch(() => ({}))) as { healed?: boolean };
          if (json?.healed) {
            u = rowToUser(session, flattenProfile(await fetchProfile(session.user.id)));
          }
        } catch {
          /* noop: 失効ユーザーは既存の /reverify 導線に委ねる */
        }
      }

      if (active) setUser(u);
    }

    async function init() {
      clearLegacyDemo();
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
    // 在籍期間は大学メール先頭の入学年コード（例 a24…）から算出する。
    // 読み取れないアドレスは在籍期間を判定できないため登録を弾く。
    if (parseEntranceYear(input.universityEmail) === null) {
      return {
        error: "大学メールから入学年を判別できませんでした。アドレスをご確認ください",
        needsConfirm: false,
      };
    }
    if (!isValidEmail(input.recoveryEmail)) {
      return { error: "復旧用メールアドレスの形式が正しくありません", needsConfirm: false };
    }

    const supabase = createClient();

    // 同一大学メールでの複数登録を事前にチェック（UX 用の早期リターン）。
    // 確実な防御は DB 側の部分ユニークインデックス profiles_private_university_email_uniq。
    // ※卒業切替後は auth.users.email が個人メールへ置き換わり大学メールが解放されるため、
    //   大学メールの重複は profiles_private.university_email を見ないと判定できない。
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
      // 重複チェックと同じ正規化済み値を渡す。生入力のままだと、スマホの
      // オートコレクト/予測変換で末尾スペースや大文字が混入した際に
      // 「検証は通ったのに送信先アドレスが別物」になり確認メールが不達になる。
      email: normalizedUnivEmail, // ログインID = 大学メール（在籍中はこのまま）
      password: input.password,
      options: {
        // profiles 行はこのメタデータから DB トリガーが作成する
        data: {
          name: input.name,
          university: input.university ?? "",
          faculty: input.faculty ?? "",
          grade: input.grade ?? "",
          gender: input.gender ?? "",
          recovery_email: input.recoveryEmail, // 復旧用アドレス（卒業時の切替先）
        },
        emailRedirectTo: siteOrigin() ? `${siteOrigin()}/auth/confirm` : undefined,
      },
    });
    if (error) {
      // スマホではエラートーストを見落としやすいので、切り分け用に痕跡を残す。
      console.error("[signUp] Supabase auth.signUp failed:", error.message);
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
      email: email.trim().toLowerCase(), // signUp と同じ正規化で宛先の揺れを防ぐ
      options: {
        emailRedirectTo: siteOrigin() ? `${siteOrigin()}/auth/confirm` : undefined,
      },
    });
    return { error: error?.message ?? null };
  }, []);

  // パスワード再設定メールを送る。リンクを開くと /auth/confirm(type=recovery) が
  // 回復セッションを張り、/reset-password で新パスワードを設定する。
  const sendPasswordReset = useCallback(async (email: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: siteOrigin() ? `${siteOrigin()}/auth/confirm` : undefined,
    });
    return { error: error?.message ?? null };
  }, []);

  // 回復セッション中に新しいパスワードを設定する。
  const updatePassword = useCallback(async (password: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }, []);

  // ログインメールを新しいアドレスへ変更する（卒業前の個人メール切替）。
  // updateUser が新アドレス宛に email_change の確認メールを送り、リンクを開くと
  // /auth/confirm(type=email_change) で切替が確定する。
  const changeLoginEmail = useCallback(async (newEmail: string) => {
    // 切替機能は初期は無効（フラグで後日解禁）。UI を隠すだけでなくここでも遮断する。
    if (!canChangeLoginEmail) {
      return { error: "メールアドレスの切替は現在ご利用いただけません" };
    }
    const trimmed = newEmail.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      return { error: "メールアドレスの形式が正しくありません" };
    }
    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return { error: "ログインしていません" };

    // すでにそのアドレスなら何もしない。
    if (authUser.email?.toLowerCase() === trimmed.toLowerCase()) {
      return { error: null };
    }

    const { error } = await supabase.auth.updateUser(
      { email: trimmed },
      {
        emailRedirectTo: siteOrigin() ? `${siteOrigin()}/auth/confirm` : undefined,
      },
    );
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const updateProfile = useCallback(async (patch: Partial<User>) => {
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

    // PII（gender / 復旧用アドレス）は profiles_private を更新する。
    // ※ログインメール（email）は auth 側のフローが必要なので changeLoginEmail で扱う。
    const privatePatch: { gender?: string; recovery_email?: string } = {};
    if (patch.gender !== undefined) privatePatch.gender = patch.gender;
    if (patch.recovery_email !== undefined) privatePatch.recovery_email = patch.recovery_email;
    if (Object.keys(privatePatch).length > 0) {
      const { error: privErr } = await supabase
        .from("profiles_private")
        .update(privatePatch)
        .eq("id", authUser.id);
      if (privErr) return { error: privErr.message };
    }

    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      // 復旧用アドレスを別のアドレスに変えると、DB トリガーが検証状態をリセットする。
      // ローカルの user もそれに合わせて未検証に落とす（バナー/バッジ表示の整合）。
      if (patch.recovery_email !== undefined && patch.recovery_email !== prev.recovery_email) {
        next.recovery_email_verified = false;
      }
      return next;
    });
    return { error: null };
  }, []);

  const refreshUser = useCallback(async () => {
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
      .select("*, profiles_private(university_email, recovery_email, recovery_email_verified, gender)")
      .eq("id", session.user.id)
      .maybeSingle();
    setUser(rowToUser(session, flattenProfile(row)));
  }, []);

  const logout = useCallback(async () => {
    clearLegacyDemo();
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
        changeLoginEmail,
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
