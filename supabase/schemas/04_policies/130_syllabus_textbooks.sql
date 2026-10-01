CREATE POLICY "syllabus textbooks are viewable" ON "public"."syllabus_textbooks" FOR SELECT USING (true);

ALTER TABLE "public"."syllabus_textbooks" ENABLE ROW LEVEL SECURITY;
