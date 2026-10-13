const {test}=require('node:test');const assert=require('node:assert/strict');const C=require('../core.js');
const t={id:'t',title:'하와이',destination:'하와이',start:'2027-02-11',end:'2027-02-12',people:3,events:[]};
const e={id:'e',date:t.start,time:'10:00',place:'와이키키',transport:'',lodging:'',note:'',url:'',timeZone:'Pacific/Honolulu'};
test('map locations persist with itinerary and reject invalid coordinates',()=>{
 const input={...e,mapLocation:{lat:21.28,lon:-157.83,label:'Waikiki Beach'}};
 const data=C.upsertEvent(C.upsertTrip(C.emptyData(),t),'t',input);
 assert.deepEqual(C.validateData(JSON.parse(JSON.stringify(data))).trips[0].events[0].mapLocation,input.mapLocation);
 assert.equal(C.validateEvent(e,t).mapLocation,null);
 for(const loc of [{lat:91,lon:0,label:'bad'},{lat:0,lon:181,label:'bad'},{lat:NaN,lon:0,label:'bad'},{lat:'21',lon:0,label:'bad'}]) assert.throws(()=>C.validateEvent({...e,mapLocation:loc},t));
});
test('day map uses only selected local date, preserves chronology and marks missing positions',()=>{
 const M=require('../map.js');
 const events=[{...e,id:'arrive',time:'10:00'}, {...e,id:'depart',time:'22:00',timeZone:'Asia/Seoul'}, {...e,id:'tomorrow',date:t.end}];
 assert.deepEqual(M.dayEvents({...t,events},t.start).map(x=>x.id),['depart','arrive']);
 assert.throws(()=>M.routeURL(events),/위치/);
 const stops=[{...e,mapLocation:{lat:21.28,lon:-157.83}},{...e,id:'b',mapLocation:{lat:21.3,lon:-157.8}}];
 assert.match(M.routeURL(stops),/-157.83,21.28;-157.8,21.3/);
 assert.throws(()=>M.routeURL([{...stops[0],category:'flight'},stops[1]]),/비행기/);
});

test('manual travel time belongs to the exact previous stop and has readable label',()=>{
 const M=require('../map.js');
 const first={...e,id:'first',mapLocation:{lat:21.28,lon:-157.83,label:'Waikiki'}};
 const second={...e,id:'second',time:'12:00',travelFromId:'first',travelMinutes:85,mapLocation:{lat:21.30,lon:-157.8,label:'Beach'}};
 assert.equal(M.legMinutes(first,second),85);
 assert.equal(M.formatMinutes(85),'1시간 25분');
 assert.equal(M.formatMinutes(60),'1시간');
 assert.equal(M.formatMinutes(30),'30분');
 assert.equal(M.legMinutes({...first,id:'changed'},second),null);
 assert.equal(M.legMinutes(first,{...second,date:t.end}),null);
 assert.equal(M.legMinutes(first,{...second,travelMinutes:null}),null);
});
