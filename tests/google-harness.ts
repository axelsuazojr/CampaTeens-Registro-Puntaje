import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {createHash,createHmac,randomUUID} from 'node:crypto'
export function harness(){
 const tables:Record<string,any[][]>={};const scriptProperties:Record<string,string>={API_SECRET:'test-secret-'.repeat(4),SPREADSHEET_ID:'test-sheet',IMAGES_FOLDER_ID:'test-folder'}
 let locked=false,commits=0,failBefore=false,failAfter=false
 const context:any={console:{...console,error:()=>{}},Set,Date,JSON,Number,Math,Object,Array,Error,String,encodeURIComponent}
 vm.createContext(context)
 vm.runInContext(readFileSync(new URL('../apps-script/Core.js',import.meta.url),'utf8'),context)
 const sheets=()=>Object.keys(tables)
 const sheet=(name:string)=>({getSheetId:()=>sheets().indexOf(name)+1,getDataRange:()=>({getValues:()=>structuredClone(tables[name])}),getLastRow:()=>tables[name].length,getLastColumn:()=>Math.max(0,...tables[name].map(r=>r.length)),setFrozenRows:()=>{},getProtections:()=>[{}],getRange:(row:number,col:number,nr:number,nc:number)=>{const range={getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>tables[name][row+i-1]?.[col+j-1]??'')),setValues:(values:any[][])=>{for(let i=0;i<nr;i++){tables[name][row+i-1]??=[];for(let j=0;j<nc;j++)tables[name][row+i-1][col+j-1]=values[i][j]}return range},setFontWeight:()=>range,setBackground:()=>range};return range}})
 const ss={getId:()=>scriptProperties.SPREADSHEET_ID,getUrl:()=>'',getSheetByName:(name:string)=>tables[name]?sheet(name):null,insertSheet:(name:string)=>{tables[name]=[];return sheet(name)}}
 context.PropertiesService={getScriptProperties:()=>({getProperty:(k:string)=>scriptProperties[k],setProperty:(k:string,v:string)=>{scriptProperties[k]=v}})}
 context.SpreadsheetApp={openById:()=>ss,flush:()=>{},ProtectionType:{SHEET:'sheet'}}
 context.LockService={getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true},waitLock:()=>{if(locked)throw new Error('Busy');locked=true},hasLock:()=>locked,releaseLock:()=>{locked=false}})}
 context.Utilities={Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},getUuid:randomUUID,computeDigest:(_:string,s:string)=>[...createHash('sha256').update(s).digest()],computeHmacSha256Signature:(s:string,key:string)=>[...createHmac('sha256',key).update(s).digest()],base64EncodeWebSafe:(v:number[])=>Buffer.from(v).toString('base64url'),base64Encode:(v:number[])=>Buffer.from(v).toString('base64'),base64Decode:(s:string)=>[...Buffer.from(s,'base64')],newBlob:(bytes:number[],mime:string,name:string)=>({getBytes:()=>bytes,getContentType:()=>mime,name})}
 context.ContentService={MimeType:{JSON:'json'},createTextOutput:(text:string)=>({setMimeType:()=>text})}
 const files=new Map<string,any>()
 context.DriveApp={getFolderById:()=>({getFilesByName:(name:string)=>{const matches=[...files.values()].filter(x=>x.name===name);return {hasNext:()=>!!matches.length,next:()=>matches[0]}},createFile:(blob:any)=>{const id=randomUUID(),file={name:blob.name,getId:()=>id,getBlob:()=>blob};files.set(id,file);return file}}),getFileById:(id:string)=>files.get(id)}
 context.Sheets={Spreadsheets:{batchUpdate:({requests}:any)=>{
  if(!locked)throw new Error('Escritura sin bloqueo')
  if(failBefore){failBefore=false;throw new Error('Fallo antes de aplicar')}
  const copy=structuredClone(tables),names=sheets()
  const row=(r:any)=>r.values.map((v:any)=>v.userEnteredValue.stringValue??v.userEnteredValue.numberValue??v.userEnteredValue.boolValue)
  for(const req of requests){if(req.appendCells){const v=req.appendCells;copy[names[v.sheetId-1]].push(...v.rows.map(row))}else if(req.updateCells){const v=req.updateCells;copy[names[v.start.sheetId-1]][v.start.rowIndex]=row(v.rows[0])}else throw new Error('Solicitud no soportada')}
  for(const name of names)tables[name]=copy[name];commits++
  if(failAfter){failAfter=false;throw new Error('Confirmación perdida después de aplicar')}
 }}}
 vm.runInContext(readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context)
 const headers:Record<string,string[]>=context.HEADERS_
 for(const [name,h]of Object.entries(headers))tables[name]=[h]
 const add=(name:string,obj:Record<string,unknown>)=>tables[name].push(headers[name].map(h=>obj[h]??''))
 context.PuntoCore.DEFAULT_CATEGORIES.forEach((c:any)=>add('Categorias',c));
 add('Configuracion',{id:'categories_initialized',value:'true'});
 context.PuntoCore.TEAMS.forEach((t:any)=>add('Equipos',{id:t.id,name:t.name,image_id:''}))
 add('Jueces',{id:1,name:'Administración',email:'admin@example.com',role:'admin',active:true,password_hash:'a'.repeat(128),version:1,failed:0,locked_until:0})
 add('Jueces',{id:2,name:'Ana',email:'ana@example.com',role:'judge',active:true,password_hash:'b'.repeat(128),version:1,failed:0,locked_until:0})
 add('Jueces',{id:3,name:'Luis',email:'luis@example.com',role:'judge',active:true,password_hash:'c'.repeat(128),version:1,failed:0,locked_until:0})
 function request(action:string,data:any={},actor={id:2,version:1},options:{badSignature?:boolean;ts?:number}={}){
  const payload=JSON.stringify({action,data,actor}),ts=options.ts??Date.now(),signature=options.badSignature?'bad':createHmac('sha256',scriptProperties.API_SECRET).update(ts+'.'+payload).digest('base64url')
  return JSON.parse(context.doPost({postData:{contents:JSON.stringify({payload,ts,signature})}}))
 }
 const rows=(name:string)=>tables[name].slice(1).map(r=>Object.fromEntries(headers[name].map((h,i)=>[h,r[i]])))
 return {request,rows,add,context,files,tables,scriptProperties,get commits(){return commits},failBefore:()=>{failBefore=true},failAfter:()=>{failAfter=true},setBusy:(v:boolean)=>{locked=v}}
}
