"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

type Controls = { stop: () => void };

// ISBN バーコードは EAN-13（978/979 始まり）。EAN-8 も一応許容する。
function isIsbnBarcode(text: string): boolean {
  const t = text.replace(/[^0-9Xx]/g, "");
  return t.length === 13 && (t.startsWith("978") || t.startsWith("979"));
}

/**
 * カメラでコードを読み取るモーダル。既定は ISBN バーコード（EAN-13, PB-018 ②）。
 * formats/validate/transform を渡せば QR など別用途にも使える（PB-036 受け渡しQR）。
 * 読み取れたら onDetected(value) を呼んで自動で閉じる。手入力フォールバックは呼び出し側に残す。
 */
export default function BarcodeScanner({
  onDetected,
  onClose,
  formats = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8],
  validate = isIsbnBarcode,
  transform = (t) => t.replace(/[^0-9Xx]/g, ""),
  title = "バーコードを読み取る",
  hint = "本の裏表紙にあるISBNバーコード（978…）を枠内に映してください。",
}: {
  onDetected: (value: string) => void;
  onClose: () => void;
  formats?: BarcodeFormat[];
  validate?: (text: string) => boolean;
  transform?: (text: string) => string;
  title?: string;
  hint?: string;
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

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current!,
        (result, _err, ctrl) => {
          controls = ctrl;
          if (result && !stopped) {
            const text = result.getText();
            if (validate(text)) {
              stop();
              onDetected(transform(text));
            }
          }
        },
      )
      .then((ctrl) => {
        controls = ctrl;
        if (stopped) ctrl.stop();
      })
      .catch((e: unknown) => {
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "カメラの使用が許可されませんでした。ブラウザの設定をご確認のうえ、手入力をご利用ください。"
            : "カメラを起動できませんでした。手入力をご利用ください。",
        );
      });

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
                left: "10%",
                right: "10%",
                top: "40%",
                bottom: "40%",
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
