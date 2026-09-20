import Link from "next/link";
import type { ReactNode } from "react";

// ログイン系の画面（ログイン / 新規登録 / パスワード再設定 / 復旧）の共通の外枠と部品。
//
// ■ md（768px）未満：案3「紺ヘッダー一体型」
//   docs/mockups/mobile-v1/V3Login.dc.html（ログイン系だけ案3。他の画面は案1）
//   上に紺の領域（固定 Navbar の紺から境目なしで続く）、その上に白い面を 24px 重ねる。
//   白い面は「箱」ではなく画面の地なので、中にさらに枠や背景つきのかたまりを置かない。
//   入力欄の文字は 16px 以上（これを下回ると iOS がタップ時に勝手に拡大する）。
//   押せるものは 44px 以上の高さを持たせる。
//
// ■ md 以上：これまでのカード表示のまま（見た目を変えない）
//   もとの .auth-page / .auth-card / .form-group / .btn-navy の指定をそのまま写している。
//
// 5画面・全11パターンが同じ外枠を使うので、寸法のきまりはこのファイルだけで面倒を見る。

/** 入力欄・選択欄の見た目（md未満：52px・枠なし・16px／md以上：これまでどおり）。
 *  md 以上の leading-[1.75] は本文の行間。指定しないと Tailwind の既定でもとより低くなる。 */
const CONTROL =
  "h-13 w-full rounded-[10px] bg-bg-light px-4 font-en text-base text-ink outline-none transition-all " +
  "focus:bg-white focus:shadow-[0_0_0_3px_rgba(20,49,74,0.08)] " +
  "md:h-auto md:rounded-sm md:border-[1.5px] md:border-line md:py-3 md:text-sm md:leading-[1.75] md:focus:border-navy";

/** 送信ボタンの見た目。Link に付けることもあるので文字列で出しておく。 */
export const authActionClass =
  "flex h-13 w-full items-center justify-center gap-2 rounded-[10px] bg-navy font-en text-base " +
  "font-bold text-white transition-all " +
  "md:h-auto md:rounded-sm md:px-7 md:py-[13px] md:text-sm md:font-extrabold md:hover:bg-navy-dark";

export default function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    // md 未満の地は紺。白い面を重ねた 24px のすき間から紺がのぞく。
    <main
      className={
        "flex min-h-[calc(100svh-var(--bottom-nav-h))] flex-col bg-navy " +
        "md:min-h-screen md:items-center md:justify-center md:bg-bg-gray md:px-5 " +
        "md:pt-[calc(var(--header-h)+40px)] md:pb-15"
      }
    >
      {/* 紺の領域。スマホではヘッダーを出さないので、画面のいちばん上から始まる。
          ロゴは「/」へのリンクにしてある。ヘッダーが無いと戻る道が無くなるため。 */}
      <div className="flex flex-col items-center gap-2 px-6 pt-18 pb-16 md:hidden">
        <Link
          href="/"
          className="font-en text-[40px] leading-none font-black tracking-[0.14em] text-white"
        >
          TETOMI
        </Link>
        <span className="text-[13px] text-white/75">手から手へ、教科書とつながりを</span>
      </div>

      {/* 白い面。紺に 24px 重ねて、上の角だけ丸める。 */}
      <div
        className={
          "-mt-6 flex flex-1 flex-col gap-6 rounded-t-[20px] bg-white px-4 pt-6 pb-8 " +
          "md:mt-0 md:w-full md:max-w-[440px] md:flex-none md:gap-0 md:rounded-xl md:border " +
          "md:border-line-light md:p-10 md:shadow-lg"
        }
      >
        {/* ロゴは md 以上だけ。md 未満は上の紺の領域に大きく出している。 */}
        <div className="font-en hidden text-center text-[1.6rem] font-black tracking-[0.14em] text-navy md:mb-1.5 md:block">
          TETOMI
        </div>

        <div className="flex flex-col gap-1 md:contents">
          <h1 className="text-[22px] font-black text-navy md:mb-1.5 md:text-center md:text-[1.15rem] md:font-extrabold">
            {title}
          </h1>
          {description && (
            <p className="text-sm leading-relaxed text-ink-mid md:mb-[26px] md:text-center md:text-[13px] md:leading-[1.7] md:text-ink-muted">
              {description}
            </p>
          )}
        </div>

        {children}
      </div>
    </main>
  );
}

/** フォーム。md 未満は項目の間を 20px 空け、md 以上は項目ごとの下余白（これまでどおり）に任せる。 */
export function AuthForm({
  onSubmit,
  children,
}: {
  onSubmit: (e: React.FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 md:block">
      {children}
    </form>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="text-[13px] font-bold text-navy md:mb-[7px] md:block md:text-[11px] md:font-extrabold md:tracking-[0.08em] md:uppercase">
      {label}
      {required && " *"}
    </span>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  required?: boolean;
  /** 入力欄の下に出す補足 */
  hint?: ReactNode;
};

/** ラベル＋入力欄。 */
export function AuthField({ label, required, hint, className, ...input }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5 md:mb-[18px] md:block">
      <FieldLabel label={label} required={required} />
      <input required={required} className={`${CONTROL} ${className ?? ""}`} {...input} />
      {hint && <span className="text-xs leading-relaxed text-ink-muted md:mt-1 md:block">{hint}</span>}
    </label>
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  required?: boolean;
  children: ReactNode;
};

/** ラベル＋選択欄。 */
export function AuthSelect({ label, required, children, className, ...select }: SelectProps) {
  return (
    <label className="flex flex-col gap-1.5 md:mb-[18px] md:block">
      <FieldLabel label={label} required={required} />
      <select required={required} className={`${CONTROL} ${className ?? ""}`} {...select}>
        {children}
      </select>
    </label>
  );
}

/** 横に2つ並べる（学部・学年）。md 未満は縦に積む。 */
export function AuthFieldRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-3.5">{children}</div>;
}

/** 同意チェックなど。 */
export function AuthCheckbox({
  checked,
  onChange,
  compact = false,
  children,
}: {
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** 横に別の要素と並べるとき（ログインの「30日間保持」）。下余白を付けない */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-h-11 items-center gap-2 text-[13px] leading-relaxed text-ink-mid md:min-h-0 md:items-start md:text-xs ${
        compact ? "md:mb-0" : "md:mb-[18px]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-5 shrink-0 accent-navy md:mt-[3px] md:size-auto"
      />
      <span>{children}</span>
    </label>
  );
}

/** 送信ボタン。アイコンは md 以上だけ出す（モックの md 未満は文字だけ）。 */
export function AuthSubmit({
  icon,
  disabled,
  type = "submit",
  onClick,
  children,
}: {
  icon?: string;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={authActionClass}>
      {/* Font Awesome の CSS は CDN 読み込みでレイヤーの外にあり、Tailwind の hidden より
          強く効いてしまう（display を自分で指定しているため）。span で包んで包み側を消す。 */}
      {icon && (
        <span className="hidden md:inline-block" aria-hidden="true">
          <i className={`fas ${icon}`} />
        </span>
      )}
      {children}
    </button>
  );
}

/** 補足の文。md 未満は素の文字、md 以上はこれまでの囲みのまま。 */
export function AuthNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs leading-relaxed text-ink-mid md:mt-3.5 md:rounded-sm md:border-l-[3px] md:border-navy md:bg-bg-light md:px-3.5 md:py-2.5 md:text-[11px] md:leading-[1.7] md:text-ink-muted">
      {children}
    </p>
  );
}

/**
 * 画面の下側に置くリンクの行。
 * md 未満は区切り線を引かない。bottom を付けると画面の下端に寄せる。
 */
export function AuthSwitch({ children, bottom = false }: { children: ReactNode; bottom?: boolean }) {
  return (
    <div
      className={
        "flex flex-col items-center text-sm text-ink-mid " +
        "md:mt-[22px] md:block md:border-t md:border-line-light md:pt-5 md:text-center md:text-[13px] md:text-ink-muted " +
        (bottom ? "mt-auto" : "")
      }
    >
      {children}
    </div>
  );
}

/** 中央寄せの文字リンク（md 未満は高さ 44px を確保する）。 */
export function AuthTextLink({
  href,
  muted = false,
  children,
}: {
  href: string;
  /** 主でないリンクは文字色を落とす */
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-11 items-center justify-center text-sm md:inline md:min-h-0 md:text-[13px] md:font-extrabold md:text-navy md:underline ${
        muted ? "text-ink-mid" : "text-navy"
      }`}
    >
      {children}
    </Link>
  );
}

/** 「アカウントをお持ちでない方は 新規登録」のような、文の中に混ざるリンク。 */
export function AuthInlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center font-bold text-navy md:min-h-0 md:font-extrabold md:underline"
    >
      {children}
    </Link>
  );
}
