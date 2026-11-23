# Developing Riemann2Vec

The static site lives in `docs/`. The commands below add the local semantic reader, regenerate the research data, or package the site.

## Run the semantic reader

Start the local reader from this directory.

```sh
python3 scripts/serve.py --port 8765 --mathlib /tmp/riemann-mathlib-source
```

Open <http://127.0.0.1:8765>. The service binds to loopback. Set up the source link after cloning the pinned release below.

```sh
ln -s /tmp/riemann-original/src docs/lean-source
```

The reader uses `.ilean` data from the [Lean community’s published cache](https://github.com/leanprover-community/riemann-hypothesis/blob/main/verification/CACHE.md). It checks the archive digests against the pinned manifest. The cached source revision adds a challenge file and preserves the published proof files. Modules are fetched as needed and cached under `.work/reader/`. The **Used by** tab reports the extent of the local index. The static reader serves bundled source and Lean metadata for the proof-path snapshot.

To read Mathlib definitions locally, check out the pinned Mathlib revision.

```sh
git init /tmp/riemann-mathlib-source
git -C /tmp/riemann-mathlib-source fetch --depth 1 https://github.com/leanprover-community/mathlib4.git 0df444a360eaa60ab8c11dca51a86af692955474
git -C /tmp/riemann-mathlib-source checkout --detach FETCH_HEAD
```

Pass `--lean /path/to/lean-4.33.1/bin/lean` to enable **Kernel refs**, which reads the constants in a declaration’s compiled type and body from its verified `.olean` artifact. It reads the individual module without rebuilding the proof library.

## Rebuild the data

The published original release is pinned to commit `40e56bab026552e089d7afcfeff08d2defb9c005` in the Lean community mirror. The build reads Lean files as text without running Lean or building the library.

```sh
git clone --single-branch --branch original --depth 1 \
  https://github.com/leanprover-community/riemann-hypothesis.git /tmp/riemann-original
git -C /tmp/riemann-original checkout --detach 40e56bab026552e089d7afcfeff08d2defb9c005
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/build.py /tmp/riemann-original
```

The build uses identifier contexts within individual source lines and skips import lines for model training. It trains a 64-dimensional CBOW Word2Vec model with negative sampling and exports normalized 8-bit vectors. Run `OPENBLAS_NUM_THREADS=4 .venv/bin/python scripts/build-neighbors.py` after training to regenerate the exact eight-neighbor rankings. Browsers fetch rankings in 24 KiB shards. The embedding view opens with eight labeled regions, each with three subclusters. The groups are fitted on the normalized 64-dimensional vectors. The labels and representative identifiers were selected by inspecting the groups. The full PCA and each subcluster plot show subsets of their assigned vocabulary. Subcluster plots have their own PCA axes. Textual similarity can point to related source locations. Direct import links show the module dependencies. Multithreaded training can vary the resulting vectors between runs.

## Refresh the region data

```sh
.venv/bin/python scripts/build-regions.py
```

The script checks that the examples supporting each label belong to the fitted cluster. Retraining the embedding may move those examples and require reviewing the labels in the script.

## Refresh proof paths

Run `python scripts/build-proof-graph.py --lean /path/to/lean` with the pinned toolchain after opening the desired modules in the local reader. The export links source declarations in the indexed modules using constants in their compiled bodies. The browser computes directed shortest paths within this snapshot. Each step links to its Lean source, and the kernel panel includes references beyond the snapshot.

## Package the static site

The first guide chapter is served as HTML. After editing guide content or corpus statistics, run `node scripts/render-entry.mjs` (Node 22.7+). The map opens with a region summary. Subcluster coordinates, neighbor rankings, and search indexes load when requested. The reader opens indexed proof modules from a compact directory. The data exporters refresh these indexes. To regenerate them from an existing snapshot, run `python3 scripts/view_indexes.py`.

Run `python3 scripts/package-site.py` to create `.work/riemann2vec-pages.zip`. Extract the contents into the directory served by a static host. All app assets use relative URLs and views use hash links, including under a project subdirectory. The archive includes a `.nojekyll` marker.

The guide, embeddings, proof paths, and indexed Lean reader work with a static HTTP server. Source, signatures, kernel references, reverse uses, and declaration search for the bundled modules are available locally in the archive. Other project modules use the full module directory and fetch source from the pinned upstream revision. Mathlib links open its pinned source. The local Python service expands semantic coverage on demand.

The proof paths view displays the selected chain in the global projection. Drag **Trace path** or use the arrow keys to inspect each step. Where Lean records an explicit body reference, the highlighted excerpt links to that use in its caller. Otherwise the link opens the caller’s compiled references. The URL preserves the chosen step. Choose **Whole atlas** to see the broader context. Numbered marks open their Lean declarations. An exact identifier uses its Word2Vec vector. A ring uses the mean of distinct embedded reference spellings resolved inside the declaration. Missing positions break the line. To regenerate the shared projection and overlay after rebuilding the embedding or the reader snapshot, run `.venv/bin/python scripts/build-path-overlay.py`.
