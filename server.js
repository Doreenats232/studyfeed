const express=require('express'),fs=require('fs');
const app=express();app.use(express.json({limit:'2mb'}));app.use(express.static('public'));
const F=process.env.DATA_FILE||'data.json',ADMIN=process.env.ADMIN_PASSWORD||'admin123';
let db={settings:{base:'https://relayapi-c5ah.onrender.com/v1',key:'',model:'gpt-4o'},posts:[],comments:[],notes:[],lastGen:'',schedules:[],seen:{}};
try{db={...db,...JSON.parse(fs.readFileSync(F))}}catch{}
const zlib=require('zlib');
const VU=(process.env.VAULT_URL||'https://terabox-vault-backend-1.onrender.com').replace(/\/$/,''),VK=process.env.VAULT_KEY;
const vs={ok:false,last:0,err:VK?'':'VAULT_KEY not set',file:''};let vDeg=false,vReady=!VK,vBusy=false,vDirty=false,vT;
const vf=(p,o={})=>fetch(VU+p,{...o,headers:{'X-Api-Key':VK,...(o.headers||{})}});
const vj=async(p,b)=>{const r=await vf(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}),t=await r.text();let j={};try{j=JSON.parse(t)}catch{}if(!r.ok)throw Error(p+' '+r.status+' '+t.slice(0,100));return j};
const vList=async()=>{const r=await vf('/v1/fs/list');if(!r.ok)throw Error('list '+r.status);const j=await r.json(),a=Array.isArray(j)?j:(j.files||j.items||j.list||j.entries||[]);return a.map(x=>String(x.name||x.filename||x.server_filename||x.path||x).split('/').pop()).filter(n=>/^studyfeed-db-\d+\.(json|bin)$/.test(n)).sort((a,b)=>a.match(/\d+/)[0]-b.match(/\d+/)[0])};
async function vaultSave(){if(!VK||!vReady)return;if(vBusy){vDirty=true;return}vBusy=true;
  try{const name=`studyfeed-db-${Date.now()}.bin`,fd=new FormData();fd.append('file',new Blob([zlib.gzipSync(JSON.stringify(db))],{type:'application/octet-stream'}),name);
    const r=await vf('/v1/upload',{method:'POST',body:fd});if(!r.ok)throw Error('upload '+r.status+' '+(await r.text()).slice(0,100));
    const l=await vList();if(!l.includes(name))throw Error('uploaded but not found in vault');await vGet(name).catch(e=>{throw Error('saved but cannot be read back: '+e.message)});
    vs.ok=true;vs.err='';vs.last=Date.now();vs.file=name;
    if(db.posts.length>=(vs.count||0))for(const o of l.slice(0,-10))await vj('/v1/fs/delete',{path:o,paths:[o]}).catch(()=>{});vs.count=db.posts.length;vs.files=l.length;
  }catch(e){vs.ok=false;vs.err=e.message}finally{vBusy=false;if(vDirty){vDirty=false;vaultSave()}}}
const save=()=>{try{fs.writeFileSync(F,JSON.stringify(db))}catch{}if(VK){clearTimeout(vT);vT=setTimeout(vaultSave,5000)}};
const vMerge=(a,b)=>{const u=(x,y)=>[...new Map([...(y||[]),...(x||[])].map(i=>[i.id,i])).values()];return{...a,...b,posts:u(a.posts,b.posts),comments:u(a.comments,b.comments),notes:u(a.notes,b.notes),schedules:u(a.schedules,b.schedules),settings:{...a.settings,...b.settings}}};
async function vGet(n){const s=await vj('/v1/fs/sign',{path:n,ttl:300}),u=/^https?:/.test(s.url)?s.url:VU+s.url,r=await fetch(u,{redirect:'follow'}),b=Buffer.from(await r.arrayBuffer());
  if(r.ok&&n.endsWith('.bin')){try{return JSON.parse(zlib.gunzipSync(b).toString())}catch{throw Error('perm: bad .bin ('+b.length+' bytes)')}}
  const t=b.toString().replace(/^\uFEFF/,'');
  if(!r.ok){try{const d=JSON.parse(t).detail;if(typeof d==='string')return JSON.parse(d)}catch{}throw Error((r.status===502?'perm: ':'')+`download ${r.status}: ${t.slice(0,80)}`)}
  try{return JSON.parse(t)}catch{throw Error('perm: not JSON ('+t.length+' bytes)')}}
async function vaultLoad(){if(!VK)return;try{const l=await vList();if(!l.length){vReady=true;vs.err='Empty vault, first save pending';return}let j,n,e1='',pa=true;for(const f of [...l].reverse()){try{j=await vGet(f);n=f;break}catch(e){if(!/^perm/.test(e.message))pa=false;e1=e1||('load '+f+': '+e.message)}}if(!j){if(pa){vReady=true;vs.err='Old saves unreadable (still in vault). '+e1;return}throw Error(e1)}db=vMerge(db,j);vReady=true;vs.ok=true;vs.err=e1;vs.file=n;vs.last=Date.now();vs.count=(db.posts||[]).length;vs.files=l.length}catch(e){vs.err=e.message}}
const isAdmin=r=>r.headers['x-admin']===ADMIN;
const SUBJECTS=['Mathematics','English','Physics','Chemistry','Biology','History','Geography','ICT'];
const id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
async function ai(prompt){
  const s={...db.settings};if(process.env.AI_API_KEY)s.key=process.env.AI_API_KEY;if(process.env.AI_BASE_URL)s.base=process.env.AI_BASE_URL;if(process.env.AI_MODEL)s.model=process.env.AI_MODEL;if(!s.key)throw Error('Set your API key in Settings');let bu=s.base.replace(/\/$/,'');if(!/\/v\d+$/.test(bu))bu+='/v1';
  const r=await fetch(bu+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.key},body:JSON.stringify({model:s.model,messages:[{role:'user',content:prompt}]})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Error((j.error?.message||j.message||'AI error')+' ['+r.status+' '+bu+'/chat/completions, model '+s.model+']');
  return j.choices[0].message.content;
}
const OKT=new Set(['svg','g','line','rect','circle','ellipse','polygon','polyline','path','text','tspan','defs','marker']),OKA=new Set(['x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','points','d','fill','stroke','stroke-width','stroke-dasharray','font-size','text-anchor','transform','viewBox','xmlns','marker-end','id','font-family','font-weight','opacity','markerWidth','markerHeight','refX','refY','orient','dx','dy']);
function cleanSvg(s){s=String(s||'').trim();if(!/^<svg[\s>]/i.test(s))return'';s=s.slice(0,6000).replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|foreignObject)[\s\S]*?<\/\1>/gi,'');
  s=s.replace(/<(\/?)([a-zA-Z]+)([^>]*)>/g,(m,sl,t,a)=>{t=t.toLowerCase();if(!OKT.has(t))return'';if(sl)return'</'+t+'>';let o='';for(const x of a.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)){const k=x[1],v=x[2];if(OKA.has(k)&&!/javascript|data:|url\((?!#)/i.test(v))o+=` ${k}="${v}"`}return'<'+t+o+(/\/\s*>$/.test(m)?'/':'')+'>'});
  if(!/viewBox=/.test(s))s=s.replace('<svg','<svg viewBox="0 0 400 240"');return s}
const STYLE=()=>db.settings.style||'Scenario-based, competency-based questions matching the new competency-based lower secondary curriculum: a short real-life scenario, then a question that applies knowledge.';
const job={running:false,label:'',total:0,done:0,made:0,errors:[],cur:''};
function runJob(label,items){if(job.running)throw Error('A job is already running, wait for it to finish');Object.assign(job,{running:true,label,total:items.length,done:0,made:0,errors:[],cur:''});(async()=>{for(const [name,fn] of items){job.cur=name;try{job.made+=await fn()}catch(e){job.errors.push(name+': '+e.message)}job.done++}job.running=false})()}
async function makeQs(sub,n,extra){
  const old=db.posts.filter(p=>p.subject===sub&&p.type==='quiz').slice(-60).map(p=>p.text),nm=x=>x.toLowerCase().replace(/[^a-z0-9]/g,'');
  const t=await ai(`You are a national examiner writing S3 ${sub} exam questions. Style: ${STYLE()} ${extra||''} Write ${n} question(s) in the format of a real printed exam paper: formal wording with command words (State, Name, Explain, Calculate, Describe). If a scenario helps, put it in "info" as support material: a short passage, a data table (rows separated by newlines, cells by |, first row = headings), or a described diagram. Marks 1-6. Add a "diagram" ONLY when it truly helps (circuit, windmill, rock cycle, triangle, graph axes, cell): a simple labelled SVG string, viewBox 0 0 400 240, black strokes on white, fill="none" for outlines, only line/rect/circle/ellipse/polygon/path/text, font-size 12, no scripts, no question answers in labels; otherwise empty. Each question on a different topic. Do NOT repeat or rephrase any of these: ${old.join(' | ')||'none'}. Reply ONLY JSON: [{"info":"support material or empty string","diagram":"optional simple SVG string or empty","q":"question","marks":3,"a":"mark scheme answer"}]`);
  let c=0;JSON.parse(t.match(/\[[\s\S]*\]/)[0]).slice(0,n).forEach(x=>{if(!x.q||old.some(o=>nm(o)===nm(x.q)))return;db.posts.push({id:id(),type:'quiz',subject:sub,no:db.posts.filter(p=>p.subject===sub&&p.type==='quiz').length+1,info:String(x.info||'').slice(0,1500),diagram:cleanSvg(x.diagram),marks:Math.min(+x.marks||2,6),text:x.q,answer:x.a,author:'StudyFeed AI',status:'approved',ts:Date.now()});c++});save();return c}
async function ytIds(q){const k=process.env.YT_API_KEY;
  if(k){const j=await(await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=10&q=${encodeURIComponent(q)}&key=${k}`)).json();return(j.items||[]).map(i=>[i.id.videoId,i.snippet.title])}
  const h=await(await fetch('https://www.youtube.com/results?search_query='+encodeURIComponent(q),{headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'en'}})).text();
  return [...new Set([...h.matchAll(/"videoId":"([\w-]{11})"/g)].map(m=>m[1]))].slice(0,10).map(i=>[i,''])}
async function addVideo(sub,q){const used=db.posts.map(p=>p.video||''),l=(await ytIds(q)).find(v=>!used.some(u=>u.includes(v[0])));if(!l)throw Error('No new video found');db.posts.push({id:id(),type:'video',subject:sub,text:'📺 '+(l[1]||q),video:'https://youtu.be/'+l[0],author:'StudyFeed',status:'approved',ts:Date.now()});save()}
function generate(){const it=[];for(const sub of SUBJECTS)for(let i=1;i<=2;i++)it.push([sub+' #'+i,()=>makeQs(sub,1)]);db.lastGen=new Date().toISOString().slice(0,10);save();runJob('Daily quizzes',it)}
setInterval(async()=>{for(const s of db.schedules||[]){if(Date.now()-(s.last||0)<s.every*6e4)continue;s.last=Date.now();s.err='';save();try{for(const sub of s.subject==='All'?SUBJECTS:[s.subject])s.type==='video'?await addVideo(sub,s.prompt||sub+' S3 lesson'):await makeQs(sub,s.count||1,s.prompt)}catch(e){s.err=e.message;save()}}},3e4);
setInterval(()=>{if((db.settings.key||process.env.AI_API_KEY)&&db.lastGen!==new Date().toISOString().slice(0,10))try{generate()}catch{}},36e5);
const pub=(p,u)=>({...p,uid:undefined,mine:!!u&&p.uid===u,answer:undefined,likes:undefined,hasAnswer:!!p.answer,nl:(p.likes||[]).length,liked:(p.likes||[]).includes(u),nc:db.comments.filter(c=>c.post===p.id).length});
app.use('/api',(q,r,n)=>VK&&!vReady&&!vDeg&&!q.path.startsWith('/storage')&&!(q.method==='GET'&&q.path==='/settings')?r.status(503).json({error:'loading'}):n());
const hash=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return Math.abs(h%1000)/1000};
app.get('/api/feed',(q,r)=>{const u=String(q.query.uid||''),seen=new Set((db.seen||{})[u]||[]),now=Date.now();
  const sc=p=>-(now-p.ts)/216e5+Math.log(1+(p.likes||[]).length)*2+hash(u+p.id)*4-(seen.has(p.id)?6:0);
  r.json(db.posts.filter(p=>p.status==='approved').map(p=>[sc(p),p]).sort((a,b)=>b[0]-a[0]).slice(0,150).map(x=>pub(x[1],u)))});
app.post('/api/seen',(q,r)=>{const u=String(q.body.uid||'');db.seen=db.seen||{};db.seen[u]=[...new Set([...(db.seen[u]||[]),...(q.body.ids||[]).slice(0,30)])].slice(-300);save();r.sendStatus(204)});
const A=f=>async(q,r)=>{if(!isAdmin(q))return r.sendStatus(401);try{r.json(await f(q))}catch(e){r.json({error:e.message})}};
app.post('/api/ai-post',A(async q=>{const sub=q.body.subject||'Mathematics',n=Math.min(+q.body.count||1,10),ex=String(q.body.prompt||'').slice(0,800);runJob('Questions',Array.from({length:n},(_,i)=>[sub+' #'+(i+1),()=>makeQs(sub,1,ex)]));return{started:1}}));
app.get('/api/job',A(async()=>job));
app.post('/api/video',A(async q=>{await addVideo(q.body.subject||'General',String(q.body.query||'').slice(0,200));return{ok:1}}));
app.get('/api/schedules',A(async()=>db.schedules||[]));
app.post('/api/schedules',A(async q=>{const b=q.body;db.schedules=db.schedules||[];db.schedules.push({id:id(),type:b.type==='video'?'video':'quiz',subject:b.subject||'All',every:Math.max(1,+b.every||60),count:Math.min(+b.count||1,5),prompt:String(b.prompt||'').slice(0,500),last:0});save();return{ok:1}}));
app.delete('/api/schedules/:id',A(async q=>{db.schedules=(db.schedules||[]).filter(s=>s.id!==q.params.id);save();return{ok:1}}));
app.get('/api/backup',A(async()=>db));
app.post('/api/restore',A(async q=>{db={...db,...q.body};save();return{ok:1}}));
app.get('/api/posts/:id/answer',(q,r)=>r.json({answer:(db.posts.find(p=>p.id===q.params.id)||{}).answer||''}));
app.get('/api/posts/:id/comments',(q,r)=>r.json(db.comments.filter(c=>c.post===q.params.id)));
app.post('/api/posts/:id/comments',(q,r)=>{const c={id:id(),post:q.params.id,name:String(q.body.name||'anon').slice(0,30),text:String(q.body.text||'').slice(0,500),ts:Date.now()};if(!c.text)return r.sendStatus(400);db.comments.push(c);save();r.json(c)});
app.post('/api/posts',(q,r)=>{
  const b=q.body,a=isAdmin(q);if(!b.text)return r.sendStatus(400);
  db.posts.push({id:id(),type:b.type||'question',subject:b.subject||'General',text:String(b.text).slice(0,2000),answer:a?b.answer:'',video:b.video||'',author:a?'Admin':String(b.name||'anon').slice(0,30),uid:b.uid,pin:!!b.pin&&(b.type||'question')!=='quiz',status:a?'approved':'pending',ts:Date.now()});
  save();r.json({ok:1,pending:!a});
});
app.post('/api/posts/:id/like',(q,r)=>{const p=db.posts.find(x=>x.id===q.params.id);if(!p)return r.sendStatus(404);p.likes=p.likes||[];const i=p.likes.indexOf(q.body.uid);i<0?p.likes.push(q.body.uid):p.likes.splice(i,1);save();r.json({n:p.likes.length,liked:i<0})});
app.post('/api/posts/:id/explain',async(q,r)=>{const p=db.posts.find(x=>x.id===q.params.id);if(!p)return r.sendStatus(404);
  if(p.pin&&p.explain)return r.json({text:p.explain,pinned:true});
  try{const t=await ai('Explain this simply for an S3 student:\n'+[p.info,p.text,p.video?'(video: '+p.video+')':''].join('\n').slice(0,1800));
    if(p.pin&&p.type!=='quiz'){p.explain=t;save();return r.json({text:t,pinned:true})}
    r.json({text:t,pinned:false})}catch(e){r.status(500).json({error:e.message})}});
app.post('/api/posts/:id/pin',(q,r)=>{const p=db.posts.find(x=>x.id===q.params.id);if(!p)return r.sendStatus(404);if(p.type==='quiz')return r.status(400).json({error:'Quizzes cannot be pinned'});if(!(isAdmin(q)||(p.uid&&p.uid===q.body.uid)))return r.sendStatus(403);p.pin=!!q.body.pin;if(!p.pin)delete p.explain;save();r.json({ok:1,pin:p.pin})});
app.get('/api/pending',(q,r)=>isAdmin(q)?r.json(db.posts.filter(p=>p.status==='pending')):r.sendStatus(401));
app.post('/api/review/:id',(q,r)=>{
  if(!isAdmin(q))return r.sendStatus(401);const p=db.posts.find(x=>x.id===q.params.id);if(!p)return r.sendStatus(404);
  p.status=q.body.ok?'approved':'denied';
  if(p.uid)db.notes.push({id:id(),uid:p.uid,text:`Your post "${p.text.slice(0,40)}" was ${q.body.ok?'approved ✅':'denied ❌'}`,ts:Date.now()});
  save();r.json({ok:1});
});
app.get('/api/notes/:uid',(q,r)=>r.json(db.notes.filter(n=>n.uid===q.params.uid).sort((a,b)=>b.ts-a.ts)));
app.post('/api/explain',async(q,r)=>{try{r.json({text:await ai('Explain this simply for an S3 student:\n'+String(q.body.text).slice(0,1500))})}catch(e){r.status(500).json({error:e.message})}});
app.get('/api/settings',(q,r)=>{if(!isAdmin(q))return r.sendStatus(401);const s=db.settings;r.json({...s,key:process.env.AI_API_KEY?'••••(from Render env)':s.key?'••••'+s.key.slice(-4):''})});
app.post('/api/settings',(q,r)=>{if(!isAdmin(q))return r.sendStatus(401);const b=q.body;if(b.base)db.settings.base=b.base;if(b.model)db.settings.model=b.model;if(b.key)db.settings.key=b.key;if(typeof b.style==='string')db.settings.style=b.style;save();r.json({ok:1})});
app.post('/api/test',async(q,r)=>{if(!isAdmin(q))return r.sendStatus(401);try{r.json({ok:1,reply:await ai('Reply with: OK')})}catch(e){r.json({ok:0,error:e.message})}});
app.post('/api/generate',A(async()=>{generate();return{started:1}}));
app.get('/api/storage',A(async()=>({...vs,configured:!!VK,ready:vReady})));
app.post('/api/storage/recover',A(async()=>{const l=await vList();let best=null,bn=-1,name='',e1='';for(const n of l){try{const j=await vGet(n);if((j.posts||[]).length>bn){best=j;bn=j.posts.length;name=n}}catch(e){e1=e1||e.message}}if(!best)throw Error(`No readable versions (${l.length} found). ${e1}`);db={...db,...best};vReady=true;vs.count=bn;save();return{restored:name,posts:bn,versions:l.length}}));
app.get('/api/storage/status',(q,r)=>r.json({ready:vReady,err:vs.err}));
app.post('/api/storage/test',A(async()=>{const o=[],name='studyfeed-test-'+Date.now()+'.bin',T=async(n,f)=>{try{o.push('✅ '+n+': '+await f())}catch(e){o.push('❌ '+n+': '+e.message)}};
 await T('list',async()=>{const r=await vf('/v1/fs/list');return r.status+' '+(await r.text()).slice(0,200)});
 await T('upload',async()=>{const fd=new FormData();fd.append('file',new Blob([zlib.gzipSync('{"ok":1}')],{type:'application/octet-stream'}),name);const r=await vf('/v1/upload',{method:'POST',body:fd});return r.status+' '+(await r.text()).slice(0,200)});
 await T('list after',async()=>{const r=await vf('/v1/fs/list');return (await r.text()).slice(0,300)});
 let u;await T('sign',async()=>{const s=await vj('/v1/fs/sign',{path:name,ttl:120});u=s.url;return JSON.stringify(s).slice(0,160)});
 if(u)await T('download',async()=>{const r=await fetch(/^https?:/.test(u)?u:VU+u),t=await r.text();return r.status+' '+(r.headers.get('content-type')||'')+' '+t.length+' bytes: '+t.slice(0,60)});
 await T('readback',async()=>JSON.stringify(await vGet(name)));
 await T('delete',async()=>JSON.stringify(await vj('/v1/fs/delete',{path:name,paths:[name]})).slice(0,120));
 o.push('app sees: '+JSON.stringify(await vList().catch(e=>e.message))+' | ready='+vReady+' | err='+vs.err);return{steps:o}}));
app.post('/api/storage/save',A(async()=>{await vaultSave();return{...vs}}));
(async()=>{await vaultLoad();if(VK&&!vReady)setTimeout(()=>{if(!vReady)vDeg=true},9e4);if(VK&&!vReady)setInterval(()=>{if(!vReady)vaultLoad()},15e3);app.listen(process.env.PORT||3000,()=>console.log('StudyFeed up, vault '+(VK?'on':'off')))})();
