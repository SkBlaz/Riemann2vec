"""Package the static app, excluding the local source checkout and training vectors."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
site = root / "docs"
archive = root / ".work/riemann2vec-pages.zip"
archive.parent.mkdir(exist_ok=True)
staging = archive.with_suffix(".tmp")
with ZipFile(staging, "w", ZIP_DEFLATED, compresslevel=6) as bundle:
    for path in sorted(site.rglob("*")):
        if path.is_symlink() or not path.is_file() or path == site / "data/vectors.bin":
            continue
        bundle.write(path, path.relative_to(site))
staging.replace(archive)
print(archive)
