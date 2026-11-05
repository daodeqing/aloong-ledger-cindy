"""Build the sandbox package including React UI and Cindy Plugin Brain."""
from pathlib import Path
import json, shutil, subprocess, os

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / 'plugin'
UI_REACT = ROOT / 'ui_react'

def build():
    if UI_REACT.exists():
        vite_bin = UI_REACT / 'node_modules' / '.bin' / 'vite.cmd'
        if vite_bin.exists():
            print('Building React UI...')
            r1 = subprocess.run([str(vite_bin), 'build'], cwd=str(UI_REACT), capture_output=True, text=True)
            if r1.returncode != 0:
                raise RuntimeError('Vite build failed: ' + r1.stderr)

            dist = UI_REACT / 'dist'
            if dist.exists():
                PLUGIN.mkdir(exist_ok=True)
                html_content = (dist / 'index.html').read_text(encoding='utf-8')
                (PLUGIN / 'main-view.html').write_text(html_content, encoding='utf-8')
                assets_dir = PLUGIN / 'assets'
                assets_dir.mkdir(exist_ok=True)
                for f_path in (dist / 'assets').iterdir():
                    shutil.copy2(f_path, assets_dir / f_path.name)
                print('Assets and main-view.html synced from React dist.')

    manifest = json.loads((ROOT / 'src/ghost.json').read_text(encoding='utf-8'))
    categories = json.loads((ROOT / 'src/categories.json').read_text(encoding='utf-8'))
    names = [t['name'] for t in manifest['tools']]
    nl = chr(10)
    sources = [
        (ROOT / 'src/core.js').read_text(encoding='utf-8'),
        'globalThis.LedgerCategories=' + json.dumps(categories, ensure_ascii=False) + ';' + nl,
        'const LEDGER_TOOLS=' + json.dumps(names) + ';' + nl,
        (ROOT / 'src/service.js').read_text(encoding='utf-8'),
        (ROOT / 'src/reminder-engine.js').read_text(encoding='utf-8'),
        (ROOT / 'src/brain.js').read_text(encoding='utf-8'),
    ]
    PLUGIN.mkdir(exist_ok=True)
    (PLUGIN / 'main.js').write_text(nl.join(sources), encoding='utf-8')
    (PLUGIN / 'ghost.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + nl, encoding='utf-8')
    print('Built plugin/main.js, ghost.json')

if __name__ == '__main__':
    build()
