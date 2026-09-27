const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data', 'articles.json');
const PUBLIC = path.join(ROOT, 'public');
const UPLOADS = path.join(ROOT, 'uploads');
const ADMIN_EMAIL = 'admin@signal.mk';
const ADMIN_PASSWORD = 'signal123';
const sessions = new Map();

const categories = [
  {id:'fudbal',name:'Фудбал'}, {id:'kosarka',name:'Кошарка'}, {id:'rakomet',name:'Ракомет'},
  {id:'tenis',name:'Тенис'}, {id:'makedonija',name:'Македонија'}, {id:'svet',name:'Свет'}
];

for (const dir of [path.dirname(DATA), UPLOADS]) fs.mkdirSync(dir,{recursive:true});
function readArticles(){try{return JSON.parse(fs.readFileSync(DATA,'utf8'))}catch{return []}}
function saveArticles(a){fs.writeFileSync(DATA,JSON.stringify(a,null,2),'utf8')}
function send(res,status,data,type='application/json; charset=utf-8',headers={}){
  res.writeHead(status,{'Content-Type':type,...headers});
  if(Buffer.isBuffer(data)||typeof data==='string') return res.end(data);
  res.end(JSON.stringify(data));
}
function parseBody(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>12e6) req.destroy()});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}});req.on('error',reject)})}
function slugify(s){return String(s).toLowerCase().replace(/[čć]/g,'c').replace(/š/g,'s').replace(/ž/g,'z').replace(/ѓ/g,'g').replace(/ќ/g,'k').replace(/џ/g,'dz').replace(/ј/g,'j').replace(/[^a-z0-9а-яё\s-]/gi,'').trim().replace(/\s+/g,'-').slice(0,90)||'vest'}
function uniqueSlug(title,articles,currentId){const base=slugify(title);let slug=base,n=2;while(articles.some(a=>a.slug===slug&&a.id!==currentId))slug=base+'-'+n++;return slug}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),decodeURIComponent(x.slice(i+1).trim())]}))}
function isAuth(req){const token=cookies(req).signal_session;return !!token&&sessions.has(token)}
function requireAuth(req,res){if(!isAuth(req)){send(res,401,{error:'Сесијата истече. Најави се повторно.'});return false}return true}
function staticFile(req,res){
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/' ) pathname='/index.html';
  if(pathname==='/admin'||pathname==='/admin/') pathname='/admin/index.html';
  let rel=pathname.slice(1); let base=PUBLIC;
  if(pathname.startsWith('/uploads/')){base=ROOT;rel=pathname.slice(1)}
  const file=path.resolve(base,rel);
  if(!file.startsWith(path.resolve(base))) return send(res,403,{error:'Forbidden'});
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()) return send(res,404,{error:'Not found'});
  const ext=path.extname(file).toLowerCase();
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
  send(res,200,fs.readFileSync(file),types[ext]||'application/octet-stream');
}
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost'); const p=u.pathname;
  if(p==='/api/login'&&req.method==='POST'){
    const b=await parseBody(req);
    if(b.email===ADMIN_EMAIL&&b.password===ADMIN_PASSWORD){const token=crypto.randomBytes(32).toString('hex');sessions.set(token,Date.now()+1000*60*60*24*7);return send(res,200,{ok:true},'application/json; charset=utf-8',{'Set-Cookie':`signal_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`})}
    return send(res,401,{error:'Погрешна е-пошта или лозинка.'});
  }
  if(p==='/api/logout'&&req.method==='POST'){const t=cookies(req).signal_session;if(t)sessions.delete(t);return send(res,200,{ok:true},'application/json; charset=utf-8',{'Set-Cookie':'signal_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'})}
  if(p==='/api/session'&&req.method==='GET') return send(res,200,{authenticated:isAuth(req)});
  if(p==='/api/categories'&&req.method==='GET') return send(res,200,categories);
  if(p==='/api/articles'&&req.method==='GET'){
    let a=readArticles().filter(x=>x.status==='published');const cat=u.searchParams.get('category');const q=(u.searchParams.get('q')||'').toLowerCase();
    if(cat)a=a.filter(x=>x.categoryId===cat);if(q)a=a.filter(x=>(x.title+' '+x.excerpt+' '+x.content).toLowerCase().includes(q));
    a.sort((x,y)=>new Date(y.publishedAt)-new Date(x.publishedAt));return send(res,200,a);
  }
  if(p.startsWith('/api/articles/')&&req.method==='GET'){
    const slug=decodeURIComponent(p.split('/').pop());const a=readArticles().find(x=>x.slug===slug&&x.status==='published');if(!a)return send(res,404,{error:'Веста не е пронајдена.'});a.views=(a.views||0)+1;saveArticles(readArticles().map(x=>x.id===a.id?a:x));return send(res,200,a);
  }
  if(p==='/api/admin/articles'&&req.method==='GET'){if(!requireAuth(req,res))return;return send(res,200,readArticles().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)))}
  if(p==='/api/admin/articles'&&req.method==='POST'){
    if(!requireAuth(req,res))return;const b=await parseBody(req);if(!b.title||!b.content||!b.categoryId)return send(res,400,{error:'Наслов, текст и категорија се задолжителни.'});const a=readArticles(),now=new Date().toISOString();
    const item={id:crypto.randomUUID(),title:b.title.trim(),slug:uniqueSlug(b.title,a),excerpt:(b.excerpt||'').trim(),content:b.content.trim(),image:b.image||'',categoryId:b.categoryId,categoryName:(categories.find(c=>c.id===b.categoryId)||{}).name||'',sourceName:(b.sourceName||'').trim(),sourceUrl:(b.sourceUrl||'').trim(),status:b.status==='published'?'published':'draft',views:0,publishedAt:b.status==='published'?now:null,createdAt:now,updatedAt:now};a.unshift(item);saveArticles(a);return send(res,201,item)
  }
  if(p.startsWith('/api/admin/articles/')&&(req.method==='PUT'||req.method==='DELETE')){
    if(!requireAuth(req,res))return;const id=p.split('/').pop(),a=readArticles(),idx=a.findIndex(x=>x.id===id);if(idx<0)return send(res,404,{error:'Веста не е пронајдена.'});
    if(req.method==='DELETE'){a.splice(idx,1);saveArticles(a);return send(res,200,{ok:true})}
    const b=await parseBody(req),old=a[idx],now=new Date().toISOString();old.title=b.title.trim();old.slug=uniqueSlug(old.title,a,old.id);old.excerpt=(b.excerpt||'').trim();old.content=b.content.trim();old.image=b.image||'';old.categoryId=b.categoryId;old.categoryName=(categories.find(c=>c.id===b.categoryId)||{}).name||'';old.sourceName=(b.sourceName||'').trim();old.sourceUrl=(b.sourceUrl||'').trim();old.status=b.status==='published'?'published':'draft';if(old.status==='published'&&!old.publishedAt)old.publishedAt=now;if(old.status==='draft')old.publishedAt=null;old.updatedAt=now;a[idx]=old;saveArticles(a);return send(res,200,old)
  }
  if(p==='/api/admin/stats'&&req.method==='GET'){if(!requireAuth(req,res))return;const a=readArticles();return send(res,200,{total:a.length,published:a.filter(x=>x.status==='published').length,drafts:a.filter(x=>x.status==='draft').length,views:a.reduce((s,x)=>s+(x.views||0),0)})}
  if(p==='/api/matches'&&req.method==='GET'){
    const requested=u.searchParams.get('date')||new Date().toISOString().slice(0,10);
    const compact=requested.replace(/-/g,'');
    const fallback=[
      ['Литванија','lt','Азербејџан','az','15:00','D2'],['Србија','rs','Холандија','nl','18:00','A2'],
      ['Данска','dk','Велс','gb-wls','18:00','A4'],['Австрија','at','Косово','xk','18:00','B3'],
      ['Гибралтар','gi','Андора','ad','18:00','D1'],['Германија','de','Грција','gr','20:45','A2'],
      ['Норвешка','no','Португалија','pt','20:45','A4'],['Израел','il','Република Ирска','ie','20:45','B3']
    ];
    const fallbackMatches=compact==='20260927'?fallback.map((x,i)=>({id:'unl-'+i,sport:'Фудбал',league:'UEFA Лига нации',home:{name:x[0],flag:x[1]},away:{name:x[2],flag:x[3]},time:x[4],dateLabel:'Денес',statusLabel:'Пред натпревар',group:x[5]})):[];
    const flagUrl=code=>code?`https://flagcdn.com/w160/${String(code).toLowerCase()}.png`:'';
    const mapSofa=events=>events.filter(e=>String(e?.tournament?.name||'').toLowerCase().includes('nations league')).map(e=>{
      const h=e.homeTeam||{}, a=e.awayTeam||{}, st=e.status||{};
      const state=st.type||'';
      const live=state==='inprogress'; const finished=state==='finished';
      const score=(live||finished)&&h.id&&a.id?`${h.current??h.normaltime??0} : ${a.current??a.normaltime??0}`:'';
      const label=live?`LIVE${st.period?` · ${st.period}`:''}`:finished?'ЗАВРШЕН':st.description||'Пред натпревар';
      const homeLogo=h.id?`https://api.sofascore.com/api/v1/team/${h.id}/image`:'';
      const awayLogo=a.id?`https://api.sofascore.com/api/v1/team/${a.id}/image`:'';
      return {id:String(e.id),sport:'Фудбал',league:e.tournament?.name||'UEFA Лига нации',home:{name:h.name||'—',logo:homeLogo,flag:h.country?.alpha2||''},away:{name:a.name||'—',logo:awayLogo,flag:a.country?.alpha2||''},time:e.startTimestamp?new Date(e.startTimestamp*1000).toLocaleTimeString('mk-MK',{hour:'2-digit',minute:'2-digit'}):'—',dateLabel:finished?'Денес':'Денес',statusLabel:label,score};
    });
    try{
      if(typeof fetch==='function'){
        // Primary provider: ESPN scoreboard. It exposes live scores, status and team logos.
        const url=`https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations-league/scoreboard?dates=${compact}&limit=100`;
        const rr=await fetch(url,{headers:{'User-Agent':'SIGNAL-Sport/1.0'},signal:AbortSignal.timeout(6500)});
        if(rr.ok){
          const j=await rr.json(); const events=Array.isArray(j.events)?j.events:[];
          const mapped=events.map(ev=>{const c=ev.competitions?.[0];const comps=c?.competitors||[];const home=comps.find(z=>z.homeAway==='home')||comps[0]||{};const away=comps.find(z=>z.homeAway==='away')||comps[1]||{};const status=c?.status||ev.status||{};const iso=ev.date||c?.date;const tm=iso?new Date(iso).toLocaleTimeString('mk-MK',{hour:'2-digit',minute:'2-digit'}):'—';const state=status.type?.state;const label=state==='in'?`LIVE ${status.displayClock||''}`:state==='post'?'ЗАВРШЕН':status.type?.shortDetail||'Пред натпревар';return {id:ev.id,sport:'Фудбал',league:ev.league?.name||'UEFA Лига нации',home:{name:home.team?.displayName||home.team?.name||'—',logo:home.team?.logo||home.team?.logos?.[0]?.href||'',flag:home.team?.abbreviation||''},away:{name:away.team?.displayName||away.team?.name||'—',logo:away.team?.logo||away.team?.logos?.[0]?.href||'',flag:away.team?.abbreviation||''},time:tm,dateLabel:'Денес',statusLabel:label,score:state==='post'||state==='in'?`${home.score??0} : ${away.score??0}`:''};});
          if(mapped.length)return send(res,200,mapped);
        }
      }
    }catch(e){console.log('ESPN provider fallback:',e.message)}
    try{
      // Secondary provider: SofaScore public scheduled-events feed. No API key is required.
      const rr=await fetch(`https://www.sofascore.com/api/v1/sport/football/scheduled-events/${requested}`,{headers:{'User-Agent':'SIGNAL-Sport/1.0'},signal:AbortSignal.timeout(6500)});
      if(rr.ok){const j=await rr.json();const mapped=mapSofa(Array.isArray(j.events)?j.events:[]);if(mapped.length)return send(res,200,mapped)}
    }catch(e){console.log('SofaScore provider fallback:',e.message)}
    return send(res,200,fallbackMatches);
  }
  if(p==='/api/admin/upload'&&req.method==='POST'){
    if(!requireAuth(req,res))return;const b=await parseBody(req);const m=String(b.data||'').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);if(!m)return send(res,400,{error:'Дозволени се JPG, PNG и WEBP.'});const ext=m[1]==='jpeg'?'jpg':m[1];const safe=slugify(String(b.name||'image').replace(/\.[^.]+$/,''));const file=Date.now()+'-'+safe+'.'+ext;const buf=Buffer.from(m[2],'base64');if(buf.length>10*1024*1024)return send(res,413,{error:'Сликата е преголема. Максимум 10MB.'});fs.writeFileSync(path.join(UPLOADS,file),buf);return send(res,201,{url:'/uploads/'+file})
  }
  return staticFile(req,res);
 }catch(e){console.error(e);return send(res,500,{error:'Server error'})}
});
server.listen(PORT,()=>console.log(`SIGNAL: http://localhost:${PORT}`));
