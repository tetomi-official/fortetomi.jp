CREATE INDEX "syllabus_courses_campus_idx" ON "public"."syllabus_courses" USING "btree" ("campus");

CREATE INDEX "syllabus_courses_faculty_idx" ON "public"."syllabus_courses" USING "btree" ("faculty");
