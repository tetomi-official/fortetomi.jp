// ===================================================
// 偽のカメラに「買い手の画面に出ているQR」を映すための部品。
//
// Chrome は --use-file-for-fake-video-capture=<file.y4m> を渡すと、
// 本物のカメラの代わりにその動画を流す。y4m は「見出し＋生の画素」だけの
// 単純な形式なので、ライブラリなしで書ける。
//
// QRは自前で作らず、買い手の画面に実際に描かれた SVG をそのまま写し取る。
// こうすると「アプリが出すQRを、アプリの読み取り画面が読めるか」を通しで確かめられる。
// ===================================================

import { writeFile } from "node:fs/promises";

const 幅 = 640;
const 高さ = 480;

/**
 * 買い手の受け渡し画面に描かれているQR（.form-card svg）を、
 * 白地の 640x480 に置いた白黒の画素（明るさ 0〜255）として取り出す。
 */
export async function 画面のQRを写し取る(page, { 大きさ = 360 } = {}) {
  const base64 = await page.evaluate(
    async (W, H, size) => {
      const svg = document.querySelector(".form-card svg");
      if (!svg) throw new Error("QRのSVGが見つかりません");
      const xml = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
      await img.decode();
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, (W - size) / 2, (H - size) / 2, size, size);
      const { data } = ctx.getImageData(0, 0, W, H);
      const y = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        y[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
      }
      let s = "";
      for (let i = 0; i < y.length; i += 0x8000) s += String.fromCharCode(...y.subarray(i, i + 0x8000));
      return btoa(s);
    },
    幅,
    高さ,
    大きさ,
  );
  return Buffer.from(base64, "base64");
}

/** 明るさの画素から、同じ絵が続く y4m 動画を書き出す（Chrome は最後まで流すと先頭に戻る）。 */
export async function y4mを書く(path, 明るさ, { コマ数 = 10 } = {}) {
  const 色 = Buffer.alloc((幅 / 2) * (高さ / 2), 128); // 色なし（白黒）
  const 部品 = [Buffer.from(`YUV4MPEG2 W${幅} H${高さ} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < コマ数; i++) {
    部品.push(Buffer.from("FRAME\n"), 明るさ, 色, 色);
  }
  await writeFile(path, Buffer.concat(部品));
}
