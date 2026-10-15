// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
vi.mock('react-native',()=>({Platform:{OS:'web'}}));
import {attachRecoveredPrompts,disposeRecoveredPrompts,matchRecoveredPrompt} from '../client/web';
const p={text:'sample',textUnique:true,files:[{name:'sample.csv',path:'/tmp/sample.csv',image:false}]};
it('refuses ambiguous repeated messages',()=>{expect(matchRecoveredPrompt([p,p],'sample',null)).toBeNull();expect(matchRecoveredPrompt([{...p,messageId:'id'}],'sample','id')?.files).toHaveLength(1);});
it('adds missing metadata only in the correct chat and cleans up without changing message text',async()=>{
 document.body.innerHTML='<main data-testid="agent-chat-scroll"><div data-history-row-id="one"><div data-testid="user-message"><div><div><span data-message-text="true">sample</span></div></div></div><span id="anchor"></span></div></main><aside data-testid="user-message">sample</aside>';
 vi.stubGlobal('requestAnimationFrame',(f:()=>void)=>{f();return 1;});vi.stubGlobal('cancelAnimationFrame',()=>{});
 const loadImage=vi.fn();attachRecoveredPrompts(document.getElementById('anchor'),'agent',async()=>({prompts:[p]}),loadImage);await new Promise(r=>setTimeout(r,0));
 expect(document.querySelectorAll('[data-bc-recovered]').length).toBe(1);expect(document.querySelector('[data-message-text]')?.textContent).toBe('sample');expect(loadImage).not.toHaveBeenCalled();
 disposeRecoveredPrompts();expect(document.querySelector('[data-bc-recovered]')).toBeNull();expect(document.querySelector('[data-message-text]')?.textContent).toBe('sample');vi.unstubAllGlobals();
});
it('keeps attachments when assistant renderers leave the viewport; cleans up after the chat detaches',async()=>{
 document.body.innerHTML='<main data-testid="agent-chat-scroll"><div data-history-row-id="one"><div data-testid="user-message"><div><span data-message-text="true">sample</span></div></div><span id="anchor"></span></div></main>';
 vi.stubGlobal('requestAnimationFrame',(f:()=>void)=>{f();return 1;});vi.stubGlobal('cancelAnimationFrame',()=>{});
 const load=vi.fn(async()=>({prompts:[p]}));
 const release=attachRecoveredPrompts(document.getElementById('anchor'),'agent',load,vi.fn());
 await new Promise(r=>setTimeout(r,0));
 const original=document.querySelector('[data-bc-recovered]');expect(original).not.toBeNull();
 release();await Promise.resolve();
 expect(document.querySelector('[data-bc-recovered]')).toBe(original);
 const releaseAgain=attachRecoveredPrompts(document.getElementById('anchor'),'agent',load,vi.fn());
 expect(document.querySelector('[data-bc-recovered]')).toBe(original);expect(load).toHaveBeenCalledTimes(1);
 releaseAgain();await Promise.resolve();document.querySelector('main')!.remove();await Promise.resolve();
 expect(original!.parentElement).toBeNull();disposeRecoveredPrompts();vi.unstubAllGlobals();
});
it('requires verified full-history uniqueness for text fallback and never guesses an empty image-only prompt',()=>{
 expect(matchRecoveredPrompt([{...p,textUnique:undefined,messageId:'earlier'}],'sample','later')).toBeNull();
 expect(matchRecoveredPrompt([{...p,textUnique:false}],'sample',null)).toBeNull();
 expect(matchRecoveredPrompt([{...p,text:''}],'',null)).toBeNull();
 expect(matchRecoveredPrompt([{...p,textUnique:false,messageId:'exact'}],'sample','exact')?.files).toHaveLength(1);
});
it('continues partial scans before rendering, and removes recovery when a recycled row no longer matches',async()=>{
 document.body.innerHTML='<main data-testid="agent-chat-scroll"><div data-history-row-id="one"><div data-testid="user-message"><div><span data-message-text="true">sample</span></div></div><span id="anchor"></span></div></main>';
 vi.stubGlobal('requestAnimationFrame',(f:()=>void)=>setTimeout(f,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 const load=vi.fn().mockResolvedValueOnce({prompts:[p],hasMore:true}).mockResolvedValue({prompts:[p],hasMore:false});
 attachRecoveredPrompts(document.getElementById('anchor'),'agent',load,vi.fn());await new Promise(r=>setTimeout(r,20));
 expect(load).toHaveBeenCalledTimes(2);expect(document.querySelector('[data-bc-recovered]')).not.toBeNull();
 document.querySelector('[data-message-text]')!.textContent='a different message';await new Promise(r=>setTimeout(r,20));
 expect(document.querySelector('[data-bc-recovered]')).toBeNull();disposeRecoveredPrompts();vi.unstubAllGlobals();
});
it('does not attach one text-matched file to two visible bubbles',async()=>{
 const bubble='<div data-testid="user-message"><div><span data-message-text="true">sample</span></div></div>';
 document.body.innerHTML='<main data-testid="agent-chat-scroll">'+bubble+bubble+'<span id="anchor"></span></main>';
 vi.stubGlobal('requestAnimationFrame',(f:()=>void)=>setTimeout(f,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 attachRecoveredPrompts(document.getElementById('anchor'),'agent',async()=>({prompts:[p]}),vi.fn());await new Promise(r=>setTimeout(r,20));
 expect(document.querySelector('[data-bc-recovered]')).toBeNull();disposeRecoveredPrompts();vi.unstubAllGlobals();
});
it('replaces recovered pills with later native attachment cards and ignores assistant streaming changes',async()=>{
 document.body.innerHTML='<main data-testid="agent-chat-scroll"><div data-history-row-id="one"><div data-testid="user-message"><div id="content"><span data-message-text="true">sample</span></div></div></div><div data-history-row-id="assistant"><span id="anchor">reply</span></div></main>';
 const raf=vi.fn((f:()=>void)=>setTimeout(f,0));vi.stubGlobal('requestAnimationFrame',raf);vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 attachRecoveredPrompts(document.getElementById('anchor'),'agent',async()=>({prompts:[p]}),vi.fn());await new Promise(r=>setTimeout(r,20));expect(document.querySelector('[data-bc-recovered]')).not.toBeNull();
 raf.mockClear();document.getElementById('anchor')!.firstChild!.textContent='streaming reply';await new Promise(r=>setTimeout(r,20));expect(raf).not.toHaveBeenCalled();
 const native=document.createElement('span');native.textContent='Native file card';document.getElementById('content')!.prepend(native);await new Promise(r=>setTimeout(r,20));
 expect(document.querySelector('[data-bc-recovered]')).toBeNull();expect(native.isConnected).toBe(true);disposeRecoveredPrompts();vi.unstubAllGlobals();
});
