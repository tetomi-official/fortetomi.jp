"""本番ダンプを supabase/schemas/ の責務別ファイルに切り分ける（移行時の一度きりの道具）。"""
import re, sys, os, collections

SRC, OUT = sys.argv[1], sys.argv[2]
SECTIONS = set(sys.argv[3].split(","))
SKIP_TABLES = {"books", "users"}          # 0行の試作テーブル。持ち込まない

# 依存順（親を先に作る）。ファイル名の番号になる。
ORDER = ["profiles", "profiles_private", "listings", "reservations", "messages",
         "payment_customers", "connect_accounts", "email_recovery_requests",
         "enrollment_reverifications", "recovery_email_verifications",
         "rate_limits", "syllabus_courses", "syllabus_textbooks"]
def name(t):
    return f"{(ORDER.index(t)+1)*10:03d}_{t}" if t in ORDER else t
text = open(SRC).read()

# --- ステートメント単位に分割（$$ ... $$ の中のセミコロンは無視する）---
stmts, buf, in_dollar = [], [], False
for line in text.splitlines():
    if line.count("$$") % 2 == 1:
        in_dollar = not in_dollar
    buf.append(line)
    if not in_dollar and line.rstrip().endswith(";"):
        s = "\n".join(buf).strip()
        if s:
            stmts.append(s)
        buf = []

files = collections.defaultdict(list)
def add(path, stmt):
    files[path].append(stmt)

def tbl(stmt, pat):
    m = re.search(pat, stmt)
    return m.group(1) if m else None

for s in stmts:
    one = " ".join(s.split())
    if re.match(r'^(SET|SELECT pg_catalog|RESET)', one):            continue
    if "OWNER TO" in one:                                            continue   # 既定で postgres 所有になる
    if one.startswith("COMMENT ON SCHEMA"):                          continue
    if one.startswith("CREATE EXTENSION"):
        if "setup" in SECTIONS: add("00_setup/00_extensions.sql", s)
        continue
    t = (tbl(one, r'CREATE TABLE IF NOT EXISTS "public"\."(\w+)"')
         or tbl(one, r'COMMENT ON (?:TABLE|COLUMN) "public"\."(\w+)"')
         or tbl(one, r'ALTER TABLE ONLY "public"\."(\w+)"')
         or tbl(one, r'ALTER TABLE "public"\."(\w+)"')
         or tbl(one, r'CREATE (?:UNIQUE )?INDEX \S+ ON "public"\."(\w+)"')
         or tbl(one, r'CREATE SEQUENCE IF NOT EXISTS "public"\."(\w+)_id_seq"')
         or tbl(one, r'ALTER SEQUENCE "public"\."(\w+)_id_seq" OWNED BY'))
    if t in SKIP_TABLES:                                             continue
    if (one.startswith(("CREATE TABLE", "COMMENT ON TABLE", "COMMENT ON COLUMN",
                        "CREATE SEQUENCE", "ALTER SEQUENCE"))
            or "ADD CONSTRAINT" in one or "SET DEFAULT" in one):
        if "tables" in SECTIONS: add(f"02_tables/{name(t)}.sql", s)
    elif re.match(r'^CREATE (UNIQUE )?INDEX', one):
        if "indexes" in SECTIONS: add(f"07_indexes/{name(t)}.sql", s)

for path, chunks in sorted(files.items()):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write("\n\n".join(chunks) + "\n")
    print(f"{path}  ({len(chunks)}文)")
