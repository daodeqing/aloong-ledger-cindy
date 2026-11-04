"""Move verified project scratch files to Windows Recycle Bin, never permanent delete."""
from pathlib import Path
import ctypes,json,os
from ctypes import wintypes
ROOT=Path(__file__).resolve().parents[1]
class SHFILEOPSTRUCTW(ctypes.Structure):
    _fields_=[('hwnd',wintypes.HWND),('wFunc',wintypes.UINT),('pFrom',wintypes.LPCWSTR),('pTo',wintypes.LPCWSTR),('fFlags',wintypes.WORD),('fAnyOperationsAborted',wintypes.BOOL),('hNameMappings',ctypes.c_void_p),('lpszProgressTitle',wintypes.LPCWSTR)]
def recycle(path):
    absolute=path.resolve()
    if not absolute.is_relative_to(ROOT) or absolute==ROOT:raise RuntimeError('拒绝处理项目外路径: '+str(absolute))
    if os.name!='nt':raise RuntimeError('此清理脚本只使用 Windows 回收站，不永久删除')
    buffer=ctypes.create_unicode_buffer(str(absolute)+'\0\0')
    operation=SHFILEOPSTRUCTW();operation.wFunc=3;operation.pFrom=ctypes.cast(buffer,wintypes.LPCWSTR);operation.fFlags=0x40|0x10|0x04|0x400
    call=ctypes.windll.shell32.SHFileOperationW;call.argtypes=[ctypes.POINTER(SHFILEOPSTRUCTW)];call.restype=ctypes.c_int
    result=call(ctypes.byref(operation))
    if result or operation.fAnyOperationsAborted or path.exists():raise RuntimeError('移至回收站未完成: '+str(path)+' code='+str(result))
def main():
    targets=[ROOT/'.cache',ROOT/'evidence',ROOT/'.impeccable']
    targets += [p for p in ROOT.rglob('__pycache__') if '.git' not in p.parts and not any(p.is_relative_to(t) for t in targets)]
    records=[];total=0
    for target in targets:
        if not target.exists():continue
        entries=[{'name':str(p.relative_to(ROOT)).replace(chr(92),'/'),'bytes':p.stat().st_size} for p in target.rglob('*') if p.is_file()]
        size=sum(x['bytes'] for x in entries);recycle(target);total+=size
        records.append({'target':str(target.relative_to(ROOT)),'status':'recycled','bytes':size,'files':entries})
        print('RECYCLED',target.name,len(entries),'files',round(size/1024,2),'KB',round(size/1024/1024,2),'MB')
    result={'status':'completed','bytesMovedToRecycleBin':total,'projectSpaceRecoveredMB':round(total/1024/1024,2),'diskBytesFreed':0,'note':'已移出项目；回收站未清空，磁盘空间未实际释放','items':records}
    report=ROOT/'reports/cleanup.json';report.parent.mkdir(exist_ok=True);report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Report:',report,'TOTAL',result['projectSpaceRecoveredMB'],'MB')
if __name__=='__main__':main()
