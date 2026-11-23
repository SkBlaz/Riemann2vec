"""Serve the local explorer and Lean's published source navigation metadata."""

import argparse
from contextlib import closing
from functools import partial
import gzip
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import platform
import re
import sqlite3
import subprocess
import tarfile
import tempfile
import threading
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "docs"
CACHE = ROOT / ".work" / "reader"
REPO = "leanprover-community/riemann-hypothesis"
BASE = "https://rh-cache.taucetiproject.org"
BASELINE = "e50d09817ad81469f737e8f637561e6ccf86c670"
MANIFEST_SHA = "292caa386a620d935cfc736b56fcceaab9fe7073086693b62e899c1ee4725f04"
LEANTAR_ASSET = "leantar-v0.1.21-x86_64-unknown-linux-musl"
LEANTAR_EXEC_SHA = "6d44150038a7c65db7b44e0514b10339e222293008bb4e9328cec3d15463f624"
LEANTAR_SHA = "03cfda294d68bf10ac16c26692a108f3d88082d3d692d5a38df29d5128c7576b"
MATHLIB_PIN = "0df444a360eaa60ab8c11dca51a86af692955474"
MODULE_NAME = re.compile(r"^Mathlib(?:[.][\w'′]+)*$", re.UNICODE)


def checked_download(url, sha, limit):
    with urlopen(Request(url, headers={"User-Agent": "Riemann2Vec/1.0"}), timeout=8) as response:
        content = response.read(limit + 1)
    if len(content) > limit or hashlib.sha256(content).hexdigest() != sha:
        raise ValueError("Published cache object failed its size or digest check.")
    return content


def install_cache_files(leantar):
    CACHE.mkdir(parents=True, exist_ok=True)
    manifest = CACHE / "manifest.jsonl.gz"
    if not manifest.exists():
        manifest.write_bytes(checked_download(
            f"{BASE}/bootstrap/{BASELINE}/modules.jsonl.gz", MANIFEST_SHA, 40_000_000))
    if hashlib.sha256(manifest.read_bytes()).hexdigest() != MANIFEST_SHA:
        raise ValueError("Invalid community cache manifest.")
    tool = leantar or CACHE / "leantar"
    if not leantar and (not tool.exists() or hashlib.sha256(tool.read_bytes()).hexdigest() != LEANTAR_EXEC_SHA):
        if platform.system() != "Linux" or platform.machine() != "x86_64":
            raise ValueError("Install leantar and pass its path with --leantar.")
        archive = checked_download(
            f"https://github.com/digama0/leangz/releases/download/v0.1.21/{LEANTAR_ASSET}.tar.gz",
            LEANTAR_SHA, 8_000_000)
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            executable = tar.extractfile(f"{LEANTAR_ASSET}/leantar")
            tool.write_bytes(executable.read())
        tool.chmod(0o755)
    return manifest, tool.resolve(strict=True)


def decode_paths():
    previous = ""
    paths = []
    for prefix, suffix in json.loads((DIST / "data/paths.json").read_text()):
        previous = previous.encode("utf-16-le")[:2 * prefix].decode("utf-16-le") + suffix
        paths.append(previous)
    return paths


def record_name(module, line, name):
    return (module, line, name, name.split(".")[-1], name.casefold(),
            name.split(".")[-1].casefold())


class Reader:
    def __init__(self, mathlib, leantar=None, lean=None):
        manifest, self.tool = install_cache_files(leantar)
        self.mathlib = mathlib
        self.lean = lean
        self.objects = CACHE / "oleans"
        if lean:
            self.objects.mkdir(exist_ok=True)
        self.paths = decode_paths()
        self.modules = [path.removeprefix("src/")[:-5].replace("/", ".") for path in self.paths]
        self.by_name = {module: index for index, module in enumerate(self.modules)}
        with gzip.open(manifest, "rt") as file:
            header = json.loads(next(file))
            if header["source_tree"] != "24df20b62d9976ccd20da819bc20b16f808f0fdd":
                raise ValueError("Unexpected source revision in semantic cache manifest.")
            self.records = {name: (trace, artifact, sha)
                            for name, trace, artifact, sha in map(json.loads, file)}
        self.db = CACHE / "declarations-v1.sqlite3"
        self.locks = [threading.Lock() for _ in range(29)]
        if not self.db.exists():
            self.build_index()
        if lean:
            with closing(self.connect()) as db, db:
                db.execute("CREATE TABLE IF NOT EXISTS kernel (module INTEGER, name TEXT, payload TEXT, PRIMARY KEY(module, name))")

    def connect(self):
        return sqlite3.connect(self.db, timeout=12)

    def build_index(self):
        with tempfile.NamedTemporaryFile(prefix="declarations-", suffix=".tmp", dir=CACHE, delete=False) as file:
            staging = Path(file.name)
        batch = json.loads((DIST / "data/meta.json").read_text())["moduleBatch"]
        try:
            with closing(sqlite3.connect(staging)) as db, db:
                db.executescript("""
                    CREATE TABLE declarations (module INTEGER, line INTEGER, name TEXT,
                      leaf TEXT, folded TEXT COLLATE NOCASE, short TEXT COLLATE NOCASE,
                      PRIMARY KEY(module, line, name));
                    CREATE TABLE metadata (module INTEGER PRIMARY KEY, payload TEXT);
                    CREATE TABLE uses (target_module TEXT, name TEXT, file INTEGER, line INTEGER, parent TEXT,
                      PRIMARY KEY(target_module, name, file, line, parent));
                """)
                ingest = "INSERT OR IGNORE INTO declarations VALUES (?, ?, ?, ?, ?, ?)"
                for start in range(0, len(self.paths), batch):
                    file = DIST / "data" / "modules" / f"{start // batch}.json"
                    chunk = json.loads(file.read_text(encoding="utf-8"))
                    db.executemany(ingest, (record_name(start + offset, line, name)
                                           for offset, (_, _, decls) in enumerate(chunk)
                                           for name, line in decls))
                db.executescript("""
                    CREATE INDEX declarations_folded ON declarations(folded);
                    CREATE INDEX declarations_short ON declarations(short);
                """)
            os.replace(staging, self.db)
            with closing(self.connect()) as db:
                db.execute("PRAGMA journal_mode=WAL")
        finally:
            staging.unlink(missing_ok=True)

    def extract(self, index):
        module = self.modules[index]
        trace, artifact, sha = self.records[module]
        if not re.fullmatch(r"[a-f\d]{16}\.ltar", artifact):
            raise ValueError("Invalid module artifact name.")
        body = checked_download(f"{BASE}/artifacts/{REPO}/{artifact[:-5]}.art", sha, 128_000_000)
        with tempfile.TemporaryDirectory(prefix="module-", dir=CACHE) as temp:
            path = Path(temp) / artifact
            path.write_bytes(body)
            spec = [{"file": str(path), "hash": trace, "base": [temp] * 4}]
            subprocess.run([str(self.tool), "--jobs", "1", "-x", "-j", "-"],
                           input=json.dumps(spec), text=True, timeout=20, check=True,
                           capture_output=True, cwd=temp)
            files = list(Path(temp).rglob("*.ilean"))
            if len(files) != 1:
                raise ValueError("Expected one .ilean file in a module archive.")
            lean = json.loads(files[0].read_text(encoding="utf-8"))
            if lean["module"] != module or lean["version"] != 5:
                raise ValueError("Unexpected Lean metadata module or version.")
            if self.lean:
                artifact = files[0].with_suffix(".olean")
                if artifact.is_file():
                    os.replace(artifact, self.objects / f"{index}.olean")
        return lean

    def get(self, index):
        module = self.modules[index]
        with self.locks[index % len(self.locks)], closing(self.connect()) as db:
            found = db.execute("SELECT payload FROM metadata WHERE module=?", (index,)).fetchone()
            if found:
                return found[0]
            if module not in self.records:
                raise ValueError("Source module is missing from the community cache.")
            lean = self.extract(index)
            decls, refs, reverse = lean["decls"], [], []
            for raw, positions in lean["references"].items():
                target = json.loads(raw).get("c")
                if not target:
                    continue
                target_module, name = target["m"], target["n"]
                for sl, sc, el, ec, *parent in positions.get("usages", []):
                    enclosing = (parent[0] if parent else None) or ""
                    refs.append([sl, sc, el, ec, enclosing, target_module, name])
                    reverse.append((target_module, name, index, sl + 1, enclosing))

            payload = json.dumps({"module": module, "decls": decls, "refs": refs}, ensure_ascii=False)
            with db:
                db.executemany("DELETE FROM declarations WHERE module=? AND line=?",
                               {(index, ranges[4] + 1) for ranges in decls.values()})
                db.executemany("INSERT OR IGNORE INTO declarations VALUES (?, ?, ?, ?, ?, ?)",
                               (record_name(index, ranges[4] + 1, name) for name, ranges in decls.items()))
                db.executemany("INSERT OR IGNORE INTO uses VALUES (?, ?, ?, ?, ?)", reverse)
                db.execute("INSERT INTO metadata VALUES (?, ?)", (index, payload))
            return payload

    def kernel(self, index, name):
        with self.locks[index % len(self.locks)], closing(self.connect()) as db:
            cached = db.execute("SELECT payload FROM kernel WHERE module=? AND name=?", (index, name)).fetchone()
            if cached:
                return cached[0]
            artifact = self.objects / f"{index}.olean"
            if not artifact.exists():
                self.extract(index)
            result = subprocess.run(
                [str(self.lean), "--run", str(ROOT / "scripts/kernel-refs.lean"), str(artifact), name],
                check=True, text=True, capture_output=True, timeout=20)
            payload = json.dumps(json.loads(result.stdout), ensure_ascii=False)
            with db:
                db.execute("INSERT INTO kernel VALUES (?, ?, ?)", (index, name, payload))
            return payload

    def search(self, query):
        fold = query.casefold()
        pattern = fold.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        order = """ORDER BY CASE WHEN name=? AND folded<>short THEN 0
            WHEN (name=? OR leaf=?) AND module IN (SELECT module FROM metadata) THEN 1
            WHEN name=? OR leaf=? THEN 2 WHEN folded=? OR short=? THEN 3 ELSE 4 END,
            LENGTH(name), name, module, line LIMIT 28"""
        rank = (query, query, query, query, query, fold, fold)
        with closing(self.connect()) as db:
            rows = db.execute(
                "SELECT module, line, name FROM declarations WHERE short LIKE ? ESCAPE '\\' OR folded LIKE ? ESCAPE '\\' "
                + order, (pattern, pattern, *rank)).fetchall()
            if not rows and len(fold) >= 3:
                rows = db.execute(
                    "SELECT module, line, name FROM declarations WHERE instr(folded, ?) > 0 " + order,
                    (fold, *rank)).fetchall()
        return rows

    def usages(self, module, name):
        with closing(self.connect()) as db:
            matches = db.execute(
                "SELECT file, line, parent FROM uses WHERE target_module=? AND name=? ORDER BY file, line LIMIT 50",
                (module, name)).fetchall()
            coverage = db.execute("SELECT COUNT(*) FROM metadata").fetchone()[0]
        return {"matches": matches, "modules": coverage}

    def external(self, module, name):
        if not self.mathlib or not MODULE_NAME.fullmatch(module):
            return None
        path = Path(*module.split(".")).with_suffix(".lean")
        file = self.mathlib / path
        if not file.is_file():
            return None
        source = file.read_text(encoding="utf-8")
        if not name:
            return {"source": source, "line": 0, "path": path.as_posix()}
        short = name.split(".")[-1]
        pattern = re.compile(r"(?m)^\s*(?:@\[[^\n]*?\]\s*)*(?:(?:protected|private|noncomputable)\s+)*"
                             r"(?:theorem|lemma|def|abbrev|structure|class|inductive|axiom|opaque)\s+"
                             rf"(?:{re.escape(name)}|{re.escape(short)})(?![\w.'′])")
        locations = [source.count("\n", 0, match.end()) + 1 for match in pattern.finditer(source)]
        return {"source": source, "line": locations[0] if len(locations) == 1 else 0,
                "path": path.as_posix()}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, reader, **kwargs):
        self.reader = reader
        super().__init__(*args, directory=str(DIST), **kwargs)

    def end_headers(self):
        self.send_header("X-Riemann-Reader", "1")
        super().end_headers()

    def send_json(self, payload, status=200):
        body = (payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlsplit(self.path)
        if not url.path.startswith("/api/"):
            return super().do_GET()
        params = parse_qs(url.query)
        get = lambda key: params.get(key, [""])[0][:200]
        try:
            if hit := re.fullmatch(r"/api/lean/(\d{1,7})", url.path):
                index = int(hit[1])
                if index >= len(self.reader.paths):
                    return self.send_json({"error": "Unknown module."}, 404)
                payload = self.reader.get(index)
                if self.reader.lean:
                    payload = '{"kernel":true,' + payload[1:]
                return self.send_json(payload)
            if hit := re.fullmatch(r"/api/kernel/(\d{1,7})", url.path):
                index = int(hit[1])
                if index >= len(self.reader.paths) or not self.reader.lean:
                    return self.send_json({"error": "Kernel metadata unavailable."}, 404)
                name = get("name")
                if name not in json.loads(self.reader.get(index))["decls"]:
                    return self.send_json({"error": "Unknown declaration."}, 404)
                return self.send_json(self.reader.kernel(index, name))
            if url.path == "/api/declarations":
                return self.send_json(self.reader.search(get("q").strip()) if get("q").strip() else [])
            if url.path == "/api/uses":
                return self.send_json(self.reader.usages(get("module"), get("name")))
            if url.path == "/api/mathlib":
                result = self.reader.external(get("module"), get("name"))
                return self.send_json(result) if result else self.send_json({"error": "Source unavailable."}, 404)
            return self.send_json({"error": "Unknown endpoint."}, 404)
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            self.log_error("%s", error)
            return self.send_json({"error": "Lean metadata is unavailable for this module."}, 503)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--mathlib", type=Path)
    parser.add_argument("--leantar", type=Path)
    parser.add_argument("--lean", type=Path, help="Lean v4.33.1 binary for kernel references")
    args = parser.parse_args()
    if args.mathlib:
        revision = subprocess.check_output(["git", "-C", args.mathlib, "rev-parse", "HEAD"], text=True).strip()
        if revision != MATHLIB_PIN:
            parser.error(f"Mathlib must be checked out at {MATHLIB_PIN}.")
    if args.lean:
        args.lean = args.lean.resolve(strict=True)
        version = subprocess.check_output([args.lean, "--version"], text=True)
        if "version 4.33.1," not in version:
            parser.error("Kernel references require Lean v4.33.1.")
    reader = Reader(args.mathlib, args.leantar, args.lean)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, reader=reader))
    print(f"http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
