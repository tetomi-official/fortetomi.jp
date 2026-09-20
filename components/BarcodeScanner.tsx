"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

type Controls = { stop: () => void };

/**
 * カメラが使えないときの案内。呼び出し側に「手入力」の逃げ道があるかで変える。
 * - manual: 手入力の欄がある（ISBN の出品フォーム）
 * - retry : 手入力が無い（受け渡しQR。合言葉は長くて手では打てない）ので、許可してやり直してもらう
 */
const CAMERA_ERROR = {
  manual: {
    denied: "カメラの使用が許可されませんでした。ブラウザの設定をご確認のうえ、手入力をご利用ください。",
    failed: "カメラを起動できませんでした。手入力をご利用ください。",
  },
  retry: {
    denied:
      "カメラの使用が許可されませんでした。ブラウザの設定でこのサイトのカメラを許可してから、もう一度お試しください。",
    failed: "カメラを起動できませんでした。ほかのアプリがカメラを使っていないか確認して、もう一度お試しください。",
  },
} as const;

/**
 * カメラ映像に重ねる読み取り枠の形。映像の枠（下の aspectRatio 4/3）に対する割合で置く。
 * 読み取り自体は映像全体を走査しているので、枠は「ここに向けてください」の目印にすぎない。
 * - wide  : ISBN バーコード（横長）向け
 * - square: QR（正方形）向け。高さ基準の正方形を中央に置く
 */
const FRAME_SHAPE = {
  wide: { left: "10%", right: "10%", top: "40%", bottom: "40%" },
  square: {
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    height: "78%",
    aspectRatio: "1 / 1",
  },
} as const;

// ISBN バーコードは EAN-13（978/979 始まり）。EAN-8 も一応許容する。
function isIsbnBarcode(text: string): boolean {
  const t = text.replace(/[^0-9Xx]/g, "");
  return t.length === 13 && (t.startsWith("978") || t.startsWith("979"));
}

/**
 * カメラでコードを読み取るモーダル。既定は ISBN バーコード（EAN-13, PB-018 ②）。
 * formats/validate/transform を渡せば QR など別用途にも使える（PB-036 受け渡しQR）。
 * 読み取れたら onDetected(value) を呼んで自動で閉じる。手入力フォールバックは呼び出し側に残す
 * （手入力が無い用途では cameraFallback="retry" を渡し、案内から手入力を外す）。
 */
export default function BarcodeScanner({
  onDetected,
  onClose,
  formats = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8],
  validate = isIsbnBarcode,
  transform = (t) => t.replace(/[^0-9Xx]/g, ""),
  title = "バーコードを読み取る",
  hint = "本の裏表紙にあるISBNバーコード（978…）を枠内に映してください。",
  cameraFallback = "manual",
  frameShape = "wide",
}: {
  onDetected: (value: string) => void;
  onClose: () => void;
  formats?: BarcodeFormat[];
  validate?: (text: string) => boolean;
  transform?: (text: string) => string;
  title?: string;
  hint?: string;
  /** カメラが使えないときの案内の種類（上の CAMERA_ERROR を参照）。 */
  cameraFallback?: keyof typeof CAMERA_ERROR;
  /** 読み取り枠の形。wide=ISBNバーコード向けの横長、square=QR向けの正方形。 */
  frameShape?: keyof typeof FRAME_SHAPE;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
    const reader = new BrowserMultiFormatReader(hints);

    let controls: Controls | null = null;
    let stopped = false;

    const stop = () => {
      stopped = true;
      try {
        controls?.stop();
      } catch {
        /* noop */
      }
    };

    const showError = (e: unknown) => {
      if (stopped) return;
      const name = e instanceof Error ? e.name : "";
      const messages = CAMERA_ERROR[cameraFallback];
      setError(name === "NotAllowedError" ? messages.denied : messages.failed);
    };

    // カメラは自分で開き、読み取りの部品には開いたものを渡す。
    // 開発モード（React の Strict Mode）ではこの処理が「実行→片付け→実行」と2回走り、
    // 2回とも同じ video 要素を使う。1回目のカメラが開き終わる前に片付けが来たとき、
    // 読み取りの部品ごと止めると video 要素まで空にしてしまい、2回目のカメラが
    // 映らなくなる。そこで、片付け済みなら「自分で開いたカメラだけ」を閉じて終える。
    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
      } catch (e) {
        showError(e);
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      try {
        const ctrl = await reader.decodeFromStream(stream, videoRef.current!, (result, _err, c) => {
          controls = c;
          if (result && !stopped) {
            const text = result.getText();
            if (validate(text)) {
              stop();
              onDetected(transform(text));
            }
          }
        });
        controls = ctrl;
        if (stopped) ctrl.stop();
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        showError(e);
      }
    })();

    return stop;
    // モーダルはマウントごとに新規生成されるため、起動は1回だけでよい（props は初期値を採用）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <button className="modal-close" onClick={onClose} aria-label="閉じる">
          <i className="fas fa-times" />
        </button>
        <div className="modal-logo">{title}</div>
        <p className="modal-sub">{hint}</p>

        {error ? (
          <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-muted)", fontSize: 14, lineHeight: 1.8 }}>
            <div style={{ fontSize: "2rem", marginBottom: 12 }}>📷</div>
            {error}
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              borderRadius: "var(--r)",
              overflow: "hidden",
              background: "#000",
              aspectRatio: "4 / 3",
            }}
          >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline />
            <div
              style={{
                position: "absolute",
                ...FRAME_SHAPE[frameShape],
                border: "2px solid rgba(255,255,255,0.9)",
                borderRadius: 8,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
