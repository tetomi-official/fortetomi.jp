SET local check_function_bodies = off;

CREATE SEQUENCE "public"."syllabus_textbooks_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE "public"."connect_accounts" (
  "user_id"           uuid                     NOT NULL,
  "stripe_account_id" text                     NOT NULL,
  "transfers_enabled" boolean                  NOT NULL DEFAULT false,
  "payouts_enabled"   boolean                  NOT NULL DEFAULT false,
  "requirements_due"  text[]                   NOT NULL DEFAULT '{}'::text[],
  "disabled_reason"   text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "connect_accounts_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "connect_accounts_stripe_account_id_key" UNIQUE (stripe_account_id)
);

ALTER TABLE "public"."connect_accounts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."email_recovery_requests" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"     uuid                     NOT NULL,
  "token_hash"  text                     NOT NULL,
  "expires_at"  timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_recovery_requests_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."email_recovery_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."enrollment_reverifications" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"     uuid                     NOT NULL,
  "token_hash"  text                     NOT NULL,
  "expires_at"  timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "enrollment_reverifications_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."enrollment_reverifications"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."listings" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "title"            text                     NOT NULL,
  "subject"          text                     NOT NULL,
  "author"           text,
  "publisher"        text,
  "isbn"             text,
  "publication_year" text,
  "description"      text,
  "category"         text                     NOT NULL DEFAULT '教科書'::text,
  "condition"        text                     NOT NULL,
  "price"            integer                  NOT NULL,
  "location"         text                     NOT NULL,
  "image_urls"       text[]                   NOT NULL DEFAULT '{}'::text[],
  "seller_id"        uuid                     NOT NULL,
  "status"           text                     NOT NULL DEFAULT '出品中'::text,
  "views"            integer                  NOT NULL DEFAULT 0,
  "likes"            integer                  NOT NULL DEFAULT 0,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "faculties"        text[]                   NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT "listings_pkey" PRIMARY KEY (id),
  CONSTRAINT "listings_price_check" CHECK ((price >= 0)),
  CONSTRAINT "listings_status_chk" CHECK ((status = ANY (ARRAY['出品中'::text, '予約済み'::text, '完了'::text])))
);

ALTER TABLE "public"."listings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."messages" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "reservation_id" uuid                     NOT NULL,
  "sender_id"      uuid                     NOT NULL,
  "body"           text                     NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "messages_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000))),
  CONSTRAINT "messages_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."payment_customers" (
  "user_id"                  uuid                     NOT NULL,
  "payjp_customer_id"        text,
  "created_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "provider"                 text                     NOT NULL DEFAULT 'payjp'::text,
  "stripe_customer_id"       text,
  "stripe_payment_method_id" text,
  CONSTRAINT "payment_customers_any_id_chk" CHECK (((payjp_customer_id IS NOT NULL) OR (stripe_customer_id IS NOT NULL))),
  CONSTRAINT "payment_customers_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "payment_customers_provider_chk" CHECK ((provider = ANY (ARRAY['payjp'::text, 'stripe'::text])))
);

ALTER TABLE "public"."payment_customers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles_private" (
  "id"                         uuid                     NOT NULL,
  "university_email"           text,
  "pending_personal_email"     text,
  "gender"                     text,
  "recovery_email"             text,
  "recovery_email_verified"    boolean                  NOT NULL DEFAULT false,
  "recovery_email_verified_at" timestamp with time zone,
  CONSTRAINT "profiles_private_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles_private"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"                     uuid                     NOT NULL,
  "name"                   text,
  "university"             text,
  "faculty"                text,
  "grade"                  text,
  "enrollment_verified"    boolean                  NOT NULL DEFAULT false,
  "rating"                 numeric                  NOT NULL DEFAULT 5,
  "rating_count"           integer                  NOT NULL DEFAULT 0,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "enrollment_valid_until" timestamp with time zone,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."rate_limits" (
  "bucket"       text                     NOT NULL,
  "count"        integer                  NOT NULL DEFAULT 0,
  "window_start" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "rate_limits_pkey" PRIMARY KEY (bucket)
);

ALTER TABLE "public"."rate_limits"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."recovery_email_verifications" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"     uuid                     NOT NULL,
  "token_hash"  text                     NOT NULL,
  "expires_at"  timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "recovery_email_verifications_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."recovery_email_verifications"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."reservations" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "listing_id"         uuid                     NOT NULL,
  "buyer_id"           uuid                     NOT NULL,
  "seller_id"          uuid                     NOT NULL,
  "price"              integer                  NOT NULL,
  "preferred_date"     text                     NOT NULL,
  "preferred_time"     text                     NOT NULL,
  "preferred_location" text                     NOT NULL,
  "message"            text,
  "status"             text                     NOT NULL DEFAULT '申請中'::text,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "proposed_date"      text,
  "proposed_time"      text,
  "proposed_location"  text,
  "candidate_slots"    jsonb,
  "selected_slot"      smallint,
  "charge_id"          text,
  "paid_at"            timestamp with time zone,
  "payment_nonce_hash" text,
  "payment_provider"   text,
  "payment_intent_id"  text,
  "payment_status"     text,
  "payment_error_code" text,
  CONSTRAINT "reservations_payment_provider_chk" CHECK (((payment_provider IS NULL) OR (payment_provider = ANY (ARRAY['payjp'::text, 'stripe'::text])))),
  CONSTRAINT "reservations_payment_status_chk" CHECK (((payment_status IS NULL) OR (payment_status = ANY (ARRAY['requires_action'::text, 'failed'::text, 'disputed'::text])))),
  CONSTRAINT "reservations_pkey" PRIMARY KEY (id),
  CONSTRAINT "reservations_price_check" CHECK ((price >= 0)),
  CONSTRAINT "reservations_status_chk" CHECK ((status = ANY (ARRAY['申請中'::text, '日程調整中'::text, '承認済み'::text, '完了'::text, 'キャンセル'::text])))
);

ALTER TABLE "public"."reservations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."syllabus_courses" (
  "id"              bigint                   NOT NULL,
  "year"            integer,
  "faculty"         text,
  "campus"          text,
  "course_name"     text,
  "course_code"     text,
  "instructor"      text,
  "instructor_kana" text,
  "term"            text,
  "day_period"      text,
  "year_level"      text,
  "credits"         integer,
  "language"        text,
  "summary"         text,
  "objectives"      text,
  "schedule"        text,
  "grading"         text,
  "references_raw"  text,
  "other_notes"     text,
  "ref_url"         text,
  "textbooks"       jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "raw_items"       jsonb,
  "source_url"      text,
  "scraped_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "syllabus_courses_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."syllabus_courses"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."syllabus_textbooks" (
  "id"         bigint                   NOT NULL DEFAULT nextval('public.syllabus_textbooks_id_seq'::regclass),
  "course_id"  bigint                   NOT NULL,
  "isbn13"     text                     NOT NULL,
  "isbn_raw"   text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "syllabus_textbooks_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."syllabus_textbooks"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "public"."syllabus_textbooks_id_seq" OWNED BY "public"."syllabus_textbooks"."id";

CREATE OR REPLACE FUNCTION public.check_rate_limit (
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_count int;
begin
  insert into public.rate_limits as rl (bucket, count, window_start)
  values (p_bucket, 1, now())
  on conflict (bucket) do update
    set
      -- ウィンドウを過ぎていれば 1 にリセット、以内なら +1。
      count = case
        when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
        else rl.count + 1
      end,
      window_start = case
        when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
        else rl.window_start
      end
  returning rl.count into v_count;

  -- 掃除（放置しない）: 呼び出しのたびに ~1% の確率で、古い期限切れ行をまとめて削除。
  -- bucket はユーザー/IP ごとに増えるため、これでテーブルの無限増殖を止める。
  -- ※ より確実にしたい場合は pg_cron で日次クリーンアップも張れる（任意・下記コメント参照）:
  --     select cron.schedule('rate_limits_cleanup', '0 4 * * *',
  --       $$delete from public.rate_limits where window_start < now() - interval '1 day'$$);
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.count_active_listings()
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select count(*)::int from public.listings l
  where l.status = '出品中' and public.is_enrollment_active(l.seller_id);
$function$;

CREATE OR REPLACE FUNCTION public.enforce_email_domain()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if split_part(lower(new.email), '@', 2) <> 'g.chuo-u.ac.jp' then
    raise exception 'email domain not allowed: signup must use @g.chuo-u.ac.jp';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_newest_listings (
  p_limit integer DEFAULT 4
)
  RETURNS TABLE (
    id          uuid,
    title       text,
    subject     text,
    price       integer,
    image_urls  text[],
    seller_name text,
    created_at  timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select l.id, l.title, l.subject, l.price, l.image_urls, p.name, l.created_at
  from public.listings l
  join public.profiles p on p.id = l.seller_id
  where l.status = '出品中' and public.is_enrollment_active(l.seller_id)
  order by l.created_at desc
  limit greatest(0, least(p_limit, 20));
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  insert into public.profiles (id, name, university, faculty, grade)
  values (
    new.id,
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'university',
    new.raw_user_meta_data ->> 'faculty',
    new.raw_user_meta_data ->> 'grade'
  );
  insert into public.profiles_private (id, university_email, recovery_email, gender)
  values (
    new.id,
    new.email,                                    -- 大学メール（＝ログインID）
    new.raw_user_meta_data ->> 'recovery_email',  -- 復旧用の個人メール
    new.raw_user_meta_data ->> 'gender'
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_enrollment_active (
  uid uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.enrollment_valid_until is not null
      and p.enrollment_valid_until > now()
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_university_email_taken (
  p_email text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1 from public.profiles_private
    where lower(university_email) = lower(p_email)
  );
$function$;

CREATE OR REPLACE FUNCTION public.reset_recovery_email_verified()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  if new.recovery_email is distinct from old.recovery_email then
    new.recovery_email_verified := false;
    new.recovery_email_verified_at := null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_listing_status()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  -- 承認済みになった → 出品を押さえる（まだ出品中のときだけ）。
  if new.status = '承認済み' and old.status is distinct from '承認済み' then
    update public.listings
       set status = '予約済み'
     where id = new.listing_id
       and status = '出品中';

  -- 取りやめた → 他に承認済みが残っていなければ出品中に戻す。
  -- ★ここを「承認済みから外れたら」と書いてはいけない。決済成立（承認済み→完了）でも
  --   発火してしまい、売れた本を一瞬「出品中」に戻してしまう（reconcile.ts が直後に
  --   「完了」を書くので最終的には直るが、そこが失敗すると売り切れた本が再び並ぶ）。
  elsif old.status = '承認済み' and new.status = 'キャンセル' then
    if not exists (
      select 1 from public.reservations r
       where r.listing_id = new.listing_id
         and r.id        <> new.id
         and r.status     = '承認済み'
    ) then
      update public.listings
         set status = '出品中'
       where id = new.listing_id
         and status = '予約済み';
    end if;
  end if;

  return null; -- AFTER トリガーなので戻り値は使われない
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_reservation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  -- seller_id / price が実在する listing と一致することだけを担保する（なりすまし・価格詐称の防止）。
  -- 「出品中のものにしか申請できない」はアプリ層（購入ボタンの出し分け）で担保する。
  -- ここで status='出品中' を強制すると、承認済み予約（listing が予約済み/完了へ遷移後）を
  -- 表現できず、seed や正常な状態遷移と両立しないため含めない。
  if not exists (
    select 1 from public.listings l
    where l.id        = new.listing_id
      and l.seller_id = new.seller_id
      and l.price     = new.price
  ) then
    raise exception 'reservation does not match its listing (listing_id/seller_id/price mismatch)';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_reservation_update()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  actor text;
begin
  -- 日程まわりの列は出品者しか書けない（migration 8 から引き継ぎ）。
  if (new.proposed_date     is distinct from old.proposed_date
   or new.proposed_time     is distinct from old.proposed_time
   or new.proposed_location is distinct from old.proposed_location
   or new.selected_slot     is distinct from old.selected_slot)
   and auth.uid() <> old.seller_id then
    raise exception 'only the seller can propose a reschedule or select a candidate slot';
  end if;

  -- ここから下はステータスが動くときだけ。決済列だけを書き換える更新は素通しする。
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- キャンセルになったら、発行済みのQRの合言葉を無効にする。
  if new.status = 'キャンセル' then
    new.payment_nonce_hash := null;
  end if;

  -- service_role（サーバー処理）は遷移チェックの対象外。
  -- 決済成立の記録と返金の巻き戻しはここを通る。
  if auth.uid() is null then
    return new;
  end if;

  if auth.uid() = old.seller_id then
    actor := 'seller';
  elsif auth.uid() = old.buyer_id then
    actor := 'buyer';
  else
    -- RLS で当事者以外はそもそも更新できないが、念のため。
    raise exception 'only the buyer or the seller can change a reservation status';
  end if;

  if not (
       (old.status = '申請中'     and new.status = '承認済み'   and actor = 'seller')
    or (old.status = '申請中'     and new.status = '日程調整中' and actor = 'seller')
    or (old.status = '申請中'     and new.status = 'キャンセル')
    or (old.status = '日程調整中' and new.status = '承認済み'   and actor = 'buyer')
    or (old.status = '日程調整中' and new.status = 'キャンセル')
    or (old.status = '承認済み'   and new.status = 'キャンセル')
  ) then
    raise exception 'invalid reservation status transition: % -> % (actor=%)',
      old.status, new.status, actor;
  end if;

  return new;
end;
$function$;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."connect_accounts"
  ADD CONSTRAINT "connect_accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."email_recovery_requests"
  ADD CONSTRAINT "email_recovery_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."enrollment_reverifications"
  ADD CONSTRAINT "enrollment_reverifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."listings"
  ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."messages"
  ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."payment_customers"
  ADD CONSTRAINT "payment_customers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles_private"
  ADD CONSTRAINT "profiles_private_id_fkey" FOREIGN KEY (id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."recovery_email_verifications"
  ADD CONSTRAINT "recovery_email_verifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."reservations"
  ADD CONSTRAINT "reservations_buyer_id_fkey" FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."reservations"
  ADD CONSTRAINT "reservations_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;

ALTER TABLE "public"."messages"
  ADD CONSTRAINT "messages_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE CASCADE;

ALTER TABLE "public"."reservations"
  ADD CONSTRAINT "reservations_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."syllabus_textbooks"
  ADD CONSTRAINT "syllabus_textbooks_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.syllabus_courses(id) ON DELETE CASCADE;

CREATE INDEX email_recovery_token_idx ON public.email_recovery_requests USING btree (token_hash);

CREATE INDEX email_recovery_user_idx ON public.email_recovery_requests USING btree (user_id, created_at DESC);

CREATE INDEX enrollment_reverif_token_idx ON public.enrollment_reverifications USING btree (token_hash);

CREATE INDEX enrollment_reverif_user_idx ON public.enrollment_reverifications USING btree (user_id, created_at DESC);

CREATE INDEX listings_faculties_gin ON public.listings USING gin (faculties);

CREATE INDEX listings_seller_id_idx ON public.listings USING btree (seller_id);

CREATE INDEX listings_status_created_idx ON public.listings USING btree (status, created_at DESC);

CREATE INDEX messages_reservation_idx ON public.messages USING btree (reservation_id, created_at);

CREATE UNIQUE INDEX payment_customers_stripe_customer_uniq ON public.payment_customers USING btree (stripe_customer_id)
  WHERE (stripe_customer_id IS NOT NULL);

CREATE UNIQUE INDEX profiles_private_university_email_uniq ON public.profiles_private USING btree (lower(university_email))
  WHERE (university_email IS NOT NULL);

CREATE INDEX recovery_email_verif_token_idx ON public.recovery_email_verifications USING btree (token_hash);

CREATE INDEX recovery_email_verif_user_idx ON public.recovery_email_verifications USING btree (user_id, created_at DESC);

CREATE INDEX reservations_buyer_idx ON public.reservations USING btree (buyer_id, created_at DESC);

CREATE INDEX reservations_charge_id_idx ON public.reservations USING btree (charge_id);

CREATE INDEX reservations_listing_idx ON public.reservations USING btree (listing_id);

CREATE UNIQUE INDEX reservations_payment_intent_uniq ON public.reservations USING btree (payment_intent_id)
  WHERE (payment_intent_id IS NOT NULL);

CREATE INDEX reservations_seller_idx ON public.reservations USING btree (seller_id, created_at DESC);

CREATE INDEX syllabus_courses_campus_idx ON public.syllabus_courses USING btree (campus);

CREATE INDEX syllabus_courses_faculty_idx ON public.syllabus_courses USING btree (faculty);

CREATE INDEX syllabus_textbooks_course_idx ON public.syllabus_textbooks USING btree (course_id);

CREATE UNIQUE INDEX syllabus_textbooks_course_isbn_uidx ON public.syllabus_textbooks USING btree (course_id, isbn13);

CREATE INDEX syllabus_textbooks_isbn13_idx ON public.syllabus_textbooks USING btree (isbn13);

CREATE TRIGGER enforce_email_domain_before_insert
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_email_domain();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER trg_reset_recovery_email_verified
  BEFORE UPDATE ON public.profiles_private
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_recovery_email_verified();

CREATE TRIGGER sync_listing_status_after_update
  AFTER UPDATE OF status ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_listing_status();

CREATE TRIGGER validate_reservation_before_insert
  BEFORE INSERT ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_reservation();

CREATE TRIGGER validate_reservation_before_update
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_reservation_update();

CREATE POLICY "own connect account is viewable" ON "public"."connect_accounts"
  FOR SELECT
  TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "listings are viewable by everyone" ON "public"."listings"
  FOR SELECT
  TO PUBLIC
  USING ((public.is_enrollment_active(seller_id) OR (( SELECT auth.uid() AS uid) = seller_id)));

CREATE POLICY "users can delete own listings" ON "public"."listings"
  FOR DELETE
  TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = seller_id));

CREATE POLICY "users can insert own listings" ON "public"."listings"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid) = seller_id) AND public.is_enrollment_active(( SELECT auth.uid() AS uid))));

CREATE POLICY "users can update own listings" ON "public"."listings"
  FOR UPDATE
  TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = seller_id));

CREATE POLICY "messages viewable by reservation participants" ON "public"."messages"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.reservations r
  WHERE ((r.id = messages.reservation_id) AND ((auth.uid() = r.buyer_id) OR (auth.uid() = r.seller_id))))));

CREATE POLICY "participants can insert own messages" ON "public"."messages"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.reservations r
  WHERE ((r.id = messages.reservation_id) AND ((auth.uid() = r.buyer_id) OR (auth.uid() = r.seller_id)))))));

CREATE POLICY "own payment customer is viewable" ON "public"."payment_customers"
  FOR SELECT
  TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "profiles viewable by authenticated" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "users can insert own profile" ON "public"."profiles"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "users can update own profile" ON "public"."profiles"
  FOR UPDATE
  TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "own private insert" ON "public"."profiles_private"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "own private read" ON "public"."profiles_private"
  FOR SELECT
  TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "own private update" ON "public"."profiles_private"
  FOR UPDATE
  TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "buyer or seller can update reservation" ON "public"."reservations"
  FOR UPDATE
  TO PUBLIC
  USING (((( SELECT auth.uid() AS uid) = buyer_id) OR (( SELECT auth.uid() AS uid) = seller_id)))
  WITH CHECK (((( SELECT auth.uid() AS uid) = buyer_id) OR (( SELECT auth.uid() AS uid) = seller_id)));

CREATE POLICY "buyers can insert own reservations" ON "public"."reservations"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid) = buyer_id) AND public.is_enrollment_active(( SELECT auth.uid() AS uid))));

CREATE POLICY "reservations viewable by buyer or seller" ON "public"."reservations"
  FOR SELECT
  TO PUBLIC
  USING (((( SELECT auth.uid() AS uid) = buyer_id) OR (( SELECT auth.uid() AS uid) = seller_id)));

CREATE POLICY "syllabus courses are viewable" ON "public"."syllabus_courses"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "syllabus textbooks are viewable" ON "public"."syllabus_textbooks"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "listing images authenticated upload" ON "storage"."objects"
  FOR INSERT
  TO PUBLIC
  WITH
    CHECK
    (((bucket_id = 'listing-images'::text) AND (auth.role() = 'authenticated'::text) AND public.is_enrollment_active(auth.uid()) AND ((storage.foldername(name))[1] =
    (auth.uid())::text)));

CREATE POLICY "listing images owner delete" ON "storage"."objects"
  FOR DELETE
  TO PUBLIC
  USING (((bucket_id = 'listing-images'::text) AND (OWNER = auth.uid())));

CREATE POLICY "listing images owner update" ON "storage"."objects"
  FOR UPDATE
  TO PUBLIC
  USING (((bucket_id = 'listing-images'::text) AND (OWNER = auth.uid())));

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."messages";

COMMENT ON COLUMN "public"."connect_accounts"."disabled_reason" IS '送金ケイパビリティが有効でない理由（v2 の capability status_details の code）。';

COMMENT ON COLUMN "public"."connect_accounts"."payouts_enabled" IS '銀行口座への入金を受けられるか。v2 の ...capabilities.stripe_balance.payouts.status === active。';

COMMENT ON COLUMN "public"."connect_accounts"."requirements_due" IS 'Stripe が出品者本人の入力を待っている項目（v2 requirements.entries のうち awaiting_action_from=user の description）。空なら入力待ちなし。';

COMMENT ON COLUMN "public"."connect_accounts"."stripe_account_id" IS 'Stripe Connect の連結アカウント(acct_)。authenticated には grant しない＝ブラウザからは読めない。';

COMMENT ON COLUMN "public"."connect_accounts"."transfers_enabled" IS '送金を受け取れるか。v2 の configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === active。 受け渡し課金（destination charge）の可否ゲートはこの列で判定する。';

COMMENT ON COLUMN "public"."listings"."faculties" IS 'この出品が一覧/検索に表示される学部の集合。既定は出品者の学部。ISBN一致した授業の学部を出品者が追加選択できる（PB-058）。';

COMMENT ON COLUMN "public"."payment_customers"."provider" IS '最後にカード登録した決済会社（payjp / stripe）。記録用であって、課金可否の判定には使わない。';

COMMENT ON COLUMN "public"."payment_customers"."stripe_customer_id" IS 'Stripe Customer(cus_)。service_role のみ書き込み。';

COMMENT ON COLUMN "public"."payment_customers"."stripe_payment_method_id" IS 'Stripe PaymentMethod(pm_)。受け渡し時のオフセッション課金で使う保存済みカード。';

COMMENT ON COLUMN "public"."reservations"."charge_id" IS '支払いID。PAY.jp は Charge ID、Stripe は PaymentIntent.latest_charge(ch_)。pi_ は入れない。';

COMMENT ON COLUMN "public"."reservations"."paid_at" IS '決済完了時刻（service_role が記録）';

COMMENT ON COLUMN "public"."reservations"."payment_error_code" IS '拒否コード（card_declined 等）。運営の調査用。';

COMMENT ON COLUMN "public"."reservations"."payment_intent_id" IS 'Stripe PaymentIntent(pi_)。PAY.jp では null。';

COMMENT ON COLUMN "public"."reservations"."payment_nonce_hash" IS '受け渡しQRワンタイムトークンの SHA-256。買い手がQR表示時に発行、決済成功で null 化。';

COMMENT ON COLUMN "public"."reservations"."payment_provider" IS '決済に使った会社（payjp / stripe）。';

COMMENT ON COLUMN "public"."reservations"."payment_status" IS '課金が成立しなかったときの状態。requires_action=本人認証待ち / failed=拒否 / disputed=チャージバック。成立時は null。';

COMMENT ON COLUMN "public"."syllabus_courses"."id" IS 'シラバスサイト /syllabus/detail/?id=N の数値ID（upsert の自然キー）';

COMMENT ON COLUMN "public"."syllabus_courses"."textbooks" IS 'references_raw から抽出した ISBN 群 [{isbn13, isbn_raw}]';

COMMENT ON FUNCTION "public"."check_rate_limit"(text, integer, integer) IS 'bucket を原子的にインクリメントし、ウィンドウ内カウントが上限以下なら true を返す。lib/rate-limit.ts から呼ぶ。';

COMMENT ON FUNCTION "public"."sync_listing_status"() IS '予約が承認済みになったら出品を予約済みに、外れたら出品中に戻す。完了は reconcile.ts の担当。';

COMMENT ON TABLE "public"."connect_accounts" IS '出品者の Stripe 連結アカウント(acct_)と受取可否。書き込みは service_role のみ（他人の出品の売上を横取りされないため）。';

COMMENT ON TABLE "public"."payment_customers" IS '買い手の PAY.jp Customer(cus_) 保存先。書き込みは service_role のみ（他人のカードへの課金を防ぐ）。';

COMMENT ON TABLE "public"."rate_limits" IS 'レート制限の原子的カウンタ。service_role 専用（check_rate_limit 経由でのみ更新）。';

COMMENT ON TABLE "public"."syllabus_courses" IS '中央大学シラバスDBのスクレイピング結果（1科目1行）。書き込みは service_role のみ。PB-056。';

COMMENT ON TABLE "public"."syllabus_textbooks" IS 'ISBN→科目 の逆引き（PB-058 照合用）。scrape-syllabus.mjs が course ごとに再構築する。';

-- ===== ここから下は supabase db diff の生成物を差し替えた部分 =====
-- 理由1：diff は「何も無い状態」を前提に足し算だけを書くが、実際は
--        テーブル・関数を作った瞬間に anon / authenticated へ権限が自動で付く。
-- 理由2：diff の出力は順番が正しくなく、列ごとの権限を付けたあとに
--        テーブル全体の権限をはがしていて、列権限が消えてしまう。
-- そこで、本番と一致することを確認済みの supabase/schemas/09_grants/ を
-- そのまま並べている。ここを直すときは schemas 側を直して貼り直すこと。


-- ---- supabase/schemas/09_grants/000_schema.sql ----
GRANT USAGE ON SCHEMA "public" TO "postgres";

GRANT USAGE ON SCHEMA "public" TO "anon";

GRANT USAGE ON SCHEMA "public" TO "authenticated";

GRANT USAGE ON SCHEMA "public" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- ---- supabase/schemas/09_grants/001_revoke_defaults.sql ----
-- 既定で付いてしまう権限を、いったん全部はがす。
--
-- Supabase は public に新しいテーブル・関数を作ると、anon と authenticated に
-- 自動で全権限を付ける（クラウドもローカルも同じ）。このあとのファイルは
-- 「本番で実際に付いている権限」を足し直すだけなので、先にここで白紙に戻さないと
-- 余計な権限が残る。docs の SQL が revoke all から始めていたのと同じ考え方。

REVOKE ALL ON TABLE "public"."profiles" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."profiles_private" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."listings" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."reservations" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."messages" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."payment_customers" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."connect_accounts" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."email_recovery_requests" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."enrollment_reverifications" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."recovery_email_verifications" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."rate_limits" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."syllabus_courses" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."syllabus_textbooks" FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_enrollment_active"("uid" "uuid") FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."count_active_listings"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."enforce_email_domain"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."get_newest_listings"("p_limit" integer) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."is_university_email_taken"("p_email" "text") FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."reset_recovery_email_verified"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."sync_listing_status"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."validate_reservation"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."validate_reservation_update"() FROM PUBLIC, "anon", "authenticated";

-- ---- supabase/schemas/09_grants/010_profiles.sql ----
GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";

GRANT ALL ON TABLE "public"."profiles" TO "service_role";

GRANT UPDATE("name") ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE("university") ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE("faculty") ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE("grade") ON TABLE "public"."profiles" TO "authenticated";

-- ---- supabase/schemas/09_grants/020_profiles_private.sql ----
GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."profiles_private" TO "authenticated";

GRANT ALL ON TABLE "public"."profiles_private" TO "service_role";

GRANT UPDATE("gender") ON TABLE "public"."profiles_private" TO "authenticated";

GRANT UPDATE("recovery_email") ON TABLE "public"."profiles_private" TO "authenticated";

-- ---- supabase/schemas/09_grants/030_listings.sql ----
GRANT SELECT,MAINTAIN ON TABLE "public"."listings" TO "anon";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."listings" TO "authenticated";

GRANT ALL ON TABLE "public"."listings" TO "service_role";

-- ---- supabase/schemas/09_grants/040_reservations.sql ----
GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."reservations" TO "authenticated";

GRANT ALL ON TABLE "public"."reservations" TO "service_role";

GRANT UPDATE("status") ON TABLE "public"."reservations" TO "authenticated";

GRANT UPDATE("proposed_date") ON TABLE "public"."reservations" TO "authenticated";

GRANT UPDATE("proposed_time") ON TABLE "public"."reservations" TO "authenticated";

GRANT UPDATE("proposed_location") ON TABLE "public"."reservations" TO "authenticated";

GRANT UPDATE("selected_slot") ON TABLE "public"."reservations" TO "authenticated";

-- ---- supabase/schemas/09_grants/050_messages.sql ----
GRANT ALL ON TABLE "public"."messages" TO "service_role";

GRANT SELECT,INSERT ON TABLE "public"."messages" TO "authenticated";

-- ---- supabase/schemas/09_grants/060_payment_customers.sql ----
GRANT ALL ON TABLE "public"."payment_customers" TO "service_role";

GRANT SELECT("user_id") ON TABLE "public"."payment_customers" TO "authenticated";

GRANT SELECT("created_at") ON TABLE "public"."payment_customers" TO "authenticated";

GRANT SELECT("updated_at") ON TABLE "public"."payment_customers" TO "authenticated";

GRANT SELECT("provider") ON TABLE "public"."payment_customers" TO "authenticated";

-- ---- supabase/schemas/09_grants/070_connect_accounts.sql ----
GRANT ALL ON TABLE "public"."connect_accounts" TO "service_role";

GRANT SELECT("user_id") ON TABLE "public"."connect_accounts" TO "authenticated";

GRANT SELECT("transfers_enabled") ON TABLE "public"."connect_accounts" TO "authenticated";

GRANT SELECT("payouts_enabled") ON TABLE "public"."connect_accounts" TO "authenticated";

GRANT SELECT("requirements_due") ON TABLE "public"."connect_accounts" TO "authenticated";

GRANT SELECT("disabled_reason") ON TABLE "public"."connect_accounts" TO "authenticated";

GRANT SELECT("created_at") ON TABLE "public"."connect_accounts" TO "authenticated";

GRANT SELECT("updated_at") ON TABLE "public"."connect_accounts" TO "authenticated";

-- ---- supabase/schemas/09_grants/080_email_recovery_requests.sql ----
GRANT ALL ON TABLE "public"."email_recovery_requests" TO "service_role";

-- ---- supabase/schemas/09_grants/090_enrollment_reverifications.sql ----
GRANT ALL ON TABLE "public"."enrollment_reverifications" TO "service_role";

-- ---- supabase/schemas/09_grants/100_recovery_email_verifications.sql ----
GRANT ALL ON TABLE "public"."recovery_email_verifications" TO "service_role";

-- ---- supabase/schemas/09_grants/110_rate_limits.sql ----
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";

-- ---- supabase/schemas/09_grants/120_syllabus_courses.sql ----
GRANT ALL ON TABLE "public"."syllabus_courses" TO "service_role";

GRANT SELECT ON TABLE "public"."syllabus_courses" TO "authenticated";

-- ---- supabase/schemas/09_grants/130_syllabus_textbooks.sql ----
GRANT ALL ON TABLE "public"."syllabus_textbooks" TO "service_role";

GRANT SELECT ON TABLE "public"."syllabus_textbooks" TO "authenticated";

-- ---- supabase/schemas/09_grants/200_functions.sql ----
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."count_active_listings"() TO "anon";

GRANT ALL ON FUNCTION "public"."count_active_listings"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."count_active_listings"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_email_domain"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."enforce_email_domain"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_newest_listings"("p_limit" integer) TO "anon";

GRANT ALL ON FUNCTION "public"."get_newest_listings"("p_limit" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_newest_listings"("p_limit" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

-- ここは本番の現状と意図的に違う。本番では anon にも実行権が付いてしまっており
-- （docs/supabase-migration-2 の revoke が効いていない）、ログインしていない人でも
-- 「この利用者IDは在籍中か」を問い合わせられる状態。あるべき姿はこちら。
-- 本番への反映はタスク10。pgTAP で anon が呼べないことを見張る。
REVOKE ALL ON FUNCTION "public"."is_enrollment_active"("uid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_enrollment_active"("uid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_enrollment_active"("uid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_university_email_taken"("p_email" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."is_university_email_taken"("p_email" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_university_email_taken"("p_email" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."reset_recovery_email_verified"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."reset_recovery_email_verified"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."sync_listing_status"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."sync_listing_status"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."validate_reservation"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."validate_reservation"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."validate_reservation_update"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."validate_reservation_update"() TO "service_role";

-- ---- supabase/schemas/09_grants/900_publication.sql ----
do $$
begin
  alter publication "supabase_realtime" add table only "public"."messages";
exception
  when duplicate_object then null;   -- 既に載っている
  when undefined_object then null;   -- publication が無い構成
end $$;

-- バケットは storage.buckets の「行」なので diff に出ない（schemas/08_storage/010_buckets.sql）。
insert into "storage"."buckets" ("id", "name", "public")
values ('listing-images', 'listing-images', true)
on conflict ("id") do nothing;
