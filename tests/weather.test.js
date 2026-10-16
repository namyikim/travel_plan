const {test}=require('node:test');const assert=require('node:assert/strict');const W=require('../weather.js');
test('previous-year reference preserves date and handles leap day explicitly',()=>{
 assert.equal(W.previousYear('2027-02-14'),'2026-02-14');assert.equal(W.previousYear('2028-02-29'),'2027-02-28');
});
test('weather region follows daily place then stay and does not assume Hawaii for other destinations',()=>{
 const trip={title:'가족 여행',destination:'하와이',events:[],stays:[{name:'마우이',start:'2027-02-11',end:'2027-02-16'}]};
 assert.equal(W.infer(trip,'2027-02-14'),'maui');
 assert.equal(W.infer({...trip,events:[{date:'2027-02-14',place:'할레아칼라 일출'}]},'2027-02-14'),'haleakala');
 assert.equal(W.infer({...trip,destination:'제주',stays:[]},'2027-02-14'),null);
});
test('NWS uses local forecast dates and converts Fahrenheit without inventing a missing night',()=>{
 const data={properties:{periods:[{startTime:'2027-02-14T06:00:00-10:00',temperature:77,temperatureUnit:'F',isDaytime:true,shortForecast:'Sunny'},{startTime:'2027-02-15T06:00:00-10:00',temperature:80,temperatureUnit:'F'}]}};
 assert.deepEqual(W.forecastFor(data,'2027-02-14'),[{day:true,temp:25,summary:'Sunny'}]);
 assert.deepEqual(W.forecastFor(data,'2027-02-16'),[]);assert.equal(W.codeLabel(null),'날씨 정보 없음');
});
