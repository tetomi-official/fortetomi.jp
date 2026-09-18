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
# 関数も依存順（他から呼ばれるものを先に）
FN_FIRST = ["is_enrollment_active"]
def fname(fn):
    return f"{(FN_FIRST.index(fn)+1)*10:03d}_{fn}" if fn in FN_FIRST else f"100_{fn}"

def name(t):
    return f"{(ORDER.index(t)+1)*10:03d}_{t}" if t in ORDER else t
text = open(SRC).read()

# --- ステートメント単位に分割 ---
# 関数本文の囲みは $$ だけでなく $_$ のような名前付きもある。開いた印と同じ印で閉じる。
stmts, buf, tag = [], [], None
for line in text.splitlines():
    for m in re.finditer(r"\$[A-Za-z_0-9]*\$", line):
        tok = m.group(0)
        if tag is None:
            tag = tok
        elif tok == tag:
            tag = None
    buf.append(line)
    if tag is None and line.rstrip().endswith(";"):
        st = "\n".join(buf).strip()
        if st:
            stmts.append(st)
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
         or tbl(one, r'CREATE (?:OR REPLACE )?TRIGGER \S+ .* ON "public"\."(\w+)"')
         or tbl(one, r'CREATE SEQUENCE IF NOT EXISTS "public"\."(\w+)_id_seq"')
         or tbl(one, r'ALTER SEQUENCE "public"\."(\w+)_id_seq" OWNED BY'))
    if t in SKIP_TABLES:                                             continue
    if (one.startswith(("CREATE TABLE", "COMMENT ON TABLE", "COMMENT ON COLUMN",
                        "CREATE SEQUENCE", "ALTER SEQUENCE"))
            or "ADD CONSTRAINT" in one or "SET DEFAULT" in one):
        if "tables" in SECTIONS: add(f"02_tables/{name(t)}.sql", s)
    elif one.startswith("CREATE OR REPLACE FUNCTION") or one.startswith("COMMENT ON FUNCTION"):
        fn = re.search(r'"public"\."(\w+)"', one).group(1)
        if "functions" in SECTIONS: add(f"03_functions/{fname(fn)}.sql", s)
    elif one.startswith("CREATE POLICY") or "ENABLE ROW LEVEL SECURITY" in one:
        pt = tbl(one, r'ON "public"\."(\w+)"') or tbl(one, r'ALTER TABLE "public"\."(\w+)"')
        if pt in SKIP_TABLES: continue
        if "policies" in SECTIONS: add(f"04_policies/{name(pt)}.sql", s)
    elif one.startswith("CREATE OR REPLACE TRIGGER") or one.startswith("CREATE TRIGGER"):
        if "triggers" in SECTIONS: add(f"06_triggers/{name(t)}.sql", s)
    elif re.match(r'^CREATE (UNIQUE )?INDEX', one):
        if "indexes" in SECTIONS: add(f"07_indexes/{name(t)}.sql", s)

for path, chunks in sorted(files.items()):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write("\n\n".join(chunks) + "\n")
    print(f"{path}  ({len(chunks)}文)")
