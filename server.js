const express=require('express'),fs=require('fs');
const app=express();app.use(express.json({limit:'2mb'}));app.use(express.static('public'));
const F=process.env.DATA_FILE||'data.json',ADMIN=process.env.ADMIN_PASSWORD||'admin123';
let db={settings:{base:'https://relayapi-c5ah.onrender.com/v1',key:'',model:'gpt-4o'},posts:[],comments:[],notes:[],lastGen:''};
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
async function generate(){
  const out=[],n=x=>x.toLowerCase().replace(/[^a-z0-9]/g,'');
  for(const sub of SUBJECTS){
    try{
      const old=db.posts.filter(p=>p.subject===sub&&p.type==='quiz').slice(-60).map(p=>p.text);
      const t=await ai(`Pick a random S3 (Term 1-3) ${sub} topic that differs from earlier ones. Write 2 short quiz questions. Do NOT repeat or rephrase any of these: ${old.join(' | ')||'none'}. Reply ONLY JSON: [{"q":"...","a":"answer with brief explanation"},{"q":"...","a":"..."}]`);
      JSON.parse(t.match(/\[[\s\S]*\]/)[0]).slice(0,2).forEach(x=>{if(old.some(o=>n(o)===n(x.q)))return;db.posts.push({id:id(),type:'quiz',subject:sub,text:x.q,answer:x.a,author:'StudyFeed AI',status:'approved',ts:Date.now()})});
    }catch(e){out.push(sub+': '+e.message)}
  }
  db.lastGen=new Date().toISOString().slice(0,10);save();return out;
}
setInterval(()=>{if(db.settings.key&&db.lastGen!==new Date().toISOString().slice(0,10))generate()},36e5);
const pub=(p,u)=>({...p,answer:undefined,likes:undefined,hasAnswer:!!p.answer,nl:(p.likes||[]).length,liked:(p.likes||[]).includes(u),nc:db.comments.filter(c=>c.post===p.id).length});
app.get('/api/feed',(q,r)=>r.json(db.posts.filter(p=>p.status==='approved').sort((a,b)=>b.ts-a.ts).slice(0,200).map(p=>pub(p,q.query.uid))));
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
app.post('/api/settings',(q,r)=>{if(!isAdmin(q))return r.sendStatus(401);const b=q.body;if(b.base)db.settings.base=b.base;if(b.model)db.settings.model=b.model;if(b.key)db.settings.key=b.key;save();r.json({ok:1})});
app.post('/api/test',async(q,r)=>{if(!isAdmin(q))return r.sendStatus(401);try{r.json({ok:1,reply:await ai('Reply with: OK')})}catch(e){r.json({ok:0,error:e.message})}});
app.post('/api/generate',async(q,r)=>{if(!isAdmin(q))return r.sendStatus(401);r.json({errors:await generate()})});
(async()=>{if(TU&&TT){try{await tq('CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v TEXT)');const x=await tq('SELECT v FROM kv WHERE k=?',['db']);if(x.rows.length)db={...db,...JSON.parse(x.rows[0][0].value)};console.log('Storage: Turso')}catch(e){console.log('turso',e.message)}}
app.listen(process.env.PORT||3000,()=>console.log('StudyFeed up'))})();
