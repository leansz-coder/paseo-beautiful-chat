import {it,expect,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,appendFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
vi.mock('node:os',async original=>({...await original<typeof import('node:os')>(),homedir:()=>process.env.TEST_RECOVERY_HOME!}));
import {recoverPromptAttachments} from '../server/prompt-attachments';
it('indexes only the selected agent session, reads appends, and retries incomplete trailing records',async()=>{
 const root=await mkdtemp(join(tmpdir(),'paseo-attachment-test-'));
 vi.stubEnv('TEST_RECOVERY_HOME',root);vi.stubEnv('PASEO_HOME',join(root,'.paseo'));
 const id='11111111-1111-1111-1111-111111111111',session='22222222-2222-2222-2222-222222222222';
 try{
  await mkdir(join(root,'.paseo/agents/project'),{recursive:true});await mkdir(join(root,'.claude/projects/project'),{recursive:true});
  await writeFile(join(root,'.paseo/agents/project',id+'.json'),JSON.stringify({provider:'claude',persistence:{sessionId:session}}));
  const path=join(root,'.claude/projects/project',session+'.jsonl');
  const record=(uuid:string)=>JSON.stringify({type:'user',uuid,message:{role:'user',content:[{type:'text',text:'sample '+uuid},{type:'text',text:'Uploaded file: a.csv\nPath: '+root+'/.paseo/uploads/one/a.csv\nMIME: text/csv\nSize: 100 bytes'}]}});
  await writeFile(path,record('first')+'\n');expect((await recoverPromptAttachments(id)).prompts).toHaveLength(1);
  const second=record('second');await appendFile(path,second.slice(0,30));expect((await recoverPromptAttachments(id)).prompts).toHaveLength(1);
  await appendFile(path,second.slice(30)+'\n');expect((await recoverPromptAttachments(id)).prompts).toHaveLength(2);
  expect((await recoverPromptAttachments('../unsafe')).error).toBe('Invalid agent ID');
 }finally{vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});}
});
async function fixture(run:(id:string,path:string,record:(text:string)=>string)=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'paseo-attachment-hardening-'));
 vi.stubEnv('TEST_RECOVERY_HOME',root);vi.stubEnv('PASEO_HOME',join(root,'.paseo'));
 const id='33333333-3333-3333-3333-333333333333',session='44444444-4444-4444-4444-444444444444';
 try{
  await mkdir(join(root,'.paseo/agents/project'),{recursive:true});await mkdir(join(root,'.claude/projects/project'),{recursive:true});
  await writeFile(join(root,'.paseo/agents/project',id+'.json'),JSON.stringify({provider:'claude',persistence:{sessionId:session}}));
  const path=join(root,'.claude/projects/project',session+'.jsonl');
  const record=(text:string)=>JSON.stringify({metadata:'x'.repeat(600),type:'user',message:{role:'user',content:[{type:'text',text},{type:'text',text:'Uploaded file: a.csv\nPath: '+root+'/.paseo/uploads/one/a.csv\nMIME: text/csv\nSize: 100 bytes'}]}});
  await run(id,path,record);
 }finally{vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});}
}
it('counts ordinary prompts too, so duplicate text cannot inherit an earlier upload',()=>fixture(async(id,path,record)=>{
 await writeFile(path,record('重复文字')+'\r\n');
 expect((await recoverPromptAttachments(id)).prompts[0]!.textUnique).toBe(true);
 await appendFile(path,JSON.stringify({type:'user',message:{role:'user',content:'重复文字'}})+'\r\n');
 expect((await recoverPromptAttachments(id)).prompts[0]!.textUnique).toBe(false);
}));
it('shares concurrent scans, resumes bounded pages, handles UTF-8, and resets after truncation',()=>fixture(async(id,path,record)=>{
 const noise=JSON.stringify({type:'assistant',message:{role:'assistant',content:'x'.repeat(600000)}})+'\n';
 await writeFile(path,record('第一条')+'\n'+noise.repeat(8)+record('最后一条')+'\n');
 const first=await Promise.all(Array.from({length:5},()=>recoverPromptAttachments(id)));
 expect(first.every(r=>r.hasMore&&r.prompts.length===1&&!r.prompts[0]!.textUnique)).toBe(true);
 const next=await recoverPromptAttachments(id);expect(next.hasMore).toBe(false);expect(next.prompts.map(p=>p.text)).toEqual(['第一条','最后一条']);expect(next.prompts.every(p=>p.textUnique)).toBe(true);
 await writeFile(path,record('替换日志')+'\n');const replaced=await recoverPromptAttachments(id);expect(replaced.prompts.map(p=>p.text)).toEqual(['替换日志']);expect(replaced.prompts[0]!.textUnique).toBe(true);
}));
it('does not claim uniqueness after an oversized or malformed record',()=>fixture(async(id,path,record)=>{
 await writeFile(path,record('sample')+'\n'+JSON.stringify({type:'user',message:{role:'user',content:'x'.repeat(9*1024*1024)}})+'\n{broken}\n');
 let result=await recoverPromptAttachments(id);while(result.hasMore)result=await recoverPromptAttachments(id);
 expect(result.prompts).toHaveLength(1);expect(result.prompts[0]!.textUnique).toBe(false);
}));
