import { RESERVATION_STATUSES } from "./types";

/**
 * 絞り込みの入力欄。ふつうの GET フォームにしてある（#60）。
 *
 * JavaScript を使わないので、絞り込んだ状態の URL をそのまま人に渡せるし、
 * 読み込み中に空の一覧がちらつくこともない。
 */
export default function SearchBar({
  q,
  status,
  trouble,
}: {
  q: string;
  status: string;
  trouble: boolean;
}) {
  return (
    <form
      method="get"
      action="/admin"
      className="flex flex-col gap-3 rounded-lg border border-line-light bg-white p-4 md:flex-row md:items-center"
    >
      <label className="flex-1">
        <span className="sr-only">教科書名・利用者で検索</span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="教科書名・利用者で検索"
          className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-navy focus:outline-none"
        />
      </label>

      <label className="md:w-40">
        <span className="sr-only">取引の状態</span>
        <select
          name="status"
          defaultValue={status}
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:border-navy focus:outline-none"
        >
          <option value="">すべての状態</option>
          {RESERVATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-ink-mid">
        <input
          type="checkbox"
          name="trouble"
          value="1"
          defaultChecked={trouble}
          className="size-4 accent-navy"
        />
        決済で困りごと
      </label>

      <button
        type="submit"
        className="rounded-md bg-navy px-5 py-2 text-sm font-bold text-white hover:bg-navy-mid"
      >
        絞り込む
      </button>
    </form>
  );
}
