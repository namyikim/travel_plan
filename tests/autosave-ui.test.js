const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const fn=source.slice(source.indexOf('  function persistChanges()'),source.indexOf('  function markChanged()'));
test('autosave reaches server without depending on a successful UI render',async()=>{
 let saved=0;const els={saveStatus:{},retrySaveBtn:{}};
 const ctx={run:async(_,op)=>op(),session:{save:async()=>saved++},$:id=>els[id],render:()=>{throw Error('UI failed')},alert:()=>{},Intl,Date};vm.createContext(ctx);
 await vm.runInContext(fn+';persistChanges()',ctx);assert.equal(saved,1);
});
test('save failure surfaces its actual cause and does not claim success',async()=>{
 let message='';const els={saveStatus:{},retrySaveBtn:{}};
 const ctx={run:async(_,op)=>op(),session:{save:async()=>{throw Error('저장소 권한 오류')}},$:id=>els[id],alert:value=>message=value,Intl,Date};vm.createContext(ctx);
 await assert.rejects(vm.runInContext(fn+';persistChanges()',ctx),/권한 오류/);
 assert.match(message,/저장소 권한 오류/);assert.match(els.saveStatus.textContent,/저장 실패/);
});
