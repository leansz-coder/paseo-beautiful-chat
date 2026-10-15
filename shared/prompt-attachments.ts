import {defineRpc} from '@getpaseo/plugin';
import {z} from 'zod';
export const attachmentSchema=z.object({name:z.string(),path:z.string(),image:z.boolean(),bytes:z.number().optional()});
export const recoveredPromptSchema=z.object({messageId:z.string().optional(),text:z.string(),files:z.array(attachmentSchema),textUnique:z.boolean().optional()});
export type RecoveredPrompt=z.infer<typeof recoveredPromptSchema>;
export const promptAttachmentsRpc=defineRpc({name:'prompt.attachments',input:z.object({agentId:z.string().uuid()}),output:z.object({prompts:z.array(recoveredPromptSchema),error:z.string().nullable(),hasMore:z.boolean().default(false)})});
/** Read only user content blocks; never infer an upload from assistant/tool output. */
export function extractUserPrompt(record:any):RecoveredPrompt|null {
 const p=record.type==='response_item'?record.payload:record.type==='user'?record.message:null;
 if(!p||p.role!=='user')return null;
 const content=typeof p.content==='string'?[{type:'text',text:p.content}]:p.content;
 if(!Array.isArray(content))return null;
 const files:RecoveredPrompt['files']=[];const text:string[]=[];
 for(const b of content){
  if(!['text','input_text'].includes(b.type)||typeof b.text!=='string')continue;
  const image=b.text.match(/^<image name=.+? path="([^"\n]+)">$/);
  const file=b.text.match(/^Uploaded file: ([^\n]+)\nPath: ([^\n]+)\nMIME: [^\n]+\nSize: (\d+) bytes$/);
  if(image)files.push({name:image[1].split('/').pop()||'图片',path:image[1],image:true});
  else if(file)files.push({name:file[1],path:file[2],image:/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(file[1]),bytes:Number(file[3])});
  else if(b.text!=='</image>')text.push(b.text);
 }
 const body=text.join('\n').trim();
 if(body.length>32768)return null;
 return {messageId:record.uuid??p.id??undefined,text:body,files};
}
export function extractUploadedPrompt(record:any):RecoveredPrompt|null {
 const prompt=extractUserPrompt(record);
 return prompt?.files.length?prompt:null;
}
