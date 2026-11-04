"""Build the sandbox package using Python only; no runtime Node dependency."""
from pathlib import Path
import json, re, shutil
ROOT=Path(__file__).resolve().parents[1]
PLUGIN=ROOT/'plugin'
def build():
    manifest=json.loads((ROOT/'src/ghost.json').read_text(encoding='utf-8'))
    categories=json.loads((ROOT/'src/categories.json').read_text(encoding='utf-8'))
    names=[t['name'] for t in manifest['tools']]
    sources=[(ROOT/'src/core.js').read_text(encoding='utf-8'),
             'globalThis.LedgerCategories='+json.dumps(categories,ensure_ascii=False)+';\n',
             'const LEDGER_TOOLS='+json.dumps(names)+';\n',
             (ROOT/'src/service.js').read_text(encoding='utf-8'),
             (ROOT/'src/brain.js').read_text(encoding='utf-8')]
    PLUGIN.mkdir(exist_ok=True)
    (PLUGIN/'main.js').write_text('\n'.join(sources),encoding='utf-8',newline='\n')
    (PLUGIN/'ghost.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    template=(ROOT/'src/view.html').read_text(encoding='utf-8')
    template=template.replace('/* INLINE_STYLE */',(ROOT/'src/view.css').read_text(encoding='utf-8'))
    template=template.replace('/* INLINE_SCRIPT */',(ROOT/'src/core.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/app.js').read_text(encoding='utf-8'))
    (PLUGIN/'main-view.html').write_text(template,encoding='utf-8',newline='\n')
    print('Built plugin/main.js, ghost.json, main-view.html')
if __name__=='__main__': build()
