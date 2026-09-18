CREATE POLICY "syllabus courses are viewable" ON "public"."syllabus_courses" FOR SELECT USING (true);

ALTER TABLE "public"."syllabus_courses" ENABLE ROW LEVEL SECURITY;
