"""Export the small indexes needed to open the reader and the embedding map."""
import json
from pathlib import Path
from packed_asset import pack

data = Path(__file__).resolve().parents[1] / "docs/data"


def read(name):
    return json.loads((data / name).read_text())


def save(name, value):
    path = data / name
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    pack(path)


def reader():
    graph = read("proof-graph.json")
    stride = read("meta.json")["moduleBatch"]
    ids = {int(key) for key in graph["paths"]}
    modules = {}
    chunks = {}
    for index in sorted(map(int, graph["paths"])):
        shard = index // stride
        if shard not in chunks:
            chunks[shard] = read(f"modules/{shard}.json")
        row = chunks[shard][index % stride]
        modules[index] = row
        ids.update(i for i in row[1] if isinstance(i, int))
    names = {}
    path = ""
    for index, (prefix, tail) in enumerate(read("paths.json")):
        path = path.encode("utf-16-le")[:prefix * 2].decode("utf-16-le") + tail
        if index in ids:
            names[index] = path
    save("reader-index.json", {"paths": names, "modules": modules})


def atlas():
    vocab = read("vocabulary.json")
    data_regions = read("regions.json")
    names = data / "term-info"
    names.mkdir(exist_ok=True)
    for start in range(0, len(vocab["words"]), 256):
        rows = list(zip(vocab["words"][start:start + 256], vocab["counts"][start:start + 256]))
        (names / f"{start // 256}.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
    plotted = {i for i, _, _ in vocab["points"]}
    first = [[] for parent in data_regions["regions"] for child in parent["children"]]
    for i, group in enumerate(data_regions["assignments"]):
        if len(first[group]) < 30:
            first[group].append(i)
            plotted.add(i)
    for parent in data_regions["regions"]:
        for child in parent["children"]:
            plotted.update(i for i, _, _ in child["points"])
    landmarks = {vocab["words"].index(w) for w in ("riemannZeta", "DirichletCharacter.LFunction", "Gm", "Complex.exp")}
    examples = {i for parent in data_regions["regions"] for region in [parent, *parent["children"]] for i in region["examples"]}
    plotted.update(examples | landmarks)
    save("atlas-index.json", {"points": vocab["points"], "first": first,
        "terms": [[i, vocab["words"][i], vocab["counts"][i]] for i in sorted(plotted)]})

    # Region cards use summaries and the global thumbnail, without local PCA coordinates.
    members = data_regions["assignments"]
    summary = []
    for parent in data_regions["regions"]:
        children = [{k: v for k, v in child.items() if k != "points"} for child in parent["children"]]
        summary.append({**parent, "children": children})
    save("atlas-overview.json", {
        "regions": summary,
        "points": [[i, x, y, members[i]] for i, x, y in vocab["points"]],
        "terms": [[i, vocab["words"][i], members[i]] for i in sorted(examples | landmarks)],
    })


if __name__ == "__main__":
    reader()
    atlas()
