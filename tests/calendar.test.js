const {test}=require('node:test');const assert=require('node:assert/strict');const C=require('../core.js');
const trip={id:'t',title:'하와이',destination:'하와이',start:'2027-02-11',end:'2027-03-02',people:3,events:[]};
const event={id:'e',date:'2027-02-18',time:'10:00',place:'마우이행 비행기',transport:'항공',lodging:'',note:'',url:'',timeZone:'Pacific/Honolulu'};
test('stay ranges appear inclusively on each day, preserve events and survive trip edits',()=>{
 let data=C.upsertTrip(C.emptyData(),trip);data=C.upsertEvent(data,'t',event);
 data=C.upsertStay(data,'t',{id:'oahu',name:'오아후',start:'2027-02-11',end:'2027-02-18'});
 data=C.upsertStay(data,'t',{id:'maui',name:'마우이',start:'2027-02-18',end:'2027-03-02'});
 data=C.upsertTrip(JSON.parse(JSON.stringify(data)),{...trip,title:'가족 하와이'});
 const day=C.calendarDays(data.trips[0],'2027-02').find(d=>d.date==='2027-02-18');
 assert.deepEqual(day.stays.map(s=>s.name),['오아후','마우이']);assert.equal(day.events[0].place,event.place);
 assert.equal(C.removeStay(data,'t','oahu').trips[0].stays.length,1);assert.equal(data.trips[0].stays.length,2);
 assert.throws(()=>C.upsertTrip(data,{...trip,end:'2027-02-20'}));
});
test('calendar handles leap months, week alignment, out of trip days and legacy data',()=>{
 const old=C.validateTrip(trip);assert.deepEqual(old.stays,[]);
 const days=C.calendarDays(old,'2027-02');assert.equal(days[0].date,null);assert.equal(days[1].date,'2027-02-01');
 assert.equal(days.find(d=>d.date==='2027-02-10').inTrip,false);assert.equal(days.find(d=>d.date==='2027-02-11').inTrip,true);
 assert.equal(days.length%7,0);
 const leap=C.validateTrip({...trip,start:'2028-02-01',end:'2028-03-01'});
 assert.ok(C.calendarDays(leap,'2028-02').some(d=>d.date==='2028-02-29'));
 assert.throws(()=>C.calendarDays(old,'2027-13'));
});
test('icons infer existing flights and respect explicit category; invalid stay ranges are rejected',()=>{
 assert.equal(C.eventCategory(event),'flight');assert.equal(C.eventCategory({...event,category:'food'}),'food');
 const data=C.upsertTrip(C.emptyData(),trip);
 for(const stay of [{id:'s',name:'',start:trip.start,end:trip.end},{id:'s',name:'섬',start:'2027-02-10',end:trip.end},{id:'s',name:'섬',start:trip.end,end:trip.start}])assert.throws(()=>C.upsertStay(data,'t',stay));
 assert.throws(()=>C.validateEvent({...event,category:'unknown'},trip));
});
