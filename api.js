/* ===== MOCK API / DB LAYER (localStorage). Swap with fetch() to Express+MongoDB later.
   SECURITY LOGIC lives ONLY in API.* — UI never decides if attendance is valid. ===== */
const $=s=>document.querySelector(s),now=()=>Date.now(),fmt=t=>new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const rnd=()=>[...crypto.getRandomValues(new Uint8Array(9))].map(b=>b.toString(36).padStart(2,'0')).join('');
let DB;const save=()=>localStorage.setItem('sa_db',JSON.stringify(DB));
const SUBJ={DSA:92,DBMS:88,CN:84,OS:81,AI:90};
async function init(){try{DB=JSON.parse(localStorage.getItem('sa_db'))}catch(e){}
 if(DB&&DB.v===1)return;
 const U=(id,name,email,pw,role,sid,y)=>({id,name,email,pw,role,sid,dept:'CSE',year:y||'SY',div:'A',status:'Active'});
 const us=[U(1,'Rahul Patil','rahul@college.edu','student123','student','101'),U(2,'Amit Kumar','amit@college.edu','student123','student','102'),U(3,'Sneha Joshi','sneha@college.edu','student123','student','103'),U(4,'Rohit Jain','rohit@college.edu','student123','student','104'),U(5,'Prof. Sharma','sharma@college.edu','faculty123','faculty'),U(6,'System Administrator','admin@college.edu','admin123','admin')];
 for(const u of us){u.hash=await sha(u.pw);delete u.pw}
 const t=now()-36e5,ev=(s,e,r,m,rv)=>({id:rnd(),sid:s,type:e,risk:r,ts:t+m*6e4,rev:rv});
 DB={v:1,users:us,att:[],events:[ev('Rahul','Expired QR','Medium',32),ev('Amit','Multiple Login','High',35),ev('Rohit','Location mismatch','Medium',38)],logins:[],session:null,sess:null,hist:[]};
 const subs=Object.keys(SUBJ);for(let d=1;d<=6;d++)subs.forEach((s,i)=>DB.att.push({sid:'101',name:'Rahul Patil',sub:s,ts:now()-d*864e5+i*36e5,status:((d*i)%7==5||d*i==10)?'Absent':'Present',method:i%2?'Manual':'QR',ver:i%2?'Faculty':'Verified'}));
 save()}
const API={
 async login(id,pw,role){load();const h=await sha(pw),u=DB.users.find(u=>(u.email.toLowerCase()==String(id).toLowerCase()||(u.sid&&u.sid==id))&&u.role==role);
  if(!u||u.hash!==h)throw Error('Invalid credentials');if(u.status!=='Active')throw Error('Account deactivated');
  DB.logins.push({uid:u.id,t:now()});save();return u},
 tick(){const s=DB.session;if(!s)return;const n=now();
  if(n>=s.end){DB.hist.push(s);DB.session=null;save();return}
  const c=s.tokens[s.tokens.length-1];if(!c||n>=c.exp){const life=7000+Math.floor(Math.random()*2001);
   s.tokens.push({token:rnd(),at:n,exp:Math.min(n+life,s.end)});save()}},
 start(f){this.tick();const n=now();DB.session={id:rnd(),...f,start:n,end:n+45000,tokens:[]};save();this.tick()},
 /* Server-side validation: session active, token known, token fresh, not duplicate, user authenticated */
 scan(u,raw){const log=(type,risk)=>{DB.events.push({id:rnd(),sid:u.name,type,risk,ts:now(),rev:0});save()};
  if(!u||u.role!=='student')return{ok:0,msg:'Not authenticated as student'};
  let p;try{p=JSON.parse(raw)}catch(e){log('Malformed QR','Medium');return{ok:0,msg:'Invalid QR'}}
  this.tick();const s=DB.session;
  if(!s||s.id!==p.s){log('Expired QR','Medium');return{ok:0,title:'QR Expired ❌',msg:'Please scan the latest QR displayed by your faculty.'}}
  const t=s.tokens.find(x=>x.token===p.t);
  if(!t){log('Invalid token','High');return{ok:0,title:'QR Invalid ❌',msg:'Token not recognised.'}}
  if(now()>=t.exp){log('Expired QR (reused/shared?)','Medium');return{ok:0,title:'QR Expired ❌',msg:'Please scan the latest QR displayed by your faculty.'}}
  if(DB.att.some(a=>a.sess===s.id&&a.sid===u.sid))return{ok:0,title:'Already marked',msg:'Your attendance is already recorded.'};
  if(s.cls!==`${u.year}-${u.dept}`&&s.cls!=='SY-CSE'){log('Wrong class','Low');return{ok:0,msg:'Session is for a different class.'}}
  const r={sess:s.id,sid:u.sid,name:u.name,sub:s.sub,ts:now(),status:'Present',method:'QR',ver:'Verified'};DB.att.push(r);save();return{ok:1,r}}};
