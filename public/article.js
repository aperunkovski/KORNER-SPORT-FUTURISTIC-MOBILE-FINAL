const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const slug=new URLSearchParams(location.search).get('slug');
const fmt=d=>new Date(d).toLocaleString('mk-MK',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
const imageFallback='https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=2400&q=88';
function articleCard(x){return `<a class="side-news" href="/article.html?slug=${encodeURIComponent(x.slug)}"><img src="${esc(x.image||imageFallback)}" onerror="this.src='${imageFallback}'" alt=""><div><span>${esc(x.categoryName)}</span><b>${esc(x.title)}</b><small>${fmt(x.publishedAt)}</small></div></a>`}
(async()=>{
 try{
  const [rr,ar]=await Promise.all([fetch('/api/articles/'+encodeURIComponent(slug||'')),fetch('/api/articles')]);
  const a=await rr.json(); const all=await ar.json();
  if(!rr.ok) throw new Error('not found');
  document.title=`${a.title} — КОРНЕР`;
  const same=all.filter(x=>x.id!==a.id&&x.categoryId===a.categoryId);
  const related=(same.length?same:all.filter(x=>x.id!==a.id)).slice(0,4);
  const newest=all.filter(x=>x.id!==a.id).slice(0,5);
  const popular=[...all].filter(x=>x.id!==a.id).sort((x,y)=>(y.views||0)-(x.views||0)).slice(0,5);
  let paras=String(a.content||'').split(/\n+/).filter(Boolean);
  if(paras.length<4){
    paras=[...paras,
      `Овој натпревар е дел од пошироката спортска приказна која КОРНЕР ја следи низ целиот циклус. Во следниот период фокусот ќе биде на формата, резултатите и реакциите по секој нов натпревар.`,
      `Со новите дуели ќе стане појасно како тимовите ќе одговорат на досегашниот тек. На КОРНЕР ќе ги следите најважните моменти, резултатите и информациите поврзани со оваа тема.`
    ];
  }
  document.querySelector('#article').innerHTML=`
  <div class="article-layout reveal">
    <article class="article-main">
      <div class="article-meta"><span class="cat">${esc(a.categoryName)}</span><span>·</span><span>${fmt(a.publishedAt)}</span><span>·</span><span>${a.views||0} прегледи</span></div>
      <h1>${esc(a.title)}</h1>
      <p class="article-lead">${esc(a.excerpt)}</p>
      ${a.image?`<figure class="article-media"><img src="${esc(a.image)}" onerror="this.src='${imageFallback}'" alt="${esc(a.title)}"><figcaption>${esc(a.title)}</figcaption></figure>`:''}
      <div class="article-text">${paras.map(p=>`<p>${esc(p)}</p>`).join('')}</div>
      ${a.sourceUrl?`<div class="source">Извор: <a href="${esc(a.sourceUrl)}" target="_blank" rel="noopener">${esc(a.sourceName||a.sourceUrl)}</a></div>`:''}
      <section class="article-related"><div class="side-kicker">ПОВРЗАНО</div><h2>Уште од ${esc(a.categoryName||'спортот')}</h2><div class="related-grid">${related.map(x=>`<a class="related-card" href="/article.html?slug=${encodeURIComponent(x.slug)}"><img src="${esc(x.image||imageFallback)}" onerror="this.src='${imageFallback}'" alt=""><div><span>${esc(x.categoryName)}</span><b>${esc(x.title)}</b></div></a>`).join('')}</div></section>
    </article>
    <aside class="article-sidebar">
      <div class="sidebar-box"><div class="side-kicker">НАЈНОВИ</div><h3>Последни вести</h3>${newest.map(articleCard).join('')}</div>
      <div class="sidebar-box"><div class="side-kicker">НАЈЧИТАНО</div><h3>Во фокус</h3>${popular.map(articleCard).join('')}</div>
    </aside>
  </div>`;
  requestAnimationFrame(()=>document.querySelector('.reveal')?.classList.add('visible'));
 }catch(e){document.querySelector('#article').innerHTML='<div class="not-found"><h1>Веста не е пронајдена.</h1><a href="/">← Назад на почетна</a></div>'}
})();
