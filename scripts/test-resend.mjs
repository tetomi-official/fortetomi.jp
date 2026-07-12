// Resend 疎通テスト。ドメイン認証・API キー設定後に、SMTP/Supabase を触る前に
// Resend 単体でメールが送れる（到達する）かを確認するための最小スクリプト。
//
// 使い方:
//   npm run test:resend -- you@example.com
// もしくは直接:
//   node --env-file=.env.local scripts/test-resend.mjs you@example.com
//
// 参照する環境変数（app/api/reverify/request と共通）:
//   RESEND_API_KEY       … 必須。Resend の API キー。
//   REVERIFY_MAIL_FROM   … 任意。送信元。既定 "TETOMI <no-reply@tetomi.jp>"。

const to = process.argv[2];
if (!to) {
  console.error("宛先を指定してください: npm run test:resend -- you@example.com");
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error(
    "RESEND_API_KEY が未設定です。.env.local に設定するか --env-file で読み込んでください。",
  );
  process.exit(1);
}

const from = process.env.REVERIFY_MAIL_FROM || "TETOMI <no-reply@tetomi.jp>";
const now = new Date().toISOString();

const html = `
  <div style="font-family:sans-serif;line-height:1.8;color:#1f2937">
    <h2 style="color:#1e293b">Resend 疎通テスト</h2>
    <p>このメールは TETOMI の Resend 設定確認用のテスト送信です。</p>
    <p>このメールが届いていれば、ドメイン認証と API キーが正しく設定されています。</p>
    <p style="font-size:12px;color:#6b7280">送信元: ${from}<br />送信時刻: ${now}</p>
  </div>`;

try {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "【TETOMI】Resend 疎通テスト",
      html,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log(`✓ 送信成功: ${from} → ${to}`);
    console.log("Resend レスポンス:", JSON.stringify(body));
    console.log("受信トレイ（迷惑メールフォルダも）を確認してください。");
  } else {
    console.error(`✗ 送信失敗 (HTTP ${res.status})`);
    console.error("Resend レスポンス:", JSON.stringify(body));
    process.exit(1);
  }
} catch (err) {
  console.error("✗ 送信リクエストでエラー:", err);
  process.exit(1);
}
