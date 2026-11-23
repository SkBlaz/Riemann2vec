"""Export exact cosine neighbors of the published 8-bit vectors in small shards."""
import json
from pathlib import Path

import numpy as np

DATA = Path(__file__).resolve().parents[1] / "docs/data"
SHARD = 256
COUNT = 8


def main():
    meta = json.loads((DATA / "meta.json").read_text())
    raw = np.fromfile(DATA / "vectors.bin", dtype=np.int8)
    vectors = raw.reshape(meta["terms"], meta["dimensions"]).astype(np.float32)
    lengths = np.linalg.norm(vectors.astype(np.float64), axis=1)
    norms = np.divide(1, lengths, where=lengths != 0, out=np.zeros_like(lengths)).astype(np.float32).astype(np.float64)
    output = DATA / "neighbors"
    output.mkdir(exist_ok=True)
    dtype = np.dtype([("id", "<u4"), ("score", "<f8")])
    for start in range(0, len(vectors), SHARD):
        block = vectors[start:start + SHARD]
        scores = (block @ vectors.T).astype(np.float64)
        scores *= norms[start:start + len(block), None]
        scores *= norms
        scores[np.arange(len(block)), start + np.arange(len(block))] = -np.inf
        records = np.empty((len(block), COUNT), dtype=dtype)
        for i, row in enumerate(scores):
            ids = np.argpartition(row, -COUNT)[-COUNT:]
            threshold = row[ids].min()
            # Match the interactive ranking's index tie-break at the cutoff.
            better = ids[row[ids] > threshold]
            ties = np.flatnonzero(row == threshold)[:COUNT-len(better)]
            ids = np.concatenate([better, ties])
            ids = ids[np.lexsort((ids, -row[ids]))]
            records[i]["id"], records[i]["score"] = ids, row[ids]
        path = output / f"{start // SHARD}.bin"
        temp = path.with_suffix(".tmp")
        records.tofile(temp)
        temp.replace(path)
    print(f"Exported {len(vectors):,} exact neighborhoods.")


if __name__ == "__main__":
    main()
