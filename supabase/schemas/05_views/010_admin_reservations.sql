-- 運営の取引一覧（/admin）が読むもの（#60）。
--
-- なぜ view にするか
--   取引・出品・利用者の3つを毎回つなぐ必要があり、検索（教科書名・利用者名）も
--   またぐ。アプリ側で組み立てると同じ join が散らばるので、DB に1つだけ置く。
--
-- 守りは二重
--   ① security_invoker = true
--      見る人の権限で元のテーブルを読む。つまり reservations / listings の
--      行の見え方は RLS のまま。service_role 鍵は使わない。
--   ② where public.is_admin()
--      運営でなければ、何をどう問い合わせても 0 行。
--
-- 載せない列（本人の情報は要るものだけにする方針）
--   メールアドレス・性別・カード情報・メッセージ本文、
--   決済ID（charge_id / payment_intent_id）。
--   必要になったら、そのとき改めて広げる。
CREATE OR REPLACE VIEW "public"."admin_reservations"
WITH ("security_invoker" = 'true') AS
SELECT
    r."id",
    r."status",
    r."created_at",
    r."price",

    -- 出品
    r."listing_id",
    l."title"  AS "listing_title",
    l."status" AS "listing_status",

    -- 当事者（表示名・学部・学年だけ。ログイン済みなら誰でも見える範囲）
    r."buyer_id",
    bp."name"    AS "buyer_name",
    bp."faculty" AS "buyer_faculty",
    bp."grade"   AS "buyer_grade",
    r."seller_id",
    sp."name"    AS "seller_name",
    sp."faculty" AS "seller_faculty",
    sp."grade"   AS "seller_grade",

    -- 受け渡しの日程
    r."preferred_date",
    r."preferred_time",
    r."preferred_location",
    r."proposed_date",
    r."proposed_time",
    r."proposed_location",
    r."candidate_slots",
    r."selected_slot",

    -- 決済の状況（金額の行方を追うのに要るもの。ID は出さない）
    r."paid_at",
    r."payment_provider",
    r."payment_status",
    r."payment_error_code",

    -- 検索用。ilike 1本で教科書名・買い手・出品者をまとめて引けるようにする。
    concat_ws(' ', l."title", bp."name", sp."name") AS "search_text"
FROM "public"."reservations" r
JOIN "public"."listings" l  ON l."id" = r."listing_id"
JOIN "public"."profiles" bp ON bp."id" = r."buyer_id"
JOIN "public"."profiles" sp ON sp."id" = r."seller_id"
WHERE "public"."is_admin"();
