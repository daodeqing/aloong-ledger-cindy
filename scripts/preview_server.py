"""Local-only preview with a Python SQLite host adapter. Never shipped in the plugin."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json,sqlite3,threading,signal
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache';CACHE.mkdir(exist_ok=True)
DB=sqlite3.connect(str(CACHE/'preview.sqlite'),check_same_thread=False)
DB.row_factory=sqlite3.Row
LOCK=threading.RLock()
def library(req):
    with LOCK:
        op=req.get('op')
        try:
            if op=='open':return {'ok':True,'state':'ready'}
            if op=='db.open':return {'ok':True}
            if op=='db.exec':
                cursor=DB.execute(req['sql'],req.get('params',[]))
                if cursor.description:return {'ok':True,'rows':[dict(x) for x in cursor.fetchall()]}
                DB.commit();return {'ok':True,'changes':cursor.rowcount}
            if op=='db.migrate':
                with DB:
                    for step in req['steps']:
                        for sql in step['sql']:DB.execute(sql)
                return {'ok':True}
            if op=='db.batch':
                with DB:
                    for st in req['statements']:DB.execute(st['sql'],st.get('params',[]))
                return {'ok':True}
            raise ValueError('Unsupported '+str(op))
        except Exception as e:
            DB.rollback();return {'ok':False,'errorCode':'DB_ERROR','message':str(e)}
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,body,mime='application/json'):
        data=body.encode('utf-8') if isinstance(body,str) else body
        self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def do_POST(self):
        if self.path!='/library':self.send_error(404);return
        req=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.reply(json.dumps(library(req),ensure_ascii=False))
    def do_GET(self):
        path=self.path.split('?')[0]
        if path=='/qa':return self.reply('<!doctype html><html><head><meta charset="utf-8"></head><body><iframe src="/brain" hidden></iframe><iframe id="phone" src="/main-view.html?bare=1" style="width:320px;height:900px;border:0"></iframe><iframe id="desktop" src="/main-view.html?bare=1" style="width:900px;height:900px;border:0"></iframe></body></html>','text/html;charset=utf-8')
        if path=='/wake':return self.reply('{"state":"running"}')
        if path=='/brain':
            return self.reply('<!doctype html><script>window.cindy={library:r=>fetch("/library",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(r)}).then(x=>x.json()),send:async r=>({ok:true}),onHostMessage:f=>{}};</script><script src="/main.js"></script>','text/html;charset=utf-8')
        if path in ['/','/main-view.html']:
            html=(ROOT/'plugin/main-view.html').read_text(encoding='utf-8')
            if 'bare=1' not in self.path:html=html.replace('<body>','<body><iframe src="/brain" hidden title="Preview host"></iframe>',1)
            return self.reply(html,'text/html;charset=utf-8')
        p=(ROOT/'plugin'/path.lstrip('/')).resolve()
        if not p.is_relative_to((ROOT/'plugin').resolve()) or not p.is_file():self.send_error(404);return
        mime='image/png' if p.suffix=='.png' else 'application/javascript;charset=utf-8' if p.suffix=='.js' else 'text/plain;charset=utf-8'
        return self.reply(p.read_bytes(),mime)
if __name__=='__main__':
    server=ThreadingHTTPServer(('127.0.0.1',8787),Handler)
    print('Preview http://127.0.0.1:8787',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close();DB.close()
