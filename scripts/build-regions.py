"""Fit and export the two-level atlas for the existing quantized Word2Vec model."""

import json
import os
from pathlib import Path
from packed_asset import pack
from view_indexes import atlas as build_atlas_indexes

os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
os.environ.setdefault("OMP_NUM_THREADS", "4")

import numpy as np
from sklearn.cluster import MiniBatchKMeans
from sklearn.decomposition import PCA
from sklearn.preprocessing import normalize

DATA = Path(__file__).resolve().parents[1] / "docs" / "data"

# Labels describe inspected clusters of the published embedding. Each example is
# checked against membership before an annotation is attached.
REGIONS = [
    ("Foundations & continuity", "#8da7ef",
     "Namespace and library vocabulary alongside a small, distinct group of continuity and measurability lemmas.", [
        ("Library foundations", "Common namespaces and foundational types.", ["CategoryTheory", "MeasureTheory", "IsDedekindDomain"]),
        ("Formal development namespaces", "Qualified names from the global, formalism and reciprocity libraries.", ["GlobalTheory.Doubling", "Formalism.BasicNotions.Host.cmStar", "GlobalTheory.CechPoset"]),
        ("Continuity & measurability", "Composition and closure lemmas for continuous and measurable maps.", ["continuousOn", "ContinuousOn.mul", "measurable_snd"]),
    ]),
    ("Bounds & L-functions", "#5fe0bc",
     "Arithmetic estimates and proof vocabulary around inequalities. The zeta and Dirichlet L-function examples are concentrated in the real estimates subcluster.", [
        ("Discrete arithmetic", "Finite sums, counting, valuations and arithmetic proof steps.", ["Nat.choose", "padicValInt", "DirichletCharacter"]),
        ("Arithmetic data & indexing", "Named fields, places and parameters on arithmetic data structures.", ["D.host", "D.what₂.Word", "Ranks"]),
        ("Real estimates & L-functions", "Real powers, logarithms and numerical bounds, with the zeta and Dirichlet L-function vocabulary.", ["riemannZeta", "DirichletCharacter.LFunction", "Real.log", "Gammaℝ"]),
    ]),
    ("Modules, lattices & families", "#f4bf7b",
     "Submodules and lattices, together with hypotheses and family data used across the formal library.", [
        ("Topology & local hypotheses", "Compactness, measurability and local existence conditions.", ["LocallyCompactSpace", "MeasurableSet", "IsCompact"]),
        ("Families & proof structure", "Declarations and tactics around structured mathematical inputs and families.", ["FormsTied", "SlopeBoundParameters", "IsHilbertSchmidt"]),
        ("Submodules & dual lattices", "Span, quotient and restriction operations on submodules and lattice data.", ["Submodule.span", "LinearMap.ker", "IsIntegralLat"]),
    ]),
    ("Rings, fields & ideals", "#f69198",
     "Algebraic extensions and morphisms, alongside prime ideals, localization and supporting algebra.", [
        ("Field and ring morphisms", "Equivalences, injectivity and embeddings into larger fields.", ["RingEquiv.injective", "AlgebraicClosure", "FractionRing"]),
        ("Algebraic declarations", "Theorem and instance vocabulary around number fields and algebras.", ["NumberField", "Algebra", "AddCommGroup"]),
        ("Prime ideals & localization", "Prime ideals, local rings, domain conditions and finite algebra.", ["HeightOneSpectrum", "Ideal.IsPrime.isMaximal", "IsLocalRing"]),
    ]),
    ("Analysis & representations", "#c5a1fc",
     "Integration, linear operations and characters, with Fourier and representation vocabulary in related contexts.", [
        ("Integration & measure", "Product measures, measurability and changes of variables in integrals.", ["Integrable", "Measurable", "integral_prod_mul"]),
        ("Linear operations & series", "Linear and multilinear maps, expansions in bases, and operations on power series.", ["OrthonormalBasis.coe_toBasis", "MvPowerSeries.coeff_rescale", "LinearMap.smul_apply"]),
        ("Characters & multiplicativity", "Multiplicative maps, character values and group operations.", ["MonoidHom.prod_apply", "detChar_apply", "gammaFactor"]),
    ]),
    ("Schemes, sheaves & series", "#7dcff2",
     "Scheme charts and categorical constructions, with a subcluster for polynomials and formal series.", [
        ("Polynomials & formal series", "Coefficient operations, evaluation, and formal parameters.", ["MvPowerSeries.monomial", "constantCoeff", "aeval"]),
        ("Schemes & affine charts", "Open loci, restrictions, and affine chart constructions.", ["Scheme", "X.Opens", "IsAffineOpen"]),
        ("Sheaves & categorical operations", "Functorial maps, pullbacks of modules, and universal constructions.", ["Scheme.Modules.pullback", "Functor.whiskerLeft", "cokernel.desc"]),
    ]),
    ("Matrices, forms & theta data", "#ef94c8",
     "Matrix algebra and real or Hermitian forms, with coordinate and theta-lattice vocabulary.", [
        ("Theta data & lattices", "Theta lattice maps, coordinate embeddings and place data.", ["Formalism.L2.Theta", "V.gram", "GlobalTheory.AdForm.finM"]),
        ("Matrix blocks & identities", "Block operations, transposition, inverses and matrix identities.", ["Matrix.of", "Matrix.toBlocks_fromBlocks₁₁", "Matrix.mul_apply", "Gm"]),
        ("Real and Hermitian forms", "Bases, frames and coordinates for real and Hermitian objects.", ["Formalism.HermitianLatticesTheory.vecAt", "periodMatrix", "Complex.exp"]),
    ]),
    ("Pullbacks & geometric maps", "#a8d888",
     "Morphism and gluing vocabulary across geometric charts, pullbacks and diagram identities.", [
        ("Pullback diagrams", "Pullback projections and morphisms of affine or local models.", ["pullback.fst", "Spec.map", "Limits.pullback.lift"]),
        ("Local geometry & gluing", "Local geometric data and units or actions on the models.", ["D.toPre", "Units.map", "IsAlgClosed"]),
        ("Diagram identities", "Composition, universal maps and identities in categorical diagrams.", ["CartesianMonoidalCategory", "Category.id_comp", "beta_reduce"]),
    ]),
]
ORDER = [1, 4, 6, 2, 3, 5, 7, 0]
CHILD_ORDER = {1: [2, 0, 1]}


def fit(vectors, count, seed, batch):
    model = MiniBatchKMeans(n_clusters=count, n_init=5, random_state=seed, batch_size=batch)
    return model.fit_predict(vectors)


def project(vectors, indices):
    indices = sorted(set(indices))
    matrix = PCA(n_components=2, random_state=42).fit_transform(vectors[indices])
    scale = np.maximum(np.std(matrix, axis=0), 1e-8)
    matrix = .97 * np.tanh(matrix / (1.7 * scale))
    return [[int(i), round(float(x), 4), round(float(y), 4)] for i, (x, y) in zip(indices, matrix)]


def preview(points):
    stride = max(1, len(points) // 54)
    return [point[1:] for point in points[::stride]][:65]


def main():
    vocab = json.loads((DATA / "vocabulary.json").read_text(encoding="utf-8"))
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
    ids = {word: i for i, word in enumerate(vocab["words"])}
    vectors = normalize(np.fromfile(DATA / "vectors.bin", dtype=np.int8)
                        .reshape(-1, meta["dimensions"]).astype(np.float32))
    plot = {point[0] for point in vocab["points"]}
    parents = fit(vectors, len(REGIONS), 31, 2048)
    assignments = np.empty(len(vectors), dtype=int)
    result = {}
    for parent, (title, color, note, descriptions) in enumerate(REGIONS):
        members = np.flatnonzero(parents == parent)
        children = fit(vectors[members], len(descriptions), 100 + parent, 1024)
        parts = []
        for child, (subtitle, description, words) in enumerate(descriptions):
            chosen = members[children == child]
            examples = [ids[word] for word in words]
            unexpected = [word for word in words if ids[word] not in chosen]
            if unexpected:
                raise ValueError(f"Review labels for {parent}.{child}: {unexpected} moved.")
            leaf = parent * 3 + child
            assignments[chosen] = leaf
            points = project(vectors, (plot.intersection(chosen)).union(examples))
            parts.append({"id": f"{parent}.{child}", "title": subtitle, "note": description,
                          "count": len(chosen), "examples": examples, "preview": preview(points),
                          "points": points})
        parts = [parts[i] for i in CHILD_ORDER.get(parent, range(len(parts)))]
        parent_examples = [term for child in parts for term in child["examples"][:2]]
        points = project(vectors, (plot.intersection(members)).union(parent_examples))
        result[parent] = {"id": str(parent), "title": title, "color": color, "note": note,
                          "count": len(members), "examples": parent_examples,
                          "preview": preview(points), "children": parts}
    output = {"assignments": assignments.tolist(), "regions": [result[key] for key in ORDER]}
    (DATA / "regions.json").write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")),
                                       encoding="utf-8")
    pack(DATA / "regions.json")
    build_atlas_indexes()
    print(f"Exported {len(result)} regions, {sum(len(item['children']) for item in result.values())} subclusters and {len(vectors):,} memberships.")


if __name__ == "__main__":
    main()
