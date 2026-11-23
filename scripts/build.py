"""Build the static Word2Vec and source indexes from a pinned Lean checkout."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "2")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
WORK = ROOT / ".work"
REPO = "https://github.com/leanprover-community/riemann-hypothesis"
ORIGINAL = "40e56bab026552e089d7afcfeff08d2defb9c005"

IDENTIFIER = r"(?:[^\W\d]|_)[\w'′]*(?:\.(?:[^\W\d]|_)[\w'′]*)*"
TOKEN = re.compile(IDENTIFIER)
DECL = re.compile(
    rf"\b(?:theorem|lemma|def|abbrev|structure|class|inductive|axiom)\s+({IDENTIFIER})"
)
IMPORT = re.compile(r"^\s*(?:(?:public|meta|private)\s+)*import\s+(.+)")
MODULE_BATCH = 512
TERM_BATCH = 512
DIMENSIONS = 64
EPOCHS = 5

KEYWORDS = set("""
  _ a b c d e f g h i j k l m n o p q r s t u v w x y z by have exact rw
  simp simpa only at with using intro intros apply calc show from fun let
  theorem lemma def noncomputable private namespace end open set_option
  section variable classical import public renaming hiding protected scoped
  first right left rcases obtain h₀ h₁ h₂ ·
""".split())
ANCHORS = {
    "riemannHypothesis", "RiemannHypothesis", "LFunction_eq_zero_re",
    "criticalLine", "explicitFormula", "rhOfAll", "allChi", "critAll",
}


from packed_asset import pack


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if path.name in {"paths.json", "vocabulary.json"}:
        pack(path)


def encode_paths(paths):
    """Store each sorted path as a shared prefix length and a suffix."""
    encoded = []
    previous = ""
    for path in paths:
        prefix = len(os.path.commonprefix((previous, path)))
        # JavaScript string offsets count UTF-16 code units.
        offset = len(path[:prefix].encode("utf-16-le")) // 2
        encoded.append([offset, path[prefix:]])
        previous = path
    return encoded


def revision(source):
    return subprocess.check_output(["git", "-C", source, "rev-parse", "HEAD"], text=True).strip()


def prepare(source):
    """Tokenize the full source and collect representative identifier occurrences."""
    paths = sorted(path.relative_to(source).as_posix() for path in source.rglob("*.lean")
                   if not any(part.startswith(".") for part in path.relative_to(source).parts)
                   and path.name != "lakefile.lean")
    if "src/Main.lean" not in paths:
        raise ValueError("Expected Main.lean in the original Lean release checkout.")
    by_module = {path.removeprefix("src/")[:-5].replace("/", "."): index for index, path in enumerate(paths)}
    mentions, declarations = {}, {}
    source_lines = tokens_seen = 0
    for folder in (WORK, DATA / "modules", DATA / "terms"):
        folder.mkdir(parents=True, exist_ok=True)
    write_json(DATA / "paths.json", encode_paths(paths))
    batch = []
    with (WORK / "corpus.txt").open("w", encoding="utf-8", buffering=1024 * 1024) as corpus:
        for index, path in enumerate(paths):
            imports, declared = [], []
            count = 0
            with (source / path).open(encoding="utf-8") as lean:
                for count, line in enumerate(lean, 1):
                    if match := IMPORT.match(line):
                        body = match[1].split("--", 1)[0]
                        imports.extend(by_module.get(name, name) for name in TOKEN.findall(body))
                        continue
                    if not line.strip() or line.lstrip().startswith("--"):
                        continue
                    words = TOKEN.findall(line.split("--", 1)[0])
                    words = [word for word in words if len(word) <= 160]
                    if not words:
                        continue
                    corpus.write(" ".join(words) + "\n")
                    tokens_seen += len(words)
                    if match := DECL.match(line.lstrip()):
                        name = match[1]
                        declared.append([name, count])
                        declarations.setdefault(name, [index, count])
                    for word in set(words):
                        if len(word) < 3 or word in KEYWORDS:
                            continue
                        examples = mentions.get(word)
                        if examples is None:
                            mentions[word] = [[index, count]]
                        elif len(examples) < 4 and examples[-1][0] != index:
                            examples.append([index, count])
            batch.append([count, list(dict.fromkeys(imports)), declared])
            source_lines += count
            if len(batch) == MODULE_BATCH or index == len(paths) - 1:
                write_json(DATA / "modules" / f"{index // MODULE_BATCH}.json", batch)
                batch = []
            if (index + 1) % 25000 == 0:
                print(f"Indexed {index + 1:,}/{len(paths):,} files", flush=True)
    write_json(WORK / "mentions.json", mentions)
    write_json(WORK / "declarations.json", declarations)
    write_json(WORK / "corpus.json", {
        "revision": revision(source), "files": len(paths), "lines": source_lines, "tokens": tokens_seen,
    })
    print(f"Prepared {len(paths):,} Lean files, {source_lines:,} lines and {tokens_seen:,} tokens.", flush=True)


def train():
    """Train CBOW Word2Vec and export normalized integer vectors and source indexes."""
    import logging
    from gensim.models import Word2Vec
    from gensim.utils import RULE_DEFAULT, RULE_KEEP
    import numpy as np
    from projection import global_projection
    from sklearn.preprocessing import normalize

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    def retain_anchors(word, _count, _minimum):
        return RULE_KEEP if word in ANCHORS else RULE_DEFAULT

    model = Word2Vec(
        corpus_file=str(WORK / "corpus.txt"), vector_size=DIMENSIONS, window=8,
        min_count=5, max_final_vocab=70000, sg=0, negative=5, sample=1e-3,
        trim_rule=retain_anchors, epochs=EPOCHS, workers=min(6, os.cpu_count() or 1), seed=42,
    )
    words = model.wv.index_to_key
    vectors = model.wv.get_normed_vectors()
    counts = [int(model.wv.get_vecattr(word, "count")) for word in words]
    quantized = np.rint(vectors * 127).astype(np.int8)
    quantized.tofile(DATA / "vectors.bin")

    # Keep the projection readable while preserving selected theorem identifiers.
    candidates = [index for index, word in enumerate(words)
                  if len(word) >= 5 and word not in KEYWORDS and not word.startswith("_")]
    display = list(dict.fromkeys(candidates[:5500] + [model.wv.key_to_index[word]
                                                   for word in sorted(ANCHORS) if word in model.wv]))
    exported = normalize(quantized.astype(np.float32))
    xy = global_projection(exported, display)(exported[display])
    points = [[index, round(float(x), 4), round(float(y), 4)] for index, (x, y) in zip(display, xy)]
    write_json(DATA / "vocabulary.json", {"words": words, "counts": counts, "points": points})

    mentions = json.loads((WORK / "mentions.json").read_text(encoding="utf-8"))
    declarations = json.loads((WORK / "declarations.json").read_text(encoding="utf-8"))
    for start in range(0, len(words), TERM_BATCH):
        references = []
        for word in words[start:start + TERM_BATCH]:
            examples = mentions.get(word, [])
            declaration = declarations.get(word)
            reference = [[*example, "mention"] for example in examples if example != declaration]
            if declaration:
                reference.insert(0, [*declaration, "declaration"])
            references.append(reference)
        write_json(DATA / "terms" / f"{start // TERM_BATCH}.json", references)

    stats = json.loads((WORK / "corpus.json").read_text(encoding="utf-8"))
    write_json(DATA / "meta.json", {
        **stats, "repository": REPO, "terms": len(words), "dimensions": DIMENSIONS,
        "moduleBatch": MODULE_BATCH, "termBatch": TERM_BATCH, "epochs": EPOCHS,
    })
    print(f"Exported {len(words):,} Word2Vec vectors and {len(points):,} map points.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Checkout of the original Lean release.")
    parser.add_argument("--phase", choices=["prepare", "train", "all"], default="all")
    args = parser.parse_args()
    if args.phase in ("prepare", "all"):
        source = args.source.resolve()
        if revision(source) != ORIGINAL:
            parser.error(f"Expected original release at commit {ORIGINAL}.")
        prepare(source)
    if args.phase in ("train", "all"):
        train()


if __name__ == "__main__":
    main()
