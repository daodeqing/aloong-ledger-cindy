"""Start and stop only this project's local UI test service, without visible consoles."""
from pathlib import Path
import subprocess,sys,os,json
ROOT=Path(__file__).resolve().parents[1];CACHE=ROOT/'.cache';CACHE.mkdir(exist_ok=True)
if sys.argv[1]=='start':
    env=os.environ.copy();env.update({'TEMP':str(CACHE),'TMP':str(CACHE),'PYTHONDONTWRITEBYTECODE':'1'})
    with (CACHE/'preview.log').open('w',encoding='utf-8') as log:
        p=subprocess.Popen([sys.executable,'-B','-X','utf8',str(ROOT/'scripts/preview_server.py')],cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=0x08000000)
    (CACHE/'preview.pid').write_text(str(p.pid));print('Owned preview PID',p.pid)
else:
    pid=int((CACHE/'preview.pid').read_text());r=subprocess.run(['taskkill','/PID',str(pid),'/T','/F'],capture_output=True,text=True,errors='replace');print(r.stdout);print(r.stderr)
