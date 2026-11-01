/** Only this project writes the spreadsheet. Do not clone it for individual judges. */
var HEADERS_={
 Equipos:['id','name','image_id'],
 Jueces:['id','name','email','role','active','password_hash','version','failed','locked_until'],
 Juegos:['id','name','created_by','created_at','award_operation'],
 Movimientos:['id','operation_id','team_slug','delta','reason','judge_id','judge_name','round_id','reversal_of','created_at','category_id','category_label'],
 Operaciones:['id','digest','actor_id','action','created_at'],
 Categorias:['id','label','kind','suggested_points','active','version'],
 Configuracion:['id','value']
};
function props_(){return PropertiesService.getScriptProperties();}
function hash_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');}
function equal_(a,b){a=String(a);b=String(b);var d=a.length^b.length;for(var i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
function json_(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);}
function spreadsheet_(){var id=props_().getProperty('SPREADSHEET_ID');if(!id)PuntoCore.fail('Ejecuta configurarCampaTeens primero.',503);return SpreadsheetApp.openById(id);}
function read_(ss){var result={};Object.keys(HEADERS_).forEach(function(name){var sheet=ss.getSheetByName(name);if(!sheet)throw new Error('Falta la hoja '+name);var rows=sheet.getDataRange().getValues();if(JSON.stringify(rows[0])!==JSON.stringify(HEADERS_[name]))throw new Error('No cambies los encabezados de '+name);result[name]=rows.slice(1).map(function(r,i){var o={_row:i+2};HEADERS_[name].forEach(function(h,j){o[h]=r[j];});return o;}).filter(function(o){return o.id!=='';});});return result;}
function cell_(v){return {userEnteredValue:typeof v==='boolean'?{boolValue:v}:typeof v==='number'?{numberValue:v}:{stringValue:String(v==null?'':v)}};}
function values_(name,obj){return {values:HEADERS_[name].map(function(h){return cell_(obj[h]);})};}
function commit_(ss,plan){
 var requests=[];
 Object.keys(plan.append||{}).forEach(function(name){if(plan.append[name].length)requests.push({appendCells:{sheetId:ss.getSheetByName(name).getSheetId(),rows:plan.append[name].map(function(r){return values_(name,r);}),fields:'userEnteredValue'}});});
 (plan.update||[]).forEach(function(u){requests.push({updateCells:{start:{sheetId:ss.getSheetByName(u.table).getSheetId(),rowIndex:u.row-1,columnIndex:0},rows:[values_(u.table,u.values)],fields:'userEnteredValue'}});});
 if(requests.length){Sheets.Spreadsheets.batchUpdate({requests:requests},ss.getId());SpreadsheetApp.flush();}
}
function login_(ss,db,data){
 var email=String(data.email||'').trim().toLowerCase(),u=db.Jueces.find(function(x){return x.email===email;}),now=Date.now();
 if(!u||u.active!==true)PuntoCore.fail('Correo o contraseña incorrectos.',401);
 if(Number(u.locked_until)>now)PuntoCore.fail('Espera 10 minutos antes de volver a intentar.',429);
 var valid=equal_(data.proof,u.password_hash),patch;
 if(valid)patch={failed:0,locked_until:0};
 else {var attempts=Number(u.locked_until)>0?1:Number(u.failed||0)+1;patch={failed:attempts,locked_until:attempts>=5?now+600000:0};}
 commit_(ss,{update:[{table:'Jueces',row:u._row,values:Object.assign({},u,patch)}]});
 if(!valid)PuntoCore.fail('Correo o contraseña incorrectos.',401);
 return {id:Number(u.id),name:u.name,role:u.role,version:Number(u.version)};
}
function storeImage_(data,digest){
 var folder=DriveApp.getFolderById(props_().getProperty('IMAGES_FOLDER_ID'));
 var name='campateens-'+data.operationId+'-'+digest.slice(0,20)+'.webp',existing=folder.getFilesByName(name);
 if(existing.hasNext())return existing.next().getId();
 var bytes=Utilities.base64Decode(data.base64);if(bytes.length>2*1024*1024)PuntoCore.fail('Imagen demasiado grande.');
 return folder.createFile(Utilities.newBlob(bytes,'image/webp',name)).getId();
}
function doPost(e){
 var lock;
 try{
  if(!e||!e.postData||e.postData.contents.length>3000000)PuntoCore.fail('Solicitud inválida.');
  var envelope=JSON.parse(e.postData.contents),secret=props_().getProperty('API_SECRET');
  if(!secret||secret.length<32)PuntoCore.fail('Configura API_SECRET.',503);
  if(typeof envelope.payload!=='string'||!Number.isFinite(envelope.ts)||Math.abs(Date.now()-envelope.ts)>120000)PuntoCore.fail('Solicitud expirada.',401);
  var sig=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(envelope.ts+'.'+envelope.payload,secret,Utilities.Charset.UTF_8)).replace(/=+$/,'');
  if(!equal_(sig,envelope.signature))PuntoCore.fail('Solicitud no autorizada.',401);
  var request=JSON.parse(envelope.payload);
  lock=LockService.getScriptLock();if(!lock.tryLock(12000))PuntoCore.fail('Hay otros registros en curso. Reintenta este mismo envío.',503);
  var ss=spreadsheet_(),db=read_(ss),result;
  if(request.action==='login')result=login_(ss,db,request.data||{});
  else {
   var plan=PuntoCore.execute(request.action,request.data||{},request.actor||{},db,{now:function(){return new Date().toISOString();},uuid:function(){return Utilities.getUuid();},hash:hash_,storeImage:storeImage_});
   commit_(ss,plan);result=plan.result;
   if((request.action==='image-read'||request.action==='logo-read')){
    var file=DriveApp.getFileById(result.fileId),blob=file.getBlob();result={base64:Utilities.base64Encode(blob.getBytes()),mime:blob.getContentType()};
   }
  }
  return json_({ok:true,data:result});
 }catch(error){if(!error.status)console.error(String(error));return json_({ok:false,status:error.status||503,error:error.status?error.message:'No se pudo confirmar el registro. Reintenta la misma solicitud.'});}
 finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
function doGet(){return json_({ok:false,status:405,error:'Usa la aplicación campaTeens.'});}
/** Run once from the Apps Script editor after setting the script properties. */
function configurarCampaTeens(){
 var p=props_(),email=String(p.getProperty('ADMIN_EMAIL')||'').trim().toLowerCase(),hash=p.getProperty('ADMIN_HASH');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[0-9a-f]{128}$/.test(hash||''))throw new Error('Configura ADMIN_EMAIL y ADMIN_HASH con google:config.');
 if((p.getProperty('API_SECRET')||'').length<32)throw new Error('Configura API_SECRET.');
 var lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  var sid=p.getProperty('SPREADSHEET_ID'),ss=sid?SpreadsheetApp.openById(sid):SpreadsheetApp.create('campaTeens · Control de puntajes');p.setProperty('SPREADSHEET_ID',ss.getId());
  if(!p.getProperty('IMAGES_FOLDER_ID'))p.setProperty('IMAGES_FOLDER_ID',DriveApp.createFolder('campaTeens · Imágenes de equipos').getId());
  Object.keys(HEADERS_).forEach(function(name){var s=ss.getSheetByName(name)||ss.insertSheet(name);if(s.getLastRow()===0){s.getRange(1,1,1,HEADERS_[name].length).setValues([HEADERS_[name]]);}else{var previous=s.getRange(1,1,1,s.getLastColumn()).getValues()[0];if(previous.length>HEADERS_[name].length||previous.some(function(h,i){return h!==HEADERS_[name][i];}))throw new Error('Encabezados incompatibles: '+name);if(previous.length<HEADERS_[name].length)s.getRange(1,previous.length+1,1,HEADERS_[name].length-previous.length).setValues([HEADERS_[name].slice(previous.length)]);}s.setFrozenRows(1);s.getRange(1,1,1,HEADERS_[name].length).setFontWeight('bold').setBackground('#f4e3d4'); });
  SpreadsheetApp.flush();var db=read_(ss),plan={append:{}};
  if(!db.Configuracion.some(function(c){return c.id==='categories_initialized';})){plan.append.Categorias=PuntoCore.DEFAULT_CATEGORIES.filter(function(c){return !db.Categorias.some(function(x){return x.id===c.id;});});plan.append.Configuracion=[{id:'categories_initialized',value:'true'}];}
  if(!db.Equipos.length)plan.append.Equipos=PuntoCore.TEAMS.map(function(t){return {id:t.id,name:t.name,image_id:''};});
  if(!db.Jueces.some(function(u){return u.role==='admin'&&u.active===true;})){
   if(db.Jueces.length)throw new Error('Ya hay cuentas: recupera el administrador desde la hoja o respaldo. No se creará otra cuenta automáticamente.');
   plan.append.Jueces=[{id:1,name:p.getProperty('ADMIN_NAME')||'Administrador',email:email,role:'admin',active:true,password_hash:hash,version:1,failed:0,locked_until:0}];
  }
  commit_(ss,plan);
  // Prevent accidental edits; the owner remains able to restore/correct data.
  Object.keys(HEADERS_).forEach(function(name){var sheet=ss.getSheetByName(name),protections=sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);if(!protections.length){var protection=sheet.protect().setDescription('campaTeens: modificar desde la aplicación');var me=Session.getEffectiveUser();protection.addEditor(me);var others=protection.getEditors().filter(function(u){return u.getEmail()!==me.getEmail();});if(others.length)protection.removeEditors(others);if(protection.canDomainEdit())protection.setDomainEdit(false);}});
  console.log('Configuración lista. Planilla: '+ss.getUrl());
 }finally{lock.releaseLock();}
}

// Compatibility for previous installation instructions.
function configurarPunto(){configurarCampaTeens();}
