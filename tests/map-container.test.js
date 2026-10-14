const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../map.js');
test('restaurant and itinerary maps initialize in their own containers',()=>{
 const oldDocument=global.document,oldL=global.L;
 const elements=new Map();
 global.document={getElementById(id){if(!elements.has(id))elements.set(id,{id,textContent:'',addEventListener(){},replaceChildren(){}});return elements.get(id);}};
 const containers=[];
 const map={setView(){return this},on(){return this},invalidateSize(){},remove(){}};
 global.L={map(container){containers.push(container.id);return map;},tileLayer(){return{addTo(){return this},on(){return this}}},featureGroup(){return{addTo(){return this},clearLayers(){},getLayers(){return []}}}};
 try{
  const restaurant=M.create({restaurants:true,isBusy:()=>false});
  restaurant.update({id:'maui',events:[]},'maui');
  const itinerary=M.create({isBusy:()=>false});
  itinerary.update({id:'trip',events:[]},'2027-02-11');
  assert.deepEqual(containers,['restaurantMap','dayMap']);
  assert.match(elements.get('restaurantMapStatus').textContent,/등록한 맛집 항목이 없어요/);
  restaurant.clear();itinerary.clear();
 }finally{global.document=oldDocument;global.L=oldL;}
});
