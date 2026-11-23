"""Write a deterministic gzip copy for the app's large JSON indexes."""
import gzip
from pathlib import Path


def pack(path):
    path.with_suffix(".json.gz").write_bytes(gzip.compress(path.read_bytes(), compresslevel=6, mtime=0))


if __name__ == "__main__":
    data = Path(__file__).resolve().parents[1] / "docs/data"
    for name in ("paths", "regions", "vocabulary", "proof-graph"):
        pack(data / f"{name}.json")
