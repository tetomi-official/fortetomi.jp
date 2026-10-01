CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "author" "text",
    "publisher" "text",
    "isbn" "text",
    "publication_year" "text",
    "description" "text",
    "category" "text" DEFAULT '教科書'::"text" NOT NULL,
    "condition" "text" NOT NULL,
    "price" integer NOT NULL,
    "location" "text" NOT NULL,
    "image_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "status" "text" DEFAULT '出品中'::"text" NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "faculties" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "listings_price_check" CHECK (("price" >= 0)),
    CONSTRAINT "listings_status_chk" CHECK (("status" = ANY (ARRAY['出品中'::"text", '予約済み'::"text", '完了'::"text"])))
);

COMMENT ON COLUMN "public"."listings"."faculties" IS 'この出品が一覧/検索に表示される学部の集合。既定は出品者の学部。ISBN一致した授業の学部を出品者が追加選択できる（PB-058）。';

ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
