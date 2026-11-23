"""Place indexed proof declarations in the global atlas using exported vectors."""
import json
import numpy as np
from sklearn.preprocessing import normalize
from build import DATA, write_json
from packed_asset import pack
from view_indexes import atlas as build_atlas_indexes
from projection import global_projection

vocab = json.loads((DATA / "vocabulary.json").read_text())
words = {w: i for i, w in enumerate(vocab["words"])}
vectors = normalize(np.fromfile(DATA / "vectors.bin", dtype=np.int8).reshape(len(words), -1).astype("f"))
display = [p[0] for p in vocab["points"]]
project = global_projection(vectors, display)
xy = project(vectors[display]).round(4).tolist()
vocab["points"] = [[i, round(x, 4), round(y, 4)] for i, (x, y) in zip(display, xy)]
write_json(DATA / "vocabulary.json", vocab)
build_atlas_indexes()
regions = json.loads((DATA / "regions.json").read_text())
colors = {int(r["id"]): r["color"] for r in regions["regions"]}
background = [[x, y, colors[regions["assignments"][i] // 3]] for i, x, y in vocab["points"][::8]]
graph = json.loads((DATA / "proof-graph.json").read_text())
positions = {}
for module in graph["paths"]:
    meta = json.loads((DATA / f"reader/{module}.json").read_text())
    refs = {}
    lines = meta["source"].splitlines()
    for sl, sc, el, ec, parent, _, target in meta["refs"]:
        if sl != el or parent == target:
            continue
        spelling = lines[sl][sc:ec]
        token = target if target in words else spelling
        if token in words:
            refs.setdefault(parent, set()).add(words[token])
    for name in meta["decls"]:
        ids = [words[name]] if name in words else sorted(refs.get(name, ()))
        if not ids:
            continue
        x, y = project(vectors[ids].mean(axis=0, keepdims=True))[0]
        positions[name] = [round(float(x), 4), round(float(y), 4), 0 if name in words else len(ids)]
write_json(DATA / "path-overlay.json", {"background": background, "positions": positions})
pack(DATA / "path-overlay.json")
print(f"{len(positions)} placed declarations ({sum(p[2] == 0 for p in positions.values())} exact)")

# Lightweight first-chapter figure. Crop the same PCA frame around a verified path.
chain = ["riemannHypothesis", "rhOfAll", "allChi"]
assert all(b in graph["nodes"][a][2] for a, b in zip(chain, chain[1:]))
assert all(positions[name][2] == 0 for name in chain)
center = np.mean([positions[n][:2] for n in chain], axis=0)


def screen(x, y):
    return 230 + 365 * (x - center[0]), 104 - 365 * (y - center[1])


svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 220">',
       '<rect width="460" height="220" fill="#f6f6f3"/>']
svg.append('<style>.pin{opacity:0}.pin:target{opacity:1}</style>')
for color in sorted(colors.values()):
    dots = []
    for x, y, c in background:
        px, py = screen(x, y)
        if c == color and -2 < px < 462 and -2 < py < 222:
            dots.append(f"M{px:.1f},{py:.1f}h.1")
    svg.append(f'<path d="{"".join(dots)}" stroke="{color}" opacity=".95" stroke-width="2.8" stroke-linecap="round"/>')
points = [screen(*positions[n][:2]) for n in chain]
coords = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
svg.append(f'<polyline points="{coords}" stroke="#171717" stroke-width="2" fill="none"/>')
for step, ((x, y), name, (dx, dy)) in enumerate(zip(points, chain, [(18, 10), (-14, -12), (14, 5)])):
    label = f"{step}  {name}"
    anchor = "end" if dx < 0 else "start"
    svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.8" fill="#161616" stroke="#f6f6f3" stroke-width="1.5"/>')
    svg.append(f'<text x="{x+dx:.1f}" y="{y+dy:.1f}" text-anchor="{anchor}" fill="#161616" stroke="#f6f6f3" '
               f'stroke-width="4" paint-order="stroke" font-family="monospace" font-size="14">{label}</text>')
for i, (x, y) in enumerate(points):
    svg.append(f'<circle class="pin" id="step-{i}" cx="{x:.1f}" cy="{y:.1f}" r="9" fill="none" stroke="#222" stroke-width="1.5"/>')
opening = []
for name in chain:
    module, line = graph["nodes"][name][:2]
    source = json.loads((DATA / f"reader/{module}.json").read_text())["source"]
    opening.append([name, graph["paths"][str(module)], line, source.splitlines()[line - 1].strip()])
(DATA.parent / "opening-data.js").write_text("export const opening = " + json.dumps(opening, indent=2) + ";\n")
(DATA.parent / "opening-path.svg").write_text("".join(svg) + "</svg>\n")
