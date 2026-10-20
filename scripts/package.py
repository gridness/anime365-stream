"""Create a deterministic IINA archive from runtime files only."""
import json
import pathlib
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / "Info.json").read_text())
output = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / ("Anime365-" + manifest["version"] + ".iinaplgz")
output.parent.mkdir(parents=True, exist_ok=True)
files = [ROOT / "Info.json"]
for directory in ["src", "ui"]:
    files.extend(sorted((ROOT / directory).rglob("*")))

with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in files:
        if file.is_symlink():
            raise ValueError("Runtime symlinks are not supported: " + str(file))
        if not file.is_file():
            continue
        relative = file.relative_to(ROOT).as_posix()
        if any(part.startswith(".") for part in file.relative_to(ROOT).parts):
            raise ValueError("Unexpected hidden runtime file: " + relative)
        info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, file.read_bytes())

with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert "Info.json" in archive.namelist()
    for field in ["entry", "globalEntry"]:
        assert manifest[field] in archive.namelist()
    assert json.loads(archive.read("Info.json")) == manifest
print(output)
