import {readFile,readdir,stat,open} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {setImmediate as yieldIO} from 'node:timers/promises';
import {extractUserPrompt,type RecoveredPrompt} from '../shared/prompt-attachments';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const SCAN_BYTES=4*1024*1024,MAX_LINE=8*1024*1024,CHUNK_BYTES=256*1024;
const locations=new Map<string,string>(),agentFiles=new Map<string,string>();
function remember(map:Map<string,string>,key:string,value:string){map.delete(key);map.set(key,value);if(map.size>200)map.delete(map.keys().next().value!);return value;}
interface Index {
 offset:number;mtime:number;identity:string;carry:Buffer;discarding:boolean;unsafeText:boolean;
 counts:Map<string,number>;prompts:RecoveredPrompt[];pending?:Promise<void>;hasMore:boolean;
}
const indexes=new Map<string,Index>();
function fresh():Index{return {offset:0,mtime:0,identity:'',carry:Buffer.alloc(0),discarding:false,unsafeText:false,counts:new Map(),prompts:[],hasMore:false};}
async function locate(agentId:string):Promise<string>{
 if(!UUID.test(agentId))throw Error('Invalid agent ID');
 const home=process.env.PASEO_HOME||join(homedir(),'.paseo'),agentKey=join(home,agentId);
 let agent:any;
 const known=agentFiles.get(agentKey);
 if(known)try{agent=JSON.parse(await readFile(known,'utf8'));}catch{agentFiles.delete(agentKey);}
 if(!agent){
  for(const dir of await readdir(join(home,'agents'),{withFileTypes:true})){
   if(!dir.isDirectory())continue;const candidate=join(home,'agents',dir.name,agentId+'.json');
   try{agent=JSON.parse(await readFile(candidate,'utf8'));remember(agentFiles,agentKey,candidate);break;}catch{}
  }
 }
 if(!agent)throw Error('Agent record unavailable');
 const session=agent.persistence?.sessionId;if(typeof session!=='string'||!UUID.test(session))throw Error('Session record unavailable');
 const root=agent.provider==='claude'?join(homedir(),'.claude','projects'):join(process.env.CODEX_HOME||join(homedir(),'.codex'),'sessions');
 const key=JSON.stringify([root,agent.provider,session]);if(locations.has(key))return locations.get(key)!;
 let path:string|undefined;
 if(agent.provider==='claude'){
  for(const dir of await readdir(root,{withFileTypes:true})){if(!dir.isDirectory())continue;const candidate=join(root,dir.name,session+'.jsonl');try{if((await stat(candidate)).isFile()){path=candidate;break;}}catch{}}
 }else if(agent.provider==='codex'){
  const files=await readdir(root,{recursive:true});const match=files.find(p=>p.endsWith('-'+session+'.jsonl'));if(match)path=join(root,match);
 }
 if(!path)throw Error('Provider history unavailable');return remember(locations,key,path);
}
const fingerprint=(text:string)=>createHash('sha256').update(text.trim()).digest('hex');
function consume(index:Index,line:Buffer){
 // Parse bounded complete records; metadata order is not guaranteed. A prefix
 // filter could miss user records and incorrectly certify text as unique.
 try{
  const prompt=extractUserPrompt(JSON.parse(line.toString('utf8')));if(!prompt)return;
  const hash=fingerprint(prompt.text);
  if(!index.counts.has(hash)&&index.counts.size>=20000)index.unsafeText=true;
  else index.counts.set(hash,Math.min(2,(index.counts.get(hash)??0)+1));
  prompt.files=prompt.files.filter(f=>resolve(f.path)===f.path&&(f.path.includes('/paseo-attachments-')||f.path.includes('/.paseo/uploads/')));
  if(prompt.files.length){index.prompts.push(prompt);if(index.prompts.length>200)index.prompts.shift();}
 }catch{index.unsafeText=true;}
}
/** Bounded, resumable scan: byte offsets count actual bytes, including CRLF/UTF-8. */
async function scan(path:string,index:Index){
 const info=await stat(path),identity=`${info.dev}:${info.ino}`;
 if(index.identity!==identity||info.size<index.offset||(info.size===index.offset&&info.mtimeMs!==index.mtime))Object.assign(index,fresh(),{pending:index.pending});
 index.identity=identity;
 const end=Math.min(info.size,index.offset+SCAN_BYTES);
 const file=await open(path,'r');
 try{
  const buffer=Buffer.alloc(CHUNK_BYTES);
  while(index.offset<end){
   const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,end-index.offset),index.offset);
   if(!bytesRead)break;
   index.offset+=bytesRead;
   let start=0;
   while(start<bytesRead){
    const newline=buffer.indexOf(10,start),stop=newline>=0&&newline<bytesRead?newline:bytesRead;
    if(!index.discarding){
     if(index.carry.length+stop-start>MAX_LINE){index.carry=Buffer.alloc(0);index.discarding=true;index.unsafeText=true;}
     else index.carry=Buffer.concat([index.carry,buffer.subarray(start,stop)]);
    }
    if(stop===bytesRead)break;
    if(!index.discarding)consume(index,index.carry);
    index.carry=Buffer.alloc(0);index.discarding=false;start=stop+1;
   }
   await yieldIO();
  }
 }finally{await file.close();}
 index.mtime=info.mtimeMs;index.hasMore=index.offset<info.size;
}
export async function recoverPromptAttachments(agentId:string){
 try{
  const path=await locate(agentId);let index=indexes.get(path);
  if(!index){index=fresh();indexes.set(path,index);}
  // Single flight is installed before stat/read, so concurrent calls cannot index twice.
  if(!index.pending){const task=scan(path,index);index.pending=task;void task.finally(()=>{if(index!.pending===task)index!.pending=undefined;}).catch(()=>{});}
  await index.pending;
  // Never evict a scan in progress. Inactive indexes are capped at 20 sessions.
  if(indexes.size>20)for(const [key,candidate] of indexes){if(key!==path&&!candidate.pending)indexes.delete(key);if(indexes.size<=20)break;}
  const complete=!index.hasMore&&!index.carry.length&&!index.discarding&&!index.unsafeText;
  return {prompts:index.prompts.map(p=>({...p,textUnique:complete&&!!p.text.trim()&&index!.counts.get(fingerprint(p.text))===1})),error:null,hasMore:index.hasMore};
 }catch(error){return {prompts:[],error:error instanceof Error?error.message:String(error),hasMore:false};}
}
