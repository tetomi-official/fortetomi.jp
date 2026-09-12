import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMail } from "@/lib/mail";

// ===================================================
// メール送信の分岐（空振り・宛先の付け替え・本番の送信）
//
// 宛先の付け替え（MAIL_REDIRECT_TO）は取り扱いを間違えると事故になる
// （本番に入れると全ユーザーのメールが1人に届く）ので、
// 「設定したときだけ効く」「本来の宛先が分かる形で残る」を固めておく。
// ===================================================

const 手紙 = { to: "sato@g.chuo-u.ac.jp", subject: "【TETOMI】テスト", html: "<p>本文</p>" };

/** Resend への送信を横取りして、実際に送る中身を取り出す。 */
function 送信を横取りする() {
  const spy = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", spy);
  return () => {
    const call = spy.mock.calls[0];
    if (!call) return null;
    return { url: call[0], body: JSON.parse((call[1] as RequestInit).body as string) };
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("メールの送信", () => {
  it("MAIL_DRY_RUN=1 のときは1通も送らない", async () => {
    vi.stubEnv("MAIL_DRY_RUN", "1");
    vi.stubEnv("RESEND_API_KEY", "re_dummy");
    const 取り出す = 送信を横取りする();
    expect(await sendMail(手紙)).toBe(true);
    expect(取り出す()).toBeNull();
  });

  it("APIキーが無いときも送らない（開発環境の逃げ）", async () => {
    vi.stubEnv("MAIL_DRY_RUN", "");
    vi.stubEnv("RESEND_API_KEY", "");
    const 取り出す = 送信を横取りする();
    expect(await sendMail(手紙)).toBe(true);
    expect(取り出す()).toBeNull();
  });

  it("ふだんは本来の宛先にそのまま送る", async () => {
    vi.stubEnv("MAIL_DRY_RUN", "");
    vi.stubEnv("RESEND_API_KEY", "re_dummy");
    vi.stubEnv("MAIL_REDIRECT_TO", "");
    const 取り出す = 送信を横取りする();
    await sendMail(手紙);
    const 送った = 取り出す()!;
    expect(送った.url).toBe("https://api.resend.com/emails");
    expect(送った.body.to).toBe("sato@g.chuo-u.ac.jp");
    expect(送った.body.subject).toBe("【TETOMI】テスト");
    expect(送った.body.html).not.toContain("テスト送信です");
  });

  it("MAIL_REDIRECT_TO があると、その宛先に付け替える", async () => {
    vi.stubEnv("MAIL_DRY_RUN", "");
    vi.stubEnv("RESEND_API_KEY", "re_dummy");
    vi.stubEnv("MAIL_REDIRECT_TO", "watashi@example.com");
    const 取り出す = 送信を横取りする();
    await sendMail(手紙);
    const 送った = 取り出す()!;
    expect(送った.body.to).toBe("watashi@example.com");
    // どれが誰宛てだったか分かること
    expect(送った.body.subject).toBe("[→sato@g.chuo-u.ac.jp] 【TETOMI】テスト");
    expect(送った.body.html).toContain("sato@g.chuo-u.ac.jp");
    expect(送った.body.html).toContain("テスト送信です");
    // 元の本文は残っていること
    expect(送った.body.html).toContain("<p>本文</p>");
  });

  it("空白だけの MAIL_REDIRECT_TO は無視する（消し忘れ対策）", async () => {
    vi.stubEnv("MAIL_DRY_RUN", "");
    vi.stubEnv("RESEND_API_KEY", "re_dummy");
    vi.stubEnv("MAIL_REDIRECT_TO", "   ");
    const 取り出す = 送信を横取りする();
    await sendMail(手紙);
    expect(取り出す()!.body.to).toBe("sato@g.chuo-u.ac.jp");
  });

  it("送信に失敗しても例外を投げない（取引の操作を巻き戻さないため）", async () => {
    vi.stubEnv("MAIL_DRY_RUN", "");
    vi.stubEnv("RESEND_API_KEY", "re_dummy");
    vi.stubGlobal("fetch", async () => {
      throw new Error("ネットワーク断");
    });
    await expect(sendMail(手紙)).resolves.toBe(false);
  });
});
