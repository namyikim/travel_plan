(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TravelPlaceImages=factory();}(globalThis,()=>{
  'use strict';
  const aliases=[
    [/할레아칼라|haleakal[aā]/i,'Haleakalā'],[/와이아나파나파|와이아나 파나파|waianapanapa/i,'Waiʻanapanapa State Park'],
    [/아이아오|이아오|iao valley/i,'Iao Valley'],[/하나우마|hanauma/i,'Hanauma Bay'],[/다이아몬드 헤드|다이아몬드헤드|diamond head/i,'Diamond Head, Hawaii'],
    [/카아나팔리|카어나팔리|kaanapali/i,'Kaanapali, Hawaii'],[/푸날루우|punalu/i,'Punaluʻu Beach'],[/하와이 화산|hawaii volcanoes/i,'Hawaiʻi Volcanoes National Park'],
    [/마우나케아|마우나 케아|mauna kea/i,'Mauna Kea'],[/아카카|akaka/i,'Akaka Falls State Park'],[/와이키키|waikiki/i,'Waikiki'],
    [/케알라케쿠아|kealakekua/i,'Kealakekua Bay'],[/케카하 카이|케케아 카이|kekaha kai/i,'Kekaha Kai State Park']
  ];
  const normalize=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').normalize('NFC').toLowerCase().replace(/[^a-z0-9가-힣]/g,'');
  function queryFor(place){
    for(const [pattern,title] of aliases)if(pattern.test(place))return {title,lang:'en'};
    const title=place.replace(/\([^)]*\)/g,' ').replace(/\b(?:check.?in|check.?out)\b/gi,' ').replace(/(?:방문|관광|산책|도착|출발|체크인|체크아웃|일출|일몰|휴식)/g,' ').trim();
    if(title.length<3||/^(아침|점심|저녁|식사|호텔|숙소|공항|렌터카|자유시간)$/.test(title))return null;
    return {title,lang:/[가-힣]/.test(title)?'ko':'en'};
  }
  function selectPage(pages,query){
    return (pages||[]).find(page=>normalize(page.title||'')===normalize(query.title) && !Object.hasOwn(page.pageprops||{},'disambiguation') && page.thumbnail?.source?.startsWith('https://upload.wikimedia.org/') && page.pageimage);
  }
  function create(){
    const cache=new Map();let controller=new AbortController(),queue=[],active=0,generation=0;
    async function lookup(query,signal){
      const url=new URL(`https://${query.lang}.wikipedia.org/w/api.php`);
      url.search=new URLSearchParams({action:'query',format:'json',formatversion:'2',origin:'*',generator:'search',gsrsearch:query.title,gsrnamespace:'0',gsrlimit:'5',prop:'pageimages|pageprops',piprop:'thumbnail|name',pithumbsize:'240',pilicense:'free'});
      const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok)throw new Error('Image lookup failed');
      const data=await response.json(),page=selectPage(data.query?.pages,query);
      if(!page)return null;
      return {title:page.title,image:page.thumbnail.source,url:`https://${query.lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g,'_'))}`,credit:`https://${query.lang}.wikipedia.org/wiki/File:${encodeURIComponent(page.pageimage)}`};
    }
    function pump(){
      while(active<2&&queue.length){
        const job=queue.shift();active++;
        lookup(job.query,controller.signal).then(job.resolve,()=>{cache.delete(job.key);job.resolve(null);}).finally(()=>{active--;pump();});
      }
    }
    function get(query){const key=JSON.stringify(query);if(!cache.has(key)){cache.set(key,new Promise(resolve=>queue.push({query,key,resolve})));pump();}return cache.get(key);}
    function attach(host,place){
      const query=queryFor(place);if(!query)return;
      const current=generation;
      const start=async()=>{
        const result=await get(query);if(!result||current!==generation||!host.isConnected)return;
        const figure=document.createElement('figure');figure.className='place-thumbnail';
        const a=document.createElement('a');a.href=result.url;a.target='_blank';a.rel='noopener noreferrer';a.title=`${result.title} · 장소 소개 (Wikipedia)`;
        const img=document.createElement('img');img.alt=`${result.title} 대표 이미지`;img.width=112;img.height=80;img.loading='lazy';img.referrerPolicy='no-referrer';img.src=result.image;img.addEventListener('error',()=>figure.remove());a.append(img);
        const caption=document.createElement('figcaption'),credit=document.createElement('a');credit.textContent='사진 출처·라이선스';credit.href=result.credit;credit.target='_blank';credit.rel='noopener noreferrer';caption.append(credit);figure.append(a,caption);host.prepend(figure);
      };
      if(typeof IntersectionObserver==='undefined'){start();return;}
      const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();observers.delete(observer);start();}},{rootMargin:'100px'});observers.add(observer);observer.observe(host);
    }
    const observers=new Set();
    function clear(){generation++;controller.abort();controller=new AbortController();for(const job of queue)job.resolve(null);queue=[];cache.clear();for(const observer of observers)observer.disconnect();observers.clear();}
    function resetView(){for(const observer of observers)observer.disconnect();observers.clear();}
    return {attach,clear,resetView};
  }
  return {queryFor,selectPage,create};
}));
