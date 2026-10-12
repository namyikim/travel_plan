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
test('consecutive same-place stays merge into one weekly bar without changing saved ranges',()=>{
 const t=C.validateTrip({...trip,stays:[{id:'a',name:'마우이',start:'2027-02-15',end:'2027-02-16'},{id:'b',name:'마우이',start:'2027-02-17',end:'2027-02-19'}]});
 const week=C.calendarWeeks(t,'2027-02').find(w=>w.days.some(d=>d.date==='2027-02-15'));
 assert.equal(week.bars.length,1);assert.equal(week.bars[0].column,2);assert.equal(week.bars[0].span,5);assert.equal(t.stays.length,2);
});
test('week and month boundaries show continuation and overlapping locations occupy separate lanes',()=>{
 const t=C.validateTrip({...trip,stays:[{id:'a',name:'오아후',start:'2027-02-11',end:'2027-02-18'},{id:'b',name:'마우이',start:'2027-02-18',end:'2027-03-02'}]});
 const weeks=C.calendarWeeks(t,'2027-02');
 const overlap=weeks.find(w=>w.days.some(d=>d.date==='2027-02-18'));
 assert.equal(overlap.bars.length,2);assert.notEqual(overlap.bars[0].lane,overlap.bars[1].lane);
 assert.equal(overlap.bars[0].continuesBefore,true);assert.equal(overlap.bars[1].continuesAfter,true);
 const march=C.calendarWeeks(t,'2027-03')[0];assert.equal(march.bars[0].continuesBefore,true);assert.equal(march.bars[0].span,2);
});
test('same-place stays separated by a free day remain separate',()=>{
 const t=C.validateTrip({...trip,stays:[{id:'a',name:'마우이',start:'2027-02-15',end:'2027-02-16'},{id:'b',name:'마우이',start:'2027-02-18',end:'2027-02-19'}]});
 const week=C.calendarWeeks(t,'2027-02').find(w=>w.days.some(d=>d.date==='2027-02-15'));assert.equal(week.bars.length,2);
});
