CREATE INDEX "syllabus_textbooks_course_idx" ON "public"."syllabus_textbooks" USING "btree" ("course_id");

CREATE UNIQUE INDEX "syllabus_textbooks_course_isbn_uidx" ON "public"."syllabus_textbooks" USING "btree" ("course_id", "isbn13");

CREATE INDEX "syllabus_textbooks_isbn13_idx" ON "public"."syllabus_textbooks" USING "btree" ("isbn13");
