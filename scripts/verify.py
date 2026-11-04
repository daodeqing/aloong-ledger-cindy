"""Reproducible Python-driven validation. All scratch output stays in this project."""
from pathlib import Path
import json,os,subprocess,shutil,sys,zipfile,hashlib,re
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache';REPORTS=ROOT/'reports'
def run():
    CACHE.mkdir(exist_ok=True);REPORTS.mkdir(exist_ok=True)
    for n in ['tmp','tools']:(CACHE/n).mkdir(exist_ok=True)
    executable=shutil.which('node')
    if not executable:raise RuntimeError('需要已有 Node 24+ 执行 JavaScript 验证；插件运行本身不需要 Node')
    node=CACHE/'tools/node.exe'
    if Path(executable).resolve()!=node.resolve() and not node.exists():shutil.copy2(executable,node)
    env=os.environ.copy();env.update({'TEMP':str(CACHE/'tmp'),'TMP':str(CACHE/'tmp'),'NODE_DISABLE_COLORS':'1','PYTHONDONTWRITEBYTECODE':'1'})
    flags=0x08000000 if os.name=='nt' else 0
    def command(args):
        r=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace',env=env,timeout=60,creationflags=flags)
        if r.returncode:raise RuntimeError(r.stdout+r.stderr)
        return r.stdout+r.stderr
    command([sys.executable,'-X','utf8',str(ROOT/'scripts/build.py')])
    for p in list((ROOT/'src').glob('*.js'))+[ROOT/'plugin/main.js']:
        command([str(node),'--check',str(p)])
    manifest=json.loads((ROOT/'plugin/ghost.json').read_text(encoding='utf-8'))
    assert manifest['schemaVersion']==3 and manifest['id']=='liang-ledger' and manifest['version']=='0.1.0'
    assert manifest['command']=='记账' and manifest['library'] is True and manifest['notify'] is True
    assert manifest['mobile']['channels']==['liang-ledger']
    assert not set(manifest).intersection({'fs','network','node','subscribe','agent','android','deviceSync'})
    for p in [manifest['entry'],manifest['mainView']['html'],manifest['mobile']['mainView'],manifest['icon']]:
        assert (ROOT/'plugin'/p).is_file(),p
    assert len(manifest['tools'])==len({t['name'] for t in manifest['tools']})
    output=command([str(node),'--test',str(ROOT/'tests/service.test.cjs'),str(ROOT/'tests/router.test.cjs')])
    (REPORTS/'business-tests.txt').write_text(output,encoding='utf-8')
    pack=ROOT/'plugin/liang-ledger-0.1.0.cindy'
    package=None
    if pack.exists():
        with zipfile.ZipFile(pack) as z:
            names=z.namelist()
            assert 'ghost.json' in names and 'main.js' in names and 'main-view.html' in names
            for n in names:
                assert not n.startswith(('/',chr(92))) and '..' not in Path(n).parts,n
                assert not any(s in n.split('/') for s in ['node_modules','tests','scripts','.cache','.git']),n
            for n in ['ghost.json','main.js','main-view.html']:
                assert z.read(n)==(ROOT/'plugin'/n).read_bytes(),'安装包已过期，请重新 ghost_forge_pack: '+n
        package={'bytes':pack.stat().st_size,'sha256':hashlib.sha256(pack.read_bytes()).hexdigest(),'files':len(names)}
    result={'manifest':'passed','paths':'passed','javascript_syntax':'passed','business_tests':9,'package':package,'runtime_dependencies':[]}
    (REPORTS/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(output);print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':run()
