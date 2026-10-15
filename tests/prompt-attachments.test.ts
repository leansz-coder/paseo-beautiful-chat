import {it,expect} from 'vitest';
import {extractUploadedPrompt} from '../shared/prompt-attachments';
it('recovers file metadata only from a structured user upload, never tool or assistant claims',()=>{
 const message={role:'user',content:[{type:'text',text:'sample'},{type:'text',text:'Uploaded file: sample.csv\nPath: /home/me/.paseo/uploads/upload-1/sample.csv\nMIME: text/csv\nSize: 100 bytes'}]};
 expect(extractUploadedPrompt({type:'user',uuid:'u1',message})).toMatchObject({messageId:'u1',text:'sample',files:[{name:'sample.csv',image:false,bytes:100}]});
 expect(extractUploadedPrompt({type:'assistant',message})).toBeNull();
 expect(extractUploadedPrompt({type:'user',message:{...message,role:'assistant'}})).toBeNull();
});
it('recovers Codex image wrappers without returning image bytes or altering ordinary text',()=>{
 const result=extractUploadedPrompt({type:'response_item',payload:{role:'user',content:[{type:'input_text',text:'look here'},{type:'input_text',text:'<image name=[Image #1] path="/tmp/paseo-attachments-1/a.png">'},{type:'input_image',image_url:'data:image/png;base64,SECRET'},{type:'input_text',text:'</image>'}]}});
 expect(result).toEqual({messageId:undefined,text:'look here',files:[{name:'a.png',path:'/tmp/paseo-attachments-1/a.png',image:true}]});expect(JSON.stringify(result)).not.toContain('SECRET');
});
