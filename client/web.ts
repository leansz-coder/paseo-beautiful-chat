import { Platform } from 'react-native';
import type {RecoveredPrompt} from '../shared/prompt-attachments';
import { getEnhancerPreferences, subscribeEnhancerPreferences } from './preferences';
// Preserve Paseo's attachment cards, local file resolution and image lightbox.
// Styling the host bubble also works for messages whose attachment metadata is
// not exposed to plugin timeline transformers. No DOM rewrites or observers.
declare const document:Document;
export function presentationScopeForRow(element:unknown,hostId:string,agentId:string):string|null {
 if(Platform.OS!=='web'||typeof document==='undefined'||!(element instanceof HTMLElement))return null;
 const rowId=element.closest('[data-history-row-id]')?.getAttribute('data-history-row-id');
 return rowId?JSON.stringify([hostId,agentId,rowId]):null;
}
export function installNativePromptStyle():()=>void {
 if(Platform.OS!=='web'||typeof document==='undefined')return()=>{};
 const id='beautiful-chat-native-prompts';if(document.getElementById(id))return()=>{};
 const style=document.createElement('style');style.id=id;
 const update=()=>{style.textContent=`[role="dialog"]:has([data-bc-image-viewer]) { width:94vw !important; max-width:94vw !important; height:92vh !important; max-height:92vh !important; }`+(getEnhancerPreferences().enhancedUserBubble?`
 [data-testid="user-message"] > div:first-child > div:first-child {
   border-radius: 18px 8px 18px 18px !important;
   border: 1px solid rgba(132, 153, 221, .27) !important;
   background-image: linear-gradient(125deg, rgba(125, 148, 221, .10), rgba(107, 178, 175, .04)) !important;
   box-shadow: inset 0 1px 0 rgba(170, 190, 230, .04);
 }
 `:'');};
 update();document.head.appendChild(style);const unsubscribe=subscribeEnhancerPreferences(update);
 return()=>{unsubscribe();style.remove();disposeRecoveredPrompts();};
}

interface RecoveryOwner {agentId:string;release():void;refresh():void;retain():()=>void}
const recoveryOwners=new Map<HTMLElement,RecoveryOwner>();
/** Exact user-message matching only. Ambiguous repeated prompts remain native. */
export function matchRecoveredPrompt(prompts:RecoveredPrompt[],text:string,messageId:string|null):RecoveredPrompt|null {
 const exact=messageId?prompts.filter(p=>p.messageId===messageId):[];
 if(exact.length===1)return exact[0]!;
 if(exact.length>1||!text.trim())return null;
 // Provider IDs and Paseo row IDs can use different namespaces. Text fallback
 // needs proof of uniqueness across ALL raw user prompts, not just uploads.
 const matches=prompts.filter(p=>p.textUnique===true&&p.text.trim()===text.trim());
 return matches.length===1?matches[0]!:null;
}
export function attachRecoveredPrompts(element:unknown,agentId:string,load:()=>Promise<{prompts:RecoveredPrompt[];hasMore?:boolean;error?:string|null}>,loadImage:(path:string)=>Promise<{dataUri:string|null;error:string|null}>):()=>void {
 if(Platform.OS!=='web'||typeof document==='undefined'||!(element instanceof HTMLElement))return()=>{};
 const host=element.closest<HTMLElement>('[data-testid="agent-chat-scroll"]');if(!host)return()=>{};
 const existing=recoveryOwners.get(host);if(existing?.agentId===agentId){existing.refresh();return existing.retain();}existing?.release();
 let dead=false,pending=false,lastFetch=0,frame:number|null=null;let prompts:RecoveredPrompt[]=[];
 const inserted=new Set<HTMLElement>();const identities=new WeakMap<HTMLElement,string>();let overlay:HTMLElement|null=null;
 function close(){overlay?.remove();overlay=null;document.removeEventListener('keydown',escape);}
 function escape(e:KeyboardEvent){if(e.key==='Escape'){e.stopPropagation();close();}}
 async function show(path:string,name:string){
  close();const backdrop=document.createElement('div');backdrop.setAttribute('data-bc-recovery-overlay','true');backdrop.setAttribute('role','dialog');backdrop.setAttribute('aria-label',`图片预览：${name}`);backdrop.setAttribute('aria-modal','true');backdrop.style.cssText='position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.94);display:flex;flex-direction:column;padding:20px;gap:12px;color:#eee;box-sizing:border-box;font-family:system-ui,sans-serif';
  const controls=document.createElement('div');controls.style.cssText='display:flex;align-items:center;gap:12px;flex-shrink:0';
  const title=document.createElement('span');title.textContent=name;title.style.cssText='flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';controls.append(title);
  const pane=document.createElement('div');pane.style.cssText='flex:1;min-height:0;overflow:auto;display:grid;place-items:start center;grid-template-rows:minmax(0,1fr)';
  const image=document.createElement('img');image.alt=name;image.style.cssText='max-width:100%;max-height:100%;object-fit:contain';
  let zoom=1;
  const button=(label:string,action:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='background:#25312f;color:#e4ecea;border:1px solid #3e5651;border-radius:8px;padding:8px 12px;cursor:pointer';b.onclick=action;controls.append(b);};
  const resize=()=>{if(!image.naturalWidth||!image.naturalHeight)return;const fit=Math.min(pane.clientWidth/image.naturalWidth,pane.clientHeight/image.naturalHeight);image.style.maxWidth='none';image.style.maxHeight='none';image.style.width=`${image.naturalWidth*fit*zoom}px`;image.style.height=`${image.naturalHeight*fit*zoom}px`;};image.onload=resize;
  button('缩小',()=>{zoom=Math.max(1,zoom/2);resize();});button('放大',()=>{zoom=Math.min(8,zoom*2);resize();});button('适应窗口',()=>{zoom=1;resize();});button('关闭',close);
  const loading=document.createElement('span');loading.textContent='正在读取图片…';pane.append(loading);backdrop.append(controls,pane);document.body.append(backdrop);overlay=backdrop;document.addEventListener('keydown',escape);
  try{const result=await loadImage(path);if(dead||overlay!==backdrop)return;if(result.dataUri){loading.remove();pane.append(image);image.src=result.dataUri;}else loading.textContent=result.error||'图片文件不可用';}catch{loading.textContent='图片文件不可用';}
 }
 function render(){frame=null;if(dead||!host!.isConnected)return;
  for(const node of inserted)if(!node.isConnected)inserted.delete(node);
  const bubbles=Array.from(host!.querySelectorAll<HTMLElement>('[data-testid="user-message"]'));
  const visibleCounts=new Map<string,number>();
  for(const bubble of bubbles){const body=bubble.querySelector('[data-message-text]')?.textContent?.trim()||'';visibleCounts.set(body,(visibleCounts.get(body)??0)+1);}
  for(const bubble of bubbles){
   const previous=bubble.querySelector<HTMLElement>('[data-bc-recovered]');
   // Existing native attachments always win; only text-only bubbles need recovery.
   if(bubble.querySelector('img,[role="img"]')){if(previous){previous.remove();inserted.delete(previous);}continue;}
   const text=bubble.querySelector<HTMLElement>('[data-message-text]');if(!text)continue;
   const content=text.parentElement;if(!content)continue;
   // Native file cards may arrive after recovery. Never retain duplicate pills.
   if(Array.from(content.children).some(n=>n!==text&&n!==previous&&n.textContent?.trim())){if(previous){previous.remove();inserted.delete(previous);}continue;}
   const row=bubble.closest<HTMLElement>('[data-history-row-id]');
   const body=text.textContent||'',messageId=row?.getAttribute('data-message-id')||null;
   let record=matchRecoveredPrompt(prompts,body,messageId);
   if(record&&record.messageId!==messageId&&(visibleCounts.get(body.trim())??0)>1)record=null;
   const identity=record?JSON.stringify(record.files):null;
   if(previous){if(identity===identities.get(previous))continue;previous.remove();inserted.delete(previous);}
   if(!record)continue;
   const list=document.createElement('div');list.setAttribute('data-bc-recovered','true');list.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;min-height:32px';
   for(const f of record.files){const pill=document.createElement(f.image?'button':'span');if(f.image)(pill as HTMLButtonElement).type='button';pill.textContent=`${f.image?'▧ 图片':'▤ 文件'} · ${f.name}${f.bytes?` · ${Math.round(f.bytes/1024)} KB`:''}`;pill.setAttribute('title',f.path);pill.style.cssText='display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid rgba(130,164,211,.3);border-radius:8px;background:rgba(101,145,190,.1);color:inherit;padding:7px 10px;font:inherit;font-size:12px;text-align:left';if(f.image){pill.style.cursor='zoom-in';pill.setAttribute('aria-label',`查看上传图片：${f.name}`);pill.onclick=e=>{e.stopPropagation();void show(f.path,f.name);};}list.append(pill);}
   content.insertBefore(list,text);inserted.add(list);identities.set(list,identity!);
  }
 }
 function schedule(){if(frame===null&&!dead)frame=requestAnimationFrame(render);}
 async function refresh(){
  if(dead||pending||Date.now()-lastFetch<1500)return;pending=true;lastFetch=Date.now();
  try{
   let result=await load();
   while(!dead&&result.hasMore&&!result.error)result=await load();
   if(!dead&&!result.error){prompts=result.prompts;schedule();}
  }catch{}finally{pending=false;}
 }
 const observer=new MutationObserver(records=>{
  if(records.some(r=>{
   const target=r.target instanceof HTMLElement?r.target:r.target.parentElement;
   if(target?.closest('[data-bc-recovered]'))return false;
   if(r.type==='attributes')return !!target?.querySelector('[data-testid="user-message"]');
   if(r.type==='characterData')return !!target?.closest('[data-testid="user-message"]');
   return Array.from(r.addedNodes).some(n=>n instanceof HTMLElement&&!n.matches('[data-bc-recovered]')&&(n.matches('[data-testid="user-message"]')||!!n.querySelector('[data-testid="user-message"]')||!!target?.closest('[data-testid="user-message"]')))||!!target?.closest('[data-message-text]');
  }))schedule();
 });
 observer.observe(host,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-message-id']});
 const release=()=>{if(dead)return;dead=true;observer.disconnect();detachObserver?.disconnect();if(frame!==null)cancelAnimationFrame(frame);for(const n of inserted)n.remove();close();recoveryOwners.delete(host!);};
 // Virtualization can remove every assistant renderer while a user bubble is
 // still visible. Its recovered attachment must not disappear with those refs.
 let detachObserver:MutationObserver|null=null;
 let refs=0;const retain=()=>{refs++;detachObserver?.disconnect();detachObserver=null;let released=false;return()=>{
  if(released)return;released=true;if(--refs!==0)return;
  queueMicrotask(()=>{
   if(dead||refs!==0)return;
   if(!host!.isConnected){release();return;}
   detachObserver=new MutationObserver(()=>{if(!host!.isConnected){detachObserver?.disconnect();detachObserver=null;release();}});
   detachObserver.observe(document.body,{childList:true,subtree:true});
  });
 };};
 recoveryOwners.set(host,{agentId,release,refresh,retain});void refresh();return retain();
}
export function disposeRecoveredPrompts(){for(const owner of [...recoveryOwners.values()])owner.release();}
