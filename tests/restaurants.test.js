const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js');
const item={id:'food1',island:'oahu',name:'가고 싶은 맛집',location:'주소',menu:'추천 메뉴',note:'메모',url:'https://example.com'};
test('restaurant CRUD round trips and trip edits preserve the island collection',()=>{
 const old=C.emptyData();let data=C.upsertRestaurant(old,item);
 assert.equal(old.restaurants,undefined);
 data=C.upsertRestaurant(data,{...item,island:'maui',name:'수정'});
 assert.equal(data.restaurants.length,1);assert.equal(data.restaurants[0].island,'maui');
 const trip={id:'trip1',title:'여행',destination:'하와이',start:'2027-02-11',end:'2027-02-25',people:3};
 data=C.upsertTrip(data,trip);data=C.removeTrip(data,trip.id);
 assert.deepEqual(C.validateData(JSON.parse(JSON.stringify(data))),data);
 assert.equal(data.restaurants[0].name,'수정');
 assert.equal(C.removeRestaurant(data,item.id).restaurants.length,0);
});
test('restaurant validation rejects unsafe links, unknown islands, empty names and duplicate IDs',()=>{
 for(const patch of [{island:'unknown'},{name:' '},{url:'javascript:alert(1)'},{url:'invalid'}])assert.throws(()=>C.upsertRestaurant(C.emptyData(),{...item,...patch}));
 assert.throws(()=>C.validateData({...C.emptyData(),restaurants:[item,item]}));
 assert.throws(()=>C.validateData({...C.emptyData(),restaurants:{}}));
 for(const island of Object.keys(C.islands))assert.equal(C.upsertRestaurant(C.emptyData(),{...item,island}).restaurants[0].island,island);
});
