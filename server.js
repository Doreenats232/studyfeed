const express=require('express'),fs=require('fs');
const app=express();app.use(express.json({limit:'2mb'}));app.use(express.static('public'));
const F=process.env.DATA_FILE||'data.json',ADMIN=process.env.ADMIN_PASSWORD||'admin123';
let db={settings:{base:'https://relayapi-c5ah.onrender.com/v1',key:'',model:'gpt-4o'},posts:[],comments:[],notes:[],lastGen:'',schedules:[],seen:{}};
try{db={...db,...JSON.parse(fs.readFileSync(F))}}catch{}
const TU=(process.env.TURSO_URL||'').replace('libsql://','https://'),TT=process.env.TURSO_TOKEN;
const tq=async(sql,args=[])=>{const r=await fetch(TU+'/v2/pipeline',{method:'POST',headers:{Authorization:'Bearer '+TT,'Content-Type':'application/json'},body:JSON.stringify({requests:[{type:'execute',stmt:{sql,args:args.map(v=>({type:'text',value:v}))}},{type:'close'}]})});return (await r.json()).results[0].response?.result};
let st;const save=()=>{try{fs.writeFileSync(F,JSON.stringify(db))}catch{}if(TU&&TT){clearTimeout(st);st=setTimeout(()=>tq('INSERT OR REPLACE INTO kv(k,v) VALUES(?,?)',['db',JSON.stringify(db)]).catch(e=>console.log('turso',e.message)),800)}};
const isAdmin=r=>r.headers['x-admin']===ADMIN;
const SUBJECTS=['Mathematics','English','Physics','Chemistry','Biology','History','Geography','ICT'];
const id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
async function ai(prompt){
  const s={...db.settings};if(process.env.AI_API_KEY)s.key=process.env.AI_API_KEY;if(process.env.AI_BASE_URL)s.base=process.env.AI_BASE_URL;if(process.env.AI_MODEL)s.model=process.env.AI_MODEL;if(!s.key)throw Error('Set your API key in Settings');
  const r=await fetch(s.base.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.key},body:JSON.stringify({model:s.model,messages:[{role:'user',content:prompt}]})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error?.message||'AI error '+r.status);
  return j.choices[0].message.content;
}
const STYLE=()=>db.settings.style||'Scenario-based, competency-based questions matching the new competency-based lower secondary curriculum: a short real-life scenario, then a question that applies knowledge.';
async function makeQs(sub,n,extra){
  const old=db.posts.filter(p=>p.subject===sub&&p.type==='quiz').slice(-60).map(p=>p.text),nm=x=>x.toLowerCase().replace(/[^a-z0-9]/g,'');
  const t=await ai(`You write S3 ${sub} quiz questions. Style: ${STYLE()} ${extra||''} Write ${n} question(s), each on a different topic. Do NOT repeat or rephrase any of these: ${old.join(' | ')||'none'}. Reply ONLY JSON: [{"q":"scenario + question","a":"answer with brief explanation"}]`);
  let c=0;JSON.parse(t.match(/\[[\s\S]*\]/)[0]).slice(0,n).forEach(x=>{if(!x.q||old.some(o=>nm(o)===nm(x.q)))return;db.posts.push({id:id(),type:'quiz',subject:sub,text:x.q,answer:x.a,author:'StudyFeed AI',status:'approved',ts:Date.now()});c++});save();return c}
async function ytIds(q){const k=process.env.YT_API_KEY;
  if(k){const j=await(await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=10&q=${encodeURIComponent(q)}&key=${k}`)).json();return(j.items||[]).map(i=>[i.id.videoId,i.snippet.title])}
  const h=await(await fetch('https://www.youtube.com/results?search_query='+encodeURIComponent(q),{headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'en'}})).text();
  return [...new Set([...h.matchAll(/"videoId":"([\w-]{11})"/g)].map(m=>m[1]))].slice(0,10).map(i=>[i,''])}
async function addVideo(sub,q){const used=db.posts.map(p=>p.video||''),l=(await ytIds(q)).find(v=>!used.some(u=>u.includes(v[0])));if(!l)throw Error('No new video found');db.posts.push({id:id(),type:'video',subject:sub,text:'📺 '+(l[1]||q),video:'https://youtu.be/'+l[0],author:'StudyFeed',status:'approved',ts:Date.now()});save()}
async function generate(){const out=[];for(const sub of SUBJECTS){try{await makeQs(sub,2)}catch(e){out.push(sub+': '+e.message)}}db.lastGen=new Date().toISOString().slice(0,10);save();return out}
setInterval(async()=>{for(const s of db.schedules||[]){if(Date.now()-(s.last||0)<s.every*6e4)continue;s.last=Date.now();s.err='';save();try{for(const sub of s.subject==='All'?SUBJECTS:[s.subject])s.type==='video'?await addVideo(sub,s.prompt||sub+' S3 lesson'):await makeQs(sub,s.count||1,s.prompt)}catch(e){s.err=e.message;save()}}},3e4);
setInterval(()=>{if(db.settings.key&&db.lastGen!==new Date().toISOString().slice(0,10))generate()},36e5);
const pub=(p,u)=>({...p,answer:undefined,likes:undefined,hasAnswer:!!p.answer,nl:(p.likes||[]).length,liked:(p.likes||[]).includes(u),nc:db.comments.filter(c=>c.post===p.id).length});
const hash=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return Math.abs(h%1000)/1000};
app.get('/api/feed',(q,r)=>{const u=String(q.query.uid||''),seen=new Set((db.seen||{})[u]||[]),now=Date.now();
  const sc=p=>-(now-p.ts)/216e5+Math.log(1+(p.likes||[]).length)*2+hash(u+p.id)*4-(seen.has(p.id)?6:0);
  r.json(db.posts.filter(p=>p.status==='approved').map(p=>[sc(p),p]).sort((a,b)=>b[0]-a[0]).slice(0,150).map(x=>pub(x[1],u)))});
app.post('/api/seen',(q,r)=>{const u=String(q.body.uid||'');db.seen=db.seen||{};db.seen[u]=[...new Set([...(db.seen[u]||[]),...(q.body.ids||[]).slice(0,30)])].slice(-300);save();r.sendStatus(204)});
const A=f=>async(q,r)=>{if(!isAdmin(q))return r.sendStatus(401);try{r.json(await f(q))}catch(e){r.json({error:e.message})}};
app.post('/api/ai-post',A(async q=>({n:await makeQs(q.body.subject||'Mathematics',Math.min(+q.body.count||1,10),String(q.body.prompt||'').slice(0,800))})));
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
  db.posts.push({id:id(),type:b.type||'question',subject:b.subject||'General',text:String(b.text).slice(0,2000),answer:a?b.answer:'',video:b.video||'',author:a?'Admin':String(b.name||'anon').slice(0,30),uid:b.uid,status:a?'approved':'pending',ts:Date.now()});
  save();r.json({ok:1,pending:!a});
});
app.post('/api/posts/:id/like',(q,r)=>{const p=db.posts.find(x=>x.id===q.params.id);if(!p)return r.sendStatus(404);p.likes=p.likes||[];const i=p.likes.indexOf(q.body.uid);i<0?p.likes.push(q.body.uid):p.likes.splice(i,1);save();r.json({n:p.likes.length,liked:i<0})});
app.get('/api/pending',(q,r)=>isAdmin(q)?r.json(db.posts.filter(p=>p.status==='pending')):r.sendStatus(401));
app.post('/api/review/:id',(q,r)=>{
  if(!isAdmin(q))return r.sendStatus(401);const p=db.posts.find(x=>x.id===q.params.id);if(!p)return r.sendStatus(404);
  p.status=q.body.ok?'approved':'denied';
  if(p.uid)db.notes.push({id:id(),uid:p.uid,text:`Your post "${p.text.slice(0,40)}" was ${q.body.ok?'approved ✅':'denied ❌'}`,ts:Date.now()});
  save();r.json({ok:1});
});
app.get('/api/notes/:uid',(q,r)=>r.json(db.notes.filter(n=>n.uid===q.params.uid).sort((a,b)=>b.ts-a.ts)));
app.post('/api/explain',async(q,r)=>{try{r.json({text:await ai('Explain this simply for an S3 student:\n'+String(q.body.text).slice(0,1500))})}catch(e){r.status(500).json({error:e.message})}});
app.get('/api/settings',(q,r)=>{if(!isAdmin(q))return r.sendStatus(401);const s=db.settings;r.json({...s,key:s.key?'••••'+s.key.slice(-4):''})});
app.post('/api/settings',(q,r)=>{if(!isAdmin(q))return r.sendStatus(401);const b=q.body;if(b.base)db.settings.base=b.base;if(b.model)db.settings.model=b.model;if(b.key)db.settings.key=b.key;if(typeof b.style==='string')db.settings.style=b.style;save();r.json({ok:1})});
app.post('/api/test',async(q,r)=>{if(!isAdmin(q))return r.sendStatus(401);try{r.json({ok:1,reply:await ai('Reply with: OK')})}catch(e){r.json({ok:0,error:e.message})}});
app.post('/api/generate',async(q,r)=>{if(!isAdmin(q))return r.sendStatus(401);r.json({errors:await generate()})});
(async()=>{if(TU&&TT){try{await tq('CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v TEXT)');const x=await tq('SELECT v FROM kv WHERE k=?',['db']);if(x.rows.length)db={...db,...JSON.parse(x.rows[0][0].value)};console.log('Storage: Turso')}catch(e){console.log('turso',e.message)}}
app.listen(process.env.PORT||3000,()=>console.log('StudyFeed up'))})();
