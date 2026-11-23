"""Export kernel body dependencies between source declarations in locally indexed modules."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import json
from pathlib import Path
import subprocess
from tempfile import NamedTemporaryFile

from packed_asset import pack
from view_indexes import reader as build_reader_index
from serve import DIST, ROOT, Reader


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lean", type=Path, required=True)
    args = parser.parse_args()
    reader = Reader(None, lean=args.lean)
    nodes = {}
    objects = []
    static = DIST / "data/reader"
    static.mkdir(exist_ok=True)
    modules = {}
    kernels = {}
    def write(path, data):
        path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")

    with closing(reader.connect()) as db:
        for index, payload in db.execute("SELECT module,payload FROM metadata ORDER BY module"):
            objects.append((index, reader.objects / f"{index}.olean"))
            metadata = json.loads(payload)
            modules[index] = reader.paths[index]
            kernels[index] = {}
            source = DIST / "lean-source" / reader.paths[index].removeprefix("src/")
            uses = {}
            for name, file, line, parent in db.execute(
                "SELECT name,file,line,parent FROM uses WHERE target_module=? ORDER BY file,line", (metadata["module"],)
            ):
                matches = uses.setdefault(name, [])
                if len(matches) < 50:
                    matches.append([file, line, parent])
            write(static / f"{index}.json", {**metadata, "source": source.read_text(), "kernel": True})
            write(static / f"{index}-uses.json", uses)
            for name, span in metadata["decls"].items():
                if name in nodes:
                    raise ValueError(f"Ambiguous compiled declaration {name}")
                nodes[name] = [index, span[4] + 1, [], None]

    def ensure_object(pair):
        index, path = pair
        if not path.exists():
            reader.extract(index)
        return str(path)

    with ThreadPoolExecutor(max_workers=5) as pool:
        paths = list(pool.map(ensure_object, objects))
    output = subprocess.check_output([args.lean, "--run", ROOT / "scripts/proof-graph.lean", *paths], text=True)
    for line in output.splitlines():
        path, name, types, targets = json.loads(line)
        if name in nodes and nodes[name][0] == int(Path(path).stem):
            kernels[nodes[name][0]][name] = {"type": types, "value": targets}
            if targets is None:
                continue
            nodes[name][3] = len(set(targets) - {name})
            nodes[name][2] = sorted({term for term in targets if term in nodes and term != name})
    for index, kernel in kernels.items():
        write(static / f"{index}-kernel.json", kernel)
    with NamedTemporaryFile(mode="w", dir=DIST / "data", delete=False) as file:
        json.dump({"modules": len(paths), "paths": modules, "nodes": nodes}, file, ensure_ascii=False, separators=(",", ":"))
    Path(file.name).chmod(0o644)
    Path(file.name).replace(DIST / "data/proof-graph.json")
    pack(DIST / "data/proof-graph.json")
    build_reader_index()
    print(f"{len(nodes)} declarations in {len(paths)} modules")


if __name__ == "__main__":
    main()
