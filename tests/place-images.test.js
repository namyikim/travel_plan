const {test}=require('node:test');const assert=require('node:assert/strict');const P=require('../place-images.js');
test('Korean Hawaii names map to specific articles and generic activities are skipped',()=>{
 assert.equal(P.queryFor('할레아칼라 일출').title,'Haleakalā');
 assert.equal(P.queryFor('와이아나 파나파 주립공원 방문').title,'Waiʻanapanapa State Park');
 assert.equal(P.queryFor('공항'),null);assert.equal(P.queryFor('휴식'),null);
 assert.equal(P.queryFor('서울역 방문').lang,'ko');
});
test('only matching titles with trusted image metadata are accepted',()=>{
 const query={title:'Haleakalā',lang:'en'},page={title:'Haleakala',thumbnail:{source:'https://upload.wikimedia.org/test.jpg'},pageimage:'test.jpg'};
 assert.equal(P.selectPage([page],query),page);
 assert.equal(P.selectPage([{...page,title:'Hawaii'}],query),undefined);
 assert.equal(P.selectPage([{...page,pageprops:{disambiguation:''}}],query),undefined);
 assert.equal(P.selectPage([{...page,thumbnail:{source:'https://example.com/image.jpg'}}],query),undefined);
 assert.equal(P.selectPage([{title:'Haleakala'}],query),undefined);
});
test('Korean titles remain distinct after normalization',()=>{
 const page={title:'부산역',thumbnail:{source:'https://upload.wikimedia.org/test.jpg'},pageimage:'test.jpg'};
 assert.equal(P.selectPage([page],{title:'서울역'}),undefined);
 assert.equal(P.selectPage([page],{title:'부산역'}),page);
});
