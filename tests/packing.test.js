const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const { createSession } = require('../session.js');
const item = { id: 'passport', name: '여권', packed: false };

test('packing items survive edits, serialization, and unrelated trip changes', () => {
  const original = C.emptyData();
  let data = C.upsertPackingItem(original, { ...item, name: ' 여권 ' });
  assert.equal(original.packingItems, undefined);
  assert.deepEqual(data.packingItems, [item]);
  data = C.upsertPackingItem(data, { id: 'charger', name: '충전기' });
  data = C.upsertPackingItem(data, { ...item, packed: true });
  data = C.upsertTrip(data, { id:'trip', title:'여행', destination:'하와이', start:'2027-02-11', end:'2027-02-12', people:3 });
  data = C.removeTrip(data, 'trip');
  assert.deepEqual(C.validateData(JSON.parse(JSON.stringify(data))), data);
  assert.equal(data.packingItems[0].packed, true);
  assert.deepEqual(C.removePackingItem(data, 'passport').packingItems, [{id:'charger', name:'충전기', packed:false}]);
});

test('packing validation accepts old data and rejects blank, oversized, or corrupt items', () => {
  assert.deepEqual(C.validateData(C.emptyData()), C.emptyData());
  for (const patch of [{name:' '}, {name:'a'.repeat(201)}, {name:null}, {packed:'true'}, {id:'invalid/id'}]) {
    assert.throws(() => C.upsertPackingItem(C.emptyData(), {...item, ...patch}));
  }
  for (const packingItems of [null, {}, [null], [item, item]]) {
    assert.throws(() => C.validateData({...C.emptyData(), packingItems}));
  }
});

test('independent first packing additions merge across devices using legacy data', () => {
  const base = C.emptyData();
  const local = C.upsertPackingItem(base, item);
  const remote = C.upsertPackingItem(base, {id:'charger', name:'충전기'});
  const merged = C.mergeData(base, local, remote);
  assert.deepEqual(new Set(merged.packingItems.map(entry => entry.id)), new Set(['passport','charger']));
  const checked = C.upsertPackingItem(merged, {...item, packed:true});
  const removed = C.removePackingItem(merged, 'charger');
  assert.deepEqual(C.mergeData(merged, checked, removed).packingItems, [{...item, packed:true}]);
});

test('packing saves encrypted and reloads after logout without dropping checklist state', async () => {
  let remote = {envelope:null, sha:null};
  const session = createSession({readRemote:async()=>remote, writeRemote:async(_,envelope)=>{
    remote = {envelope,sha:'saved'}; return {sha:'saved'};
  }});
  const connection = {repo:'owner/private', token:'test-placeholder'}, password = 'packing-test-password';
  await session.open(connection, password);
  session.update(data => C.upsertPackingItem(data, {...item, packed:true}));
  await session.save();
  assert.equal(JSON.stringify(remote).includes('여권'), false);
  session.lock();
  await session.open(connection, password);
  assert.deepEqual(session.snapshot().data.packingItems, [{...item, packed:true}]);
});

test('packing UI adds, checks, deletes and renders the entire list with autosave', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
  const node = (tag, className, textContent) => ({tag,className,textContent,children:[],listeners:{},
    append(...children){this.children.push(...children);}, replaceChildren(...children){this.children=children;},
    addEventListener(type,callback){this.listeners[type]=callback;}, setAttribute(key,value){this[key]=value;}, focus(){this.focused=true;}
  });
  const elements = Object.fromEntries(['packingCount','packingEmpty','packingList','packingBtn','packingForm','packingName','packingFormError','appError'].map(id=>[id,node('div')]));
  elements.packingForm.reset = () => {elements.packingName.value='';};
  let data = C.emptyData(), saves = 0;
  const context = vm.createContext({ C, node, $:id=>elements[id], pending:false, mainView:'packing',
    crypto:{randomUUID:()=> 'passport'}, confirm:()=>true,
    session:{snapshot:()=>({unlocked:true,data}), update:fn=>{data=fn(data);}},
    action:(label,classes,fn)=>{const el=node('button',classes,label);el.addEventListener('click',fn);return el;},
    render:()=>context.renderPacking(data),
    persistChanges:async()=>{saves++;context.renderPacking(data);},
    markChanged:()=>{saves++;context.renderPacking(data);}
  });
  vm.runInContext(source.slice(source.indexOf('  function renderPacking('),source.indexOf('  function renderExpenses(')),context);
  context.renderPacking(data);
  assert.equal(elements.packingEmpty.hidden,false);
  elements.packingName.value = ' 여권 ';
  await elements.packingForm.listeners.submit({preventDefault(){}});
  assert.equal(data.packingItems[0].name,'여권');
  assert.equal(elements.packingName.value,'');
  assert.equal(elements.packingList.children.length,1);
  assert.equal(elements.packingEmpty.hidden,true);
  let row = elements.packingList.children[0], checkbox = row.children[0].children[0];
  checkbox.checked=true; checkbox.listeners.change();
  assert.equal(data.packingItems[0].packed,true);
  assert.match(elements.packingCount.textContent,/준비 완료 1개/);
  elements.packingList.children[0].children[1].listeners.click();
  assert.equal(data.packingItems.length,0);
  assert.equal(elements.packingEmpty.hidden,false);
  assert.equal(saves,3);
  elements.packingName.value='   ';
  await elements.packingForm.listeners.submit({preventDefault(){}});
  assert.match(elements.packingFormError.textContent,/준비물 이름/);
  assert.equal(saves,3);
  context.pending=true;
  elements.packingName.value='충전기';
  await elements.packingForm.listeners.submit({preventDefault(){}});
  assert.equal(data.packingItems.length,0);
});
