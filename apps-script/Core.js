/* Shared pure rules engine. Apps Script V8 and the Node test harness use this exact file. */
var PuntoCore = (function () {
  var TEAMS = [
    {id:'tiburones',name:'Tiburones',color:'#3979ca',mark:'TI'},
    {id:'leones',name:'Leones',color:'#df9b28',mark:'LE'},
    {id:'osos',name:'Osos',color:'#956640',mark:'OS'},
    {id:'lobos',name:'Lobos',color:'#727d96',mark:'LO'},
    {id:'cobras',name:'Cobras',color:'#42957b',mark:'CO'},
    {id:'halcon',name:'Halcón',color:'#9967bd',mark:'HA'}
  ];
  var PLACES=[600,450,350,300,250,100];
  var DEFAULT_CATEGORIES=[{"id":"participation","label":"Participación entusiasta en todas las actividades","kind":"add","suggested_points":50,"active":true,"version":1},{"id":"service","label":"Servicio, compasión o ayuda a otros","kind":"add","suggested_points":30,"active":true,"version":1},{"id":"attitude","label":"Buena actitud / buen comportamiento","kind":"add","suggested_points":25,"active":true,"version":1},{"id":"verses","label":"Memorizar y recitar versículos asignados","kind":"add","suggested_points":20,"active":true,"version":1},{"id":"praise","label":"Participación activa en alabanza y dinámicas","kind":"add","suggested_points":20,"active":true,"version":1},{"id":"cleanliness","label":"Buena higiene y cuidado de instalaciones","kind":"add","suggested_points":15,"active":true,"version":1},{"id":"punctuality","label":"Puntualidad grupal","kind":"add","suggested_points":15,"active":true,"version":1},{"id":"first","label":"Primer equipo en terminar el juego","kind":"add","suggested_points":30,"active":true,"version":1},{"id":"fair","label":"Juego limpio","kind":"add","suggested_points":10,"active":true,"version":1},{"id":"scarf-win","label":"Robar pañoleta contraria","kind":"add","suggested_points":5,"active":true,"version":1},{"id":"flag-win","label":"Robar bandera contraria","kind":"add","suggested_points":30,"active":true,"version":1},{"id":"teamwork","label":"Trabajo en equipo","kind":"add","suggested_points":0,"active":true,"version":1},{"id":"cheating","label":"Trampa, deshonestidad o sabotaje","kind":"subtract","suggested_points":60,"active":true,"version":1},{"id":"damage","label":"Dañar materiales o recursos del ministerio","kind":"subtract","suggested_points":50,"active":true,"version":1},{"id":"argument","label":"Peleas físicas o verbales e insultos","kind":"subtract","suggested_points":40,"active":true,"version":1},{"id":"irreverence","label":"Falta de reverencia en tiempos espirituales","kind":"subtract","suggested_points":30,"active":true,"version":1},{"id":"offensive","label":"Vocabulario inapropiado o groserías","kind":"subtract","suggested_points":30,"active":true,"version":1},{"id":"litter","label":"Ensuciar o dejar desorden","kind":"subtract","suggested_points":20,"active":true,"version":1},{"id":"absence","label":"No participar en conferencias sin justificación","kind":"subtract","suggested_points":20,"active":true,"version":1},{"id":"incomplete","label":"Juego incompleto","kind":"subtract","suggested_points":10,"active":true,"version":1},{"id":"scarf-loss","label":"Robo de pañoleta","kind":"subtract","suggested_points":5,"active":true,"version":1},{"id":"flag-loss","label":"Robo de bandera","kind":"subtract","suggested_points":30,"active":true,"version":1},{"id":"guide","label":"Conducta inapropiada de guía o subguía","kind":"subtract","suggested_points":50,"active":true,"version":1}];
  function fail(message,status){var e=new Error(message);e.status=status||400;throw e;}
  function uuid(v){if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))fail('Referencia inválida.');return v;}
  function text(v,min,max){if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)fail('Texto inválido. Revisa los campos.');return v.trim();}
  function team(v){if(!TEAMS.some(function(t){return t.id===v;}))fail('Equipo inválido.');return v;}
  function publicUser(u){return {id:Number(u.id),name:u.name,email:u.email,role:u.role,active:u.active===true};}
  function administrator(u){if(u.role!=='admin')fail('Solo administración puede realizar esta acción.',403);}
  function authenticate(db,id,version){var u=db.Jueces.find(function(x){return Number(x.id)===Number(id);});if(!u||['admin','judge'].indexOf(u.role)===-1||u.active!==true||Number(u.version)!==Number(version))fail('Inicia sesión para continuar.',401);return u;}
  function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+canonical(v[k]);}).join(',')+'}';return JSON.stringify(v);}
  function execute(action,data,actor,db,ctx){
    var u=authenticate(db,actor.id,actor.version),now=ctx.now();
    if(action==='state'){
      var reversed={};db.Movimientos.forEach(function(m){if(m.reversal_of)reversed[m.reversal_of]=true;});
      var teams=TEAMS.map(function(t){var ms=db.Movimientos.filter(function(m){return m.team_slug===t.id;}),doc=db.Equipos.find(function(e){return e.id===t.id;});return Object.assign({},t,{total:ms.reduce(function(n,m){return n+Number(m.delta);},0),added:ms.reduce(function(n,m){return n+Math.max(0,Number(m.delta));},0),deducted:ms.reduce(function(n,m){return n+Math.max(0,-Number(m.delta));},0),image:doc&&doc.image_id?'/api/control/team-image?team='+t.id+'&v='+encodeURIComponent(doc.image_id):null});});
      teams.sort(function(a,b){return b.total-a.total||a.name.localeCompare(b.name,'es');});teams.forEach(function(t,i){t.position=teams.findIndex(function(x){return x.total===t.total;})+1;});
      return {result:{user:publicUser(u),teams:teams,history:db.Movimientos.filter(function(m){return u.role==='admin'||Number(m.judge_id)===Number(u.id);}).slice().reverse().slice(0,250).map(function(m){return Object.assign({},m,{reversed:!!reversed[m.id]});}),rounds:u.role==='admin'?db.Juegos.slice().reverse():[],categories:db.Categorias.filter(function(c){return u.role==='admin'||c.active===true;}),branding:{name:'campaTeens',logo:(function(){var b=db.Configuracion.find(function(c){return c.id==='logo_id';});return b&&b.value?'/api/control/logo-image?v='+encodeURIComponent(b.value):null;})()},serverTime:now}};
    }
    if(action==='judges'){administrator(u);return {result:db.Jueces.map(publicUser)};}
    if(action==='export'){administrator(u);return {result:db.Movimientos.map(function(m){var r=db.Juegos.find(function(r){return r.id===m.round_id;});return Object.assign({},m,{round_name:r?r.name:''});})};}
    if(action==='image-read'){var t=team(data.team),doc=db.Equipos.find(function(x){return x.id===t;});if(!doc||!doc.image_id)fail('Este equipo no tiene imagen.',404);return {result:{fileId:doc.image_id}};}
    if(action==='logo-read'){var logo=db.Configuracion.find(function(c){return c.id==='logo_id';});if(!logo||!logo.value)fail('No hay logo configurado.',404);return {result:{fileId:logo.value}};}
    if(['judge','judge-status','judge-password','image','reverse','award','round','category-create','category-update','category-delete','logo','logo-remove'].indexOf(action)!==-1)administrator(u);
    if(['move','award','round','reverse','judge','judge-status','judge-password','image','category-create','category-update','category-delete','logo','logo-remove'].indexOf(action)===-1)fail('Acción no encontrada.',404);
    var op=uuid(data.operationId),digest=ctx.hash(canonical({action:action,data:data}));
    var prior=db.Operaciones.find(function(x){return x.id===op;});
    if(prior){if(prior.digest!==digest||Number(prior.actor_id)!==Number(u.id))fail('La referencia ya existe con otros datos.',409);return {result:{duplicate:true}};}
    var plan={append:{Operaciones:[{id:op,digest:digest,actor_id:u.id,action:action,created_at:now}]},update:[],result:{duplicate:false}};
    function append(table,row){(plan.append[table]||(plan.append[table]=[])).push(row);}
    function update(table,row,patch){plan.update.push({table:table,row:row._row,values:Object.assign({},row,patch)});}
    function round(id){if(id==null||id==='')return '';uuid(id);if(!db.Juegos.some(function(r){return r.id===id;}))fail('Juego no encontrado.');return id;}
    function movement(slug,delta,reason,roundId,reversal,category){append('Movimientos',{category_id:category?category.id:'',category_label:category?category.label:'',id:ctx.uuid(),operation_id:op,team_slug:slug,delta:delta,reason:reason,judge_id:u.id,judge_name:u.name,round_id:roundId||'',reversal_of:reversal||'',created_at:now});}
    if(action==='move'){
      var slug=team(data.team),category=db.Categorias.find(function(c){return c.id===data.categoryId&&c.active===true;});
      if(!category)fail('La categoría no existe o fue quitada. Actualiza la pantalla.',409);
      if(Number(data.categoryVersion)!==Number(category.version))fail('La categoría cambió. Actualiza y revisa los puntos antes de registrar.',409);
      var points=Number(data.amount);if(!Number.isInteger(points)||points<1||points>10000)fail('Ingresa puntos enteros entre 1 y 10,000.');
      if(category.kind!=='add'&&category.kind!=='subtract')fail('Categoría inválida.');
      if(u.role!=='admin'&&data.roundId)fail('Solo administración puede asociar juegos.',403);
      var note=data.note?text(data.note,1,200):'',reason=category.label+(note?' · '+note:'');
      movement(slug,category.kind==='add'?points:-points,reason,round(data.roundId),null,category);
    }
    if(action==='category-create'||action==='category-update'||action==='category-delete'){
      var existing=db.Categorias.find(function(c){return c.id===data.id;});
      if(action==='category-create'){uuid(data.id);if(existing)fail('La categoría ya existe.',409);}
      else {if(!existing||existing.active!==true)fail('La categoría ya fue quitada.',409);if(Number(data.expectedVersion)!==Number(existing.version))fail('Otra persona modificó la categoría. Actualiza antes de continuar.',409);}
      if(action==='category-delete'){update('Categorias',existing,{active:false,version:Number(existing.version)+1});}
      else {
        var label=text(data.label,2,120),kind=data.kind,suggested=Number(data.suggested_points);
        if(['add','subtract'].indexOf(kind)===-1||!Number.isInteger(suggested)||suggested<0||suggested>10000)fail('Revisa el tipo y los puntos sugeridos.');
        if(db.Categorias.some(function(c){return c.active===true&&c.id!==data.id&&c.kind===kind&&c.label.toLowerCase()===label.toLowerCase();}))fail('Ya existe una categoría con este nombre y tipo.',409);
        var values={label:label,kind:kind,suggested_points:suggested,active:true,version:existing?Number(existing.version)+1:1};
        if(action==='category-create')append('Categorias',Object.assign({id:data.id},values));else update('Categorias',existing,values);
      }
    }
    if(action==='logo'||action==='logo-remove'){
      var cfg=db.Configuracion.find(function(c){return c.id==='logo_id';}),file='';
      if(action==='logo'){if(data.mime!=='image/webp'||typeof data.base64!=='string'||data.base64.length>2800000)fail('Logo inválido.');file=ctx.storeImage(data,digest);}
      if(cfg)update('Configuracion',cfg,{value:file});else append('Configuracion',{id:'logo_id',value:file});
    }
    if(action==='round'){uuid(data.id);if(db.Juegos.some(function(x){return x.id===data.id;}))fail('El juego ya existe.',409);append('Juegos',{id:data.id,name:text(data.name,1,100),created_by:u.id,created_at:now,award_operation:''});}
    if(action==='award'){
      var rid=round(data.roundId);if(!rid)fail('Selecciona un juego.');var game=db.Juegos.find(function(r){return r.id===rid;});
      if(game.award_operation)fail('Este juego ya tiene lugares asignados. Actualiza la pantalla.',409);
      if(!Array.isArray(data.teams)||data.teams.length!==6||new Set(data.teams).size!==6)fail('Cada equipo debe aparecer una sola vez.');data.teams.forEach(team);
      data.teams.forEach(function(t,i){movement(t,PLACES[i],(i+1)+'.º lugar · '+game.name,rid);});update('Juegos',game,{award_operation:op});
    }
    if(action==='reverse'){
      uuid(data.movementId);var m=db.Movimientos.find(function(x){return x.id===data.movementId;});if(!m||m.reversal_of)fail('No se puede anular este movimiento.');
      if(db.Movimientos.some(function(x){return x.reversal_of===m.id;}))fail('Este movimiento ya está anulado.',409);
      movement(m.team_slug,-Number(m.delta),'Anulación: '+text(data.reason,3,200),m.round_id,m.id);
    }
    if(action==='judge'){
      var email=text(data.email,3,150).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Correo inválido.');
      if(db.Jueces.some(function(x){return x.email===email;}))fail('Este correo ya tiene cuenta.',409);
      if(['admin','judge'].indexOf(data.role)===-1)fail('Rol inválido.');if(!/^[0-9a-f]{128}$/.test(data.passwordHash))fail('Credencial inválida.');
      var id=db.Jueces.reduce(function(n,x){return Math.max(n,Number(x.id));},0)+1;
      append('Jueces',{id:id,name:text(data.name,2,80),email:email,role:data.role,active:true,password_hash:data.passwordHash,version:1,failed:0,locked_until:0});plan.result.id=id;
    }
    if(action==='judge-status'||action==='judge-password'){
      var target=db.Jueces.find(function(x){return Number(x.id)===Number(data.id);});if(!target)fail('Persona no encontrada.');
      if(action==='judge-status'){if(Number(target.id)===Number(u.id))fail('No puedes desactivar tu propia cuenta.');if(typeof data.active!=='boolean')fail('Estado inválido.');update('Jueces',target,{active:data.active,version:Number(target.version)+1});}
      else {if(!/^[0-9a-f]{128}$/.test(data.passwordHash))fail('Credencial inválida.');update('Jueces',target,{password_hash:data.passwordHash,version:Number(target.version)+1,failed:0,locked_until:0});}
    }
    if(action==='image'){
      var slug=team(data.team),t=db.Equipos.find(function(x){return x.id===slug;});if(!t)fail('Equipo no encontrado.');
      if(data.mime!=='image/webp'||typeof data.base64!=='string'||data.base64.length>2800000)fail('Imagen inválida.');
      var file=ctx.storeImage(data,digest);update('Equipos',t,{image_id:file});
    }
    return plan;
  }
  return {TEAMS:TEAMS,DEFAULT_CATEGORIES:DEFAULT_CATEGORIES,PLACES:PLACES,execute:execute,authenticate:authenticate,canonical:canonical,fail:fail};
})();
