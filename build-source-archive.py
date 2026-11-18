"""Regenerate the public AGPL corresponding-source archive after changing code.

Run from the Urban Bite project directory: python3 build-source-archive.py
This archive intentionally excludes private secrets, generated build files and itself.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent
output = root / 'apps/web/public/urbanbite-source.zip'
exclude_dirs = {'node_modules', '.git', '.next', 'dist', '.turbo', '__pycache__', '.pnpm-store', 'coverage'}
exclude_files = {'.env', '.env.local', 'urbanbite-source.zip'}
with ZipFile(output, 'w', compression=ZIP_DEFLATED, compresslevel=7) as z:
    for path in sorted(root.rglob('*')):
        if not path.is_file() or any(part in exclude_dirs for part in path.relative_to(root).parts):
            continue
        if path.name in exclude_files or path.suffix in {'.log', '.tsbuildinfo'}:
            continue
        z.write(path, arcname=Path('Urban Bite') / path.relative_to(root))
print(f'Updated {output} ({output.stat().st_size / 1024 / 1024:.2f} MB)')
