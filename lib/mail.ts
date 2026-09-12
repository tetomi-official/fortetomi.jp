import type { SupabaseClient } from "@supabase/supabase-js";

// ===================================================
// メール送信の共通部分
// ---------------------------------------------------
// これまで送信処理は再認証・アカウント復旧の3ルートに同じものが3つ書かれていて、
// 取引（購入希望・日程確定・決済完了）の通知は1通も無かった。
// 共通部分をここにまとめ、取引の通知もここを通す。
//
// Resend は依存パッケージを足さず fetch で叩く（既存のやり方を踏襲）。
// ===================================================

/** リクエストが手元に無い場所（Webhook・サーバー処理）からも使えるサイトURL。 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** 差出人。REVERIFY_MAIL_FROM は以前からある名前なので後方互換で見る。 */
function mailFrom(): string {
  return process.env.MAIL_FROM || process.env.REVERIFY_MAIL_FROM || "TETOMI <no-reply@tetomi.jp>";
}

/**
 * メール本文の外枠。メールクライアントは外部CSSを読まないので、すべてインラインで書く。
 * footerHtml を渡すと末尾の注意書きを差し替えられる（認証メールはリンクの
 * 貼り直し用にURLを載せる必要があるため）。
 */
export function mailLayout(heading: string, bodyHtml: string, footerHtml?: string): string {
  const footer =
    footerHtml ??
    `<p style="font-size:12px;color:#6b7280;margin-top:28px">
        このメールは TETOMI の取引の状況をお知らせするものです。<br />
        心当たりがない場合は破棄してください。<br />
        ${siteUrl()}
      </p>`;
  return `
    <div style="font-family:sans-serif;line-height:1.8;color:#1f2937">
      <h2 style="color:#1e293b">${heading}</h2>
      ${bodyHtml}
      ${footer}
    </div>`;
}

/** 認証系メールの末尾。ボタンが押せない環境のためにURLを素で載せる。 */
export function mailLinkFallbackFooter(url: string): string {
  return `<p style="font-size:12px;color:#6b7280">
        このメールに心当たりがない場合は破棄してください。<br />
        リンクが開けない場合はこちら：<br />${url}
      </p>`;
}

/** 本文中のボタン。既存メールと同じ体裁。 */
export function mailButton(label: string, url: string): string {
  return `
    <p style="margin:28px 0">
      <a href="${url}" style="background:#1e293b;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
        ${label}
      </a>
    </p>`;
}

/** 項目の一覧（日時・場所・金額など）。 */
export function mailTable(rows: [string, string][]): string {
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;white-space:nowrap">${k}</td><td style="padding:4px 0;font-weight:bold">${v}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;margin:12px 0">${tr}</table>`;
}

/**
 * メールを1通送る。
 *
 * 送れなくても呼び出し元の処理は止めない前提で、例外を投げずに真偽値を返す。
 * 取引の通知は「届かない」より「取引が失敗する」方が困るため。
 */
export async function sendMail(mail: {
  to: string;
  subject: string;
  html: string;
  /** 送らないときにログへ出す補足。認証メールは確認リンクを入れると開発時に使える。 */
  devHint?: string;
}): Promise<boolean> {
  const hint = mail.devHint ? ` ${mail.devHint}` : "";
  // テスト用の空振りモード。自動E2Eはシードアカウント（実在しないアドレス）で
  // 走るので、これが無いと本当に送ってバウンスする。
  if (process.env.MAIL_DRY_RUN === "1") {
    console.info(`[mail] (送信せず) to=${mail.to} subject=${mail.subject}${hint}`);
    return true;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // 開発環境で未設定のときはログに出して握りつぶす（既存ルートと同じ扱い）。
    console.warn(`[mail] RESEND_API_KEY 未設定。to=${mail.to} subject=${mail.subject}${hint}`);
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mailFrom(),
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
      }),
    });
    if (!res.ok) {
      console.error(`[mail] 送信に失敗: ${res.status} to=${mail.to}`);
    }
    return res.ok;
  } catch (e) {
    console.error("[mail] 送信で例外:", e);
    return false;
  }
}

/**
 * 通知の宛先を決める。
 *
 * 今のログイン用メール（auth.users.email）を第一にする。卒業時に個人メールへ
 * 切り替えた人にもここなら届く（profiles_private.university_email は切替後も
 * 大学メールのまま残るため、そちらを先に見ると死んだ宛先へ送ることになる）。
 */
export async function resolveNotifyEmail(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const email = data?.user?.email?.trim();
    if (email) return email;
  } catch (e) {
    console.error("[mail] ログイン用メールの取得に失敗:", e);
  }
  const { data: priv } = await admin
    .from("profiles_private")
    .select("university_email")
    .eq("id", userId)
    .maybeSingle();
  return priv?.university_email?.trim() || null;
}
