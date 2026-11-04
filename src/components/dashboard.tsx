'use client'
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react'
import {Activity,ArrowDownLeft,ArrowRight,ArrowUpRight,Check,ChevronRight,ClipboardList,Flag,ImagePlus,LayoutDashboard,Loader2,LogOut,Plus,RefreshCw,Settings,ShieldCheck,Tags,Trophy,Users,X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {PLACES,TEAMS} from '@/lib/rules'

type User={id:number;name:string;role:'admin'|'judge'}
type Judge=User&{email:string;active:boolean}
type Team={id:string;name:string;color:string;mark:string;total:number;added:number;deducted:number;position:number;image:string|null}
type Category={id:string;label:string;kind:'add'|'subtract';suggested_points:number;active:boolean;version:number}
type Movement={id:string;team_slug:string;delta:number;reason:string;judge_name:string;created_at:string;reversed:boolean;reversal_of:string}
type Round={id:string;name:string;award_operation:string;placements?:{place:number;team:string}[]}
type AppState={user:User;teams:Team[];categories:Category[];history:Movement[];rounds:Round[];branding:{name:string;logo:string|null}}
type Command={path:string;data:Record<string,unknown>;summary:string}
type Prepare=(path:string,data:Record<string,unknown>,summary:string)=>void

const fmt=(n:number)=>new Intl.NumberFormat('es-HN').format(n)
const signed=(n:number)=>(n>0?'+':'')+fmt(n)
const date=(s:string)=>new Date(s).toLocaleString('es-HN',{timeZone:'America/Tegucigalpa',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'})

const tabs=[
  {id:'dashboard',name:'Resumen',icon:LayoutDashboard},
  {id:'score',name:'Registrar puntos',icon:Plus},
  {id:'categories',name:'Categorías',icon:Tags},
  {id:'games',name:'Juegos',icon:Trophy},
  {id:'history',name:'Historial',icon:ClipboardList},
  {id:'teams',name:'Equipos',icon:Flag},
  {id:'users',name:'Usuarios',icon:Users},
  {id:'settings',name:'Logo',icon:Settings}
]

async function api(path:string,data?:unknown){
  const r=await fetch('/api/control/'+path,{
    method:data?'POST':'GET',
    headers:data?{'Content-Type':'application/json'}:undefined,
    body:data?JSON.stringify(data):undefined,
    cache:'no-store',
    signal:AbortSignal.timeout(35000)
  })

  const result=await r.json()

  if(!r.ok){
    throw Object.assign(
      new Error(result.error||'No se pudo confirmar la operación.'),
      {status:r.status}
    )
  }

  return result
}

function Avatar({team,large=false}:{team:Team;large?:boolean}){
  return <span className={`avatar ${large?'avatar-lg':''}`} style={{background:team.color+'16',color:team.color}}>
    {team.image?<img src={team.image} alt={'Escudo de '+team.name}/>:team.mark}
  </span>
}

function Brand({logo}:{logo?:string|null}){
  return <div className="brand camp-brand">
    {logo?<img className="app-logo" src={logo} alt="Logo de campaTeens"/>:<span className="camp-symbol"><Flag size={21}/></span>}
    <span>campa<span className="brand-teens">Teens</span></span>
  </div>
}

function Panel({title,detail,children,action}:{title:string;detail?:string;children:React.ReactNode;action?:React.ReactNode}){
  return <section className="panel">
    <div className="panel-heading">
      <div><h2>{title}</h2>{detail&&<p>{detail}</p>}</div>
      {action}
    </div>
    {children}
  </section>
}

export default function Dashboard(){
  const [state,setState]=useState<AppState|null>(null)
  const [loading,setLoading]=useState(false)
  const [login,setLogin]=useState(true)
  const [tab,setTab]=useState('score')
  const [busy,setBusy]=useState(false)
  const [online,setOnline]=useState(true)
  const [error,setError]=useState('')
  const [toast,setToast]=useState('')
  const [confirm,setConfirm]=useState<Command|null>(null)
  const [pending,setPending]=useState<Command|null>(null)

  const inFlight=useRef(false)
  const writeLock=useRef(false)
  const version=useRef(0)
  const restored=useRef<number|null>(null)
  const authUnlocked=useRef(false)

  const refresh=useCallback(async()=>{
    if(!authUnlocked.current||inFlight.current)return

    inFlight.current=true
    const id=++version.current

    try{
      const s=await api('state')
      if(id!==version.current)return

      setState(s)
      setLogin(false)
      setOnline(true)
    }catch(e){
      if(id!==version.current)return

      if((e as {status:number}).status===401){
        authUnlocked.current=false
        setLogin(true)
        setState(null)
      }else{
        setOnline(false)
      }
    }finally{
      inFlight.current=false
      setLoading(false)
    }
  },[])

  useEffect(()=>{
    refresh()

    const interval=setInterval(()=>{
      if(document.visibilityState==='visible')refresh()
    },15000)

    window.addEventListener('focus',refresh)

    return()=>{
      clearInterval(interval)
      window.removeEventListener('focus',refresh)
    }
  },[refresh])

  useEffect(()=>{
    if(!state||restored.current===state.user.id)return

    restored.current=state.user.id

    try{
      const p=sessionStorage.getItem('campateens:pending:'+state.user.id)

      if(p){
        const c=JSON.parse(p)
        if(c.path&&c.data?.operationId)setPending(c)
      }
    }catch{}
  },[state?.user.id])

  useEffect(()=>{
    if(!toast)return
    const t=setTimeout(()=>setToast(''),6500)
    return()=>clearTimeout(t)
  },[toast])

  async function send(c:Command){
    if(writeLock.current)return false

    writeLock.current=true
    setBusy(true)
    setError('')

    const key='campateens:pending:'+state?.user.id

    try{
      try{sessionStorage.setItem(key,JSON.stringify(c))}catch{}

      const r=await api(c.path,c.data)

      try{sessionStorage.removeItem(key)}catch{}

      setPending(null)
      setConfirm(null)
      setToast(r.duplicate?'Este registro ya estaba guardado.':'Guardado correctamente.')

      await refresh()
      return true
    }catch(e){
      const x=e as Error&{status?:number}
      setError(x.message)
      setConfirm(null)

      if(!x.status||x.status>=500||x.status===401){
        setPending(c)
      }else{
        setPending(null)
        try{sessionStorage.removeItem(key)}catch{}
      }

      return false
    }finally{
      setBusy(false)
      writeLock.current=false
    }
  }

  const prepare:Prepare=(path,data,summary)=>{
    setError('')
    setConfirm({
      path,
      data:{...data,operationId:crypto.randomUUID()},
      summary
    })
  }

  async function signIn(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    setBusy(true)
    setError('')

    const f=new FormData(e.currentTarget)

    try{
      const r=await fetch('/api/auth/login',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          email:f.get('email'),
          password:f.get('password')
        }),
        signal:AbortSignal.timeout(35000)
      })

      const x=await r.json()

      if(!r.ok)throw new Error(x.error||'No se pudo iniciar sesión.')

      authUnlocked.current=true
      inFlight.current=false
      await refresh()
    }catch(e){
      setError((e as Error).message)
    }finally{
      setBusy(false)
    }
  }

  async function logout(){
    try{
      const r=await fetch('/api/auth/logout',{method:'POST'})

      if(!r.ok)throw new Error('No se pudo cerrar la sesión.')

      authUnlocked.current=false
      version.current++
      inFlight.current=false
      setState(null)
      setLogin(true)
      setConfirm(null)
      setPending(null)
      restored.current=null
    }catch(e){
      setError((e as Error).message)
    }
  }

  async function upload(path:'logo'|'image',file:File,team?:string){
    if(writeLock.current)return

    writeLock.current=true
    setBusy(true)
    setError('')

    try{
      if(file.size>2*1024*1024)throw new Error('La imagen debe pesar hasta 2 MB.')

      const f=new FormData()
      f.set('file',file)
      f.set('operationId',crypto.randomUUID())
      if(team)f.set('team',team)

      const r=await fetch('/api/control/'+path,{
        method:'POST',
        body:f,
        signal:AbortSignal.timeout(35000)
      })

      const x=await r.json()
      if(!r.ok)throw new Error(x.error)

      setToast(path==='logo'?'Logo de campaTeens actualizado.':'Imagen del equipo actualizada.')
      await refresh()
    }catch(e){
      setError((e as Error).message)
    }finally{
      setBusy(false)
      writeLock.current=false
    }
  }

  if(loading)return <main className="loading">
    <Brand/><Loader2 className="spin"/><p>Cargando campaTeens…</p>
  </main>

  if(login)return <main className="login">
    <div className="login-art">
      <Brand/>
      <div>
        <span className="eyebrow">CADA EQUIPO. CADA LOGRO.</span>
        <h1>Vivimos el encuentro.<br/>Contamos cada punto.</h1>
        <p>Un registro claro para disfrutar campaTeens.</p>
      </div>
      <div className="login-teams">
        {TEAMS.map(t=><span key={t.id} style={{background:t.color}}>{t.mark}</span>)}
      </div>
    </div>

    <section className="login-form">
      <span className="eyebrow">BIENVENIDO A CAMPATEENS</span>
      <h2>Ingresa al encuentro</h2>
      <p className="muted">Usa tu cuenta de administrador o juez.</p>

      <form onSubmit={signIn}>
        <label>Correo electrónico<input name="email" type="email" autoComplete="username" required/></label>
        <label>Contraseña<input name="password" type="password" autoComplete="current-password" required maxLength={128}/></label>
        {error&&<div className="error" role="alert">{error}</div>}
        <Button disabled={busy}>{busy?<Loader2 size={17} className="spin"/>:<>Entrar <ArrowRight size={17}/></>}</Button>
      </form>

      <div className="login-note"><ShieldCheck size={18}/>Cada movimiento conserva el nombre de quien lo registró.</div>
    </section>
  </main>

  if(!state)return <main className="loading">
    <Brand/><h2>No pudimos conectar</h2>
    <p>Revisa la conexión y vuelve a intentarlo.</p>
    <Button onClick={refresh}><RefreshCw size={16}/>Reintentar</Button>
  </main>

  const admin=state.user.role==='admin',disabled=busy||!!pending

  const allowed=admin?tabs:tabs.filter(t=>['score','dashboard','games'].includes(t.id)).map(t=>t.id==='dashboard'?{...t,name:'Marcador'}:t)

  const current=allowed.find(t=>t.id===tab)?tab:'score'

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand logo={state.branding.logo}/>
      <div className="workspace">
        <span className="workspace-icon"><Trophy size={19}/></span>
        <div><strong>campaTeens</strong><small>{admin?'Administración del encuentro':'Registro de puntajes'}</small></div>
      </div>
      <span className="nav-label">{admin?'ADMINISTRACIÓN':'JUEZ'}</span>
      <nav>
        {allowed.map(t=><button key={t.id} className={current===t.id?'active':''} onClick={()=>{setTab(t.id);setError('')}}><t.icon size={18}/>{t.name}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sync-card">
          <span className={'status-dot '+(!online?'offline':'')}/>
          <div><strong>{online?'Conectado':'Sin conexión'}</strong><small>Actualiza cada 15 segundos</small></div>
        </div>
        <button className="profile" onClick={logout}>
          <span className="user-avatar">{state.user.name.slice(0,2).toUpperCase()}</span>
          <span><strong>{state.user.name}</strong><small>{admin?'Administrador':'Juez'} · Cerrar sesión</small></span>
          <LogOut size={17}/>
        </button>
      </div>
    </aside>

    <div className="main-wrap">
      <header className="topbar">
        <div className="breadcrumb">campaTeens <ChevronRight size={14}/><strong>{allowed.find(t=>t.id===current)?.name}</strong></div>
        <div className="topbar-right">
          <button className="refresh-marker" onClick={refresh} aria-label="Actualizar marcador"><RefreshCw size={16}/></button>
          <span className="live">{admin?'Administrador':'Juez'} · {state.user.name}</span>
          <button className="mobile-logout" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={16}/> Cerrar sesión</button>
        </div>
      </header>

      <main className="content">
        <div className="page-heading"><div>
          <span className="eyebrow">CAMPATEENS · CONTROL DE PUNTAJES</span>
          <h1>{current==='dashboard'?'Cada punto cuenta.':allowed.find(t=>t.id===current)?.name}</h1>
          <p className="muted">{current==='score'?'Selecciona el equipo y la categoría. Ingresa los puntos y confirma.':current==='categories'?'Organiza los motivos para sumar o quitar puntos.':current==='settings'?'La identidad del encuentro, en todos los dispositivos.':'Un encuentro. Seis equipos. Un registro compartido.'}</p>
        </div></div>

        {!online&&<div className="error" role="status">No hay conexión. Estos datos pueden estar desactualizados. Los cambios solo se confirman cuando el servidor los guarda.</div>}
        {error&&<div className="error" role="alert">{error}</div>}
        {pending&&<div className="pending"><div><strong>Envío pendiente de confirmación</strong><p>{pending.summary}</p></div><Button disabled={busy} variant="outline" onClick={()=>send(pending)}>Reintentar mismo envío</Button></div>}

        {current==='dashboard'&&<Leaderboard teams={state.teams} onSelect={id=>{setTab('score');sessionStorage.setItem('campateens:selected-team',id)}}/>}
        {current==='score'&&<ScoreForm state={state} disabled={disabled} prepare={prepare}/>}
        {admin&&current==='categories'&&<Categories categories={state.categories} disabled={disabled} send={send} prepare={prepare}/>}
        {current==='games'&&<Games rounds={state.rounds} disabled={disabled} prepare={prepare} send={send} admin={admin}/>}

        {admin&&current==='history'&&<Panel title="Historial de puntajes" detail="Últimos 250 movimientos. El CSV incluye todo el historial." action={<a href="/api/control/export" className="button button-outline">Exportar CSV</a>}>
          <div className="table-scroll"><table>
            <thead><tr><th>EQUIPO / MOTIVO</th><th>PUNTOS</th><th>JUEZ / FECHA</th><th/></tr></thead>
            <tbody>{state.history.map(m=><tr key={m.id}>
              <td><strong>{TEAMS.find(t=>t.id===m.team_slug)?.name}</strong><small>{m.reason}</small>{m.reversed&&<span className="tag">ANULADO</span>}</td>
              <td className={'points '+(m.delta>0?'positive':'negative')}>{signed(m.delta)}</td>
              <td>{m.judge_name}<small>{date(m.created_at)}</small></td>
              <td>{!m.reversed&&!m.reversal_of&&<Button variant="ghost" size="sm" disabled={disabled} onClick={()=>{
                const reason=window.prompt('Motivo de la anulación (mínimo 3 caracteres):')
                if(reason&&reason.trim().length>=3)prepare('reverse',{movementId:m.id,reason:reason.trim()},'Anular '+signed(m.delta)+' puntos. El original se conservará.')
              }}>Anular</Button>}</td>
            </tr>)}</tbody>
          </table>{!state.history.length&&<div className="empty"><ClipboardList/><p>Los primeros registros aparecerán aquí.</p></div>}</div>
        </Panel>}

        {admin&&current==='teams'&&<div className="team-grid">{state.teams.map(t=><Panel key={t.id} title={t.name}>
          <div className="team-spotlight"><Avatar team={t} large/><strong>{fmt(t.total)} <small>puntos</small></strong><ImagePicker label="Cambiar imagen" disabled={disabled} onFile={f=>upload('image',f,t.id)}/></div>
        </Panel>)}</div>}

        {admin&&current==='users'&&<Accounts disabled={disabled} onError={setError} notify={setToast} currentUser={state.user}/>}

        {admin&&current==='settings'&&<Panel title="Logo de campaTeens" detail="Solo el administrador puede cambiarlo. Se mostrará a todos los usuarios después de iniciar sesión.">
          <div className="logo-settings">
            {state.branding.logo?<img className="logo-preview" src={state.branding.logo} alt="Logo actual de campaTeens"/>:<div className="logo-placeholder"><Flag size={35}/><span>Agrega el logo de tu encuentro</span></div>}
            <ImagePicker label={state.branding.logo?'Cambiar logo':'Agregar logo'} disabled={disabled} onFile={f=>upload('logo',f)}/>
            {state.branding.logo&&<Button variant="ghost" disabled={disabled} onClick={()=>prepare('logo-remove',{},'Quitar el logo actual de campaTeens.')}>Quitar logo</Button>}
            <p className="muted">JPG, PNG o WEBP · hasta 2 MB. El archivo se guarda en Drive.</p>
          </div>
        </Panel>}

        <footer className="main-footer"><span>campaTeens · Juego limpio. Puntos claros.</span><span>{admin?'Administrador':'Juez'}</span></footer>
      </main>
    </div>

    {toast&&<div className="toast" role="status"><Check size={18}/>{toast}<button aria-label="Cerrar aviso" onClick={()=>setToast('')}><X size={16}/></button></div>}

    {confirm&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <span className="modal-icon"><ShieldCheck size={25}/></span>
      <h2 id="confirm-title">Revisa antes de confirmar</h2>
      <p>{confirm.summary}</p>
      <div className="notice">Registrado por <strong>{state.user.name}</strong>.</div>
      <div className="modal-actions">
        <Button variant="outline" disabled={busy} onClick={()=>setConfirm(null)}>Volver</Button>
        <Button disabled={busy} onClick={()=>send(confirm)}>{busy?<Loader2 className="spin" size={17}/>:<Check size={17}/>}Confirmar</Button>
      </div>
    </section></div>}
  </div>
}

function Leaderboard({teams,onSelect}:{teams:Team[];onSelect:(id:string)=>void}){
  return <Panel title="Clasificación general" detail="Los empates comparten posición." action={<span className="tag">6 EQUIPOS</span>}>
    {teams.map(t=><button className="rank-row" key={t.id} onClick={()=>onSelect(t.id)}>
      <span className="position">{String(t.position).padStart(2,'0')}</span><Avatar team={t}/>
      <span className="team-info"><strong>{t.name}</strong><small><span className="positive">+{fmt(t.added)}</span><span className="negative">−{fmt(t.deducted)}</span></small></span>
      <span className="score">{fmt(t.total)}<small>pts</small></span><ChevronRight size={17}/>
    </button>)}
  </Panel>
}

function ScoreForm({state,disabled,prepare}:{state:AppState;disabled:boolean;prepare:Prepare}){
  const [team,setTeam]=useState('tiburones')
  const [kind,setKind]=useState<'add'|'subtract'>('add')
  const [choice,setChoice]=useState<Category|null>(null)
  const [points,setPoints]=useState('')
  const [note,setNote]=useState('')
  const [round,setRound]=useState('')
  const [place,setPlace]=useState('')

  useEffect(()=>{try{const t=sessionStorage.getItem('campateens:selected-team');if(TEAMS.some(x=>x.id===t))setTeam(t!);sessionStorage.removeItem('campateens:selected-team')}catch{}},[])

  const categories=state.categories.filter(c=>c.active&&c.kind===kind)
  const live=state.categories.find(c=>c.id===choice?.id&&c.active)
  const stale=!!choice&&(!live||live.version!==choice.version)
  const amount=Number(points),selected=state.teams.find(t=>t.id===team)!
  const game=state.rounds.find(r=>r.id===round)
  const occupied=game?.placements||[]
  const placeNumber=Number(place)
  const placePoints=place?(PLACES[placeNumber-1]??0):0
  const assignedTeam=occupied.find(p=>p.team===team)
  const assignedPlace=occupied.find(p=>p.place===placeNumber)
  const invalidPlace=!!place&&(!Number.isInteger(placeNumber)||placeNumber<1||placeNumber>6||!!game?.award_operation||!!assignedTeam||!!assignedPlace)
  const valid=!!choice&&!stale&&Number.isInteger(amount)&&amount>=1&&amount<=10000&&!!game&&!invalidPlace
  const net=(kind==='add'?amount:-amount)+placePoints
  const total=Number.isFinite(net)?net:0
  const select=(c:Category|null)=>{setChoice(c);setPoints(c?.suggested_points?String(c.suggested_points):'')}

  return <div className="score-layout">
    <Panel title="Registrar puntaje" detail={'Juez: '+state.user.name}>
      <form className="form-body" onSubmit={e=>{
        e.preventDefault();if(!valid)return
        const categoryDelta=kind==='add'?amount:-amount
        const breakdown=`Categoría: ${choice!.label} (${signed(categoryDelta)} puntos)`+(place?` · ${place}.º lugar (+${placePoints} puntos)`:'')
        prepare('move',{team,categoryId:choice!.id,categoryVersion:choice!.version,amount,note:note.trim(),roundId:round,...(place?{place:placeNumber}:{})},`${selected.name} · ${game!.name} · ${breakdown} · Total: ${signed(total)} puntos${note?' · '+note:''}`)
      }}>
        <div className="field-title">1. Equipo</div>
        <div className="team-picker">{TEAMS.map(t=><button type="button" key={t.id} className={team===t.id?'selected':''} onClick={()=>{setTeam(t.id);setPlace('')}}><Avatar team={state.teams.find(x=>x.id===t.id)!}/><span>{t.name}</span></button>)}</div>
        <div className="field-title">2. ¿Qué deseas registrar?</div>
        <div className="segmented">
          <button type="button" className={kind==='add'?'active':''} onClick={()=>{setKind('add');select(null)}}><Plus size={15}/> Otorgar puntos</button>
          <button type="button" className={kind==='subtract'?'active':''} onClick={()=>{setKind('subtract');select(null)}}><ArrowDownLeft size={15}/> Quitar puntos</button>
        </div>
        <label>Categoría<select required value={choice?.id||''} onChange={e=>select(categories.find(c=>c.id===e.target.value)||null)}><option value="">Selecciona el motivo</option>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        {!categories.length&&<div className="notice">No hay categorías para esta acción. Solicita al administrador que agregue una.</div>}
        {stale&&<div className="error" role="alert">Esta categoría cambió o fue quitada. Selecciónala de nuevo antes de registrar.</div>}
        <label>Lugar del equipo <span className="optional">opcional</span><select value={place} onChange={e=>setPlace(e.target.value)} disabled={!game}><option value="">Sin asignar lugar</option>{PLACES.map((p,i)=>{const taken=occupied.find(x=>x.place===i+1);return <option key={i} value={i+1} disabled={!!taken||!!game?.award_operation||!!assignedTeam}>{i+1}.º lugar · +{fmt(p)} puntos{taken?' · asignado':''}</option>})}</select></label>
        {!game&&<p className="muted small-text">Selecciona un juego para asignar un lugar.</p>}
        {game?.award_operation&&<p className="muted small-text">Los lugares de este juego ya fueron asignados.</p>}
        {assignedTeam&&!game?.award_operation&&<p className="muted small-text">Este equipo ya tiene el {assignedTeam.place}.º lugar en este juego.</p>}
        {invalidPlace&&<div className="error" role="alert">El lugar ya no está disponible. Actualiza y selecciona uno libre.</div>}
        <div className="points-input-row">
          <label>3. Puntos de la categoría<input type="number" inputMode="numeric" min={1} max={10000} step={1} value={points} onChange={e=>setPoints(e.target.value)} required placeholder="Ej. 25"/></label>
          <span className={'points-large '+(kind==='add'?'positive':'negative')}>{kind==='add'?'+':'−'}{Number.isFinite(amount)?fmt(amount):'0'}</span>
        </div>
        {choice&&<p className="muted small-text">{choice.suggested_points?'Sugerencia: '+choice.suggested_points+' puntos. Puedes ajustar la cantidad.':'Cantidad manual: esta categoría no tiene puntos sugeridos.'}</p>}
        <label>Observación <span className="optional">opcional</span><textarea value={note} maxLength={200} onChange={e=>setNote(e.target.value)} placeholder="Detalle breve del registro"/></label>
        <label>Asociar a un juego<select required value={round} onChange={e=>{setRound(e.target.value);setPlace('')}}><option value="">Selecciona un juego</option>{state.rounds.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        {!state.rounds.length&&<div className="notice">Solicita al administrador que cree un juego antes de registrar puntos.</div>}
        {place&&<p className="muted small-text">Categoría: {signed(kind==='add'?amount:-amount)} puntos · Lugar: +{fmt(placePoints)} puntos</p>}
        <div className="score-summary"><div><small>{selected.name}</small><strong className={total<0?'negative':'positive'}>{signed(total)} <span>puntos</span></strong></div><Button disabled={disabled||!valid}>Revisar registro <ArrowRight size={17}/></Button></div>
      </form>
    </Panel>
    <aside className="score-aside">
      <Panel title={'Así va '+selected.name}><div className="team-spotlight"><Avatar team={selected} large/><strong>{fmt(selected.total)}<small> puntos</small></strong><span className="tag">POSICIÓN {selected.position}</span></div></Panel>
      <div className="tip"><ShieldCheck size={20}/><h3>Cada decisión tiene nombre</h3><p>Revisa el equipo, la categoría y los puntos. Tu nombre quedará en el registro.</p></div>
      <Panel title={state.user.role==='admin'?'Últimos registros':'Tus últimos registros'}>
        {state.history.slice(0,3).map(m=><div className="activity-row" key={m.id}><div><strong>{TEAMS.find(t=>t.id===m.team_slug)?.name}</strong><small>{m.reason}</small></div><b className={m.delta>0?'positive':'negative'}>{signed(m.delta)}</b></div>)}
        {!state.history.length&&<div className="empty small"><Activity/><p>Aquí aparecerán tus registros.</p></div>}
      </Panel>
    </aside>
  </div>
}

function Categories({categories,disabled,send,prepare}:{categories:Category[];disabled:boolean;send:(c:Command)=>Promise<boolean>;prepare:Prepare}){
  const [edit,setEdit]=useState<Category|null>(null),[label,setLabel]=useState(''),[kind,setKind]=useState('add'),[suggested,setSuggested]=useState('0'),[show,setShow]=useState<'add'|'subtract'>('add')
  const clear=()=>{setEdit(null);setLabel('');setKind('add');setSuggested('0')}

  async function save(e:FormEvent){
    e.preventDefault()
    const c:Command={path:edit?'category-update':'category-create',data:{operationId:crypto.randomUUID(),id:edit?.id||crypto.randomUUID(),label,kind,suggested_points:Number(suggested),...(edit?{expectedVersion:edit.version}:{})},summary:(edit?'Editar':'Crear')+' categoría: '+label}
    if(await send(c)){setShow(kind as 'add'|'subtract');clear()}
  }

  return <div className="category-layout">
    <Panel title="Categorías del registro" detail="Quitar una categoría la retira del selector y conserva los registros anteriores.">
      <div className="form-body category-filter"><div className="segmented"><button className={show==='add'?'active':''} onClick={()=>setShow('add')}>Otorgar</button><button className={show==='subtract'?'active':''} onClick={()=>setShow('subtract')}>Quitar</button></div></div>
      <div className="category-list">{categories.filter(c=>c.active&&c.kind===show).map(c=><div className="category-row" key={c.id}>
        <span className={'move-icon '+(c.kind==='add'?'positive-bg':'negative-bg')}>{c.kind==='add'?<ArrowUpRight size={17}/>:<ArrowDownLeft size={17}/>}</span>
        <div className="category-copy"><strong>{c.label}</strong><small>{c.kind==='add'?'Otorgar':'Quitar'} · {c.suggested_points?'Sugerencia: '+signed((c.kind==='add'?1:-1)*c.suggested_points):'Cantidad manual'}</small></div>
        <div className="category-actions">
          <Button size="sm" variant="ghost" disabled={disabled} onClick={()=>{setEdit(c);setLabel(c.label);setKind(c.kind);setSuggested(String(c.suggested_points))}}>Editar</Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={()=>prepare('category-delete',{id:c.id,expectedVersion:c.version},'Quitar la categoría “'+c.label+'” del registro. Los movimientos previos se conservarán.')}>Quitar</Button>
        </div>
      </div>)}</div>
    </Panel>
    <Panel title={edit?'Editar categoría':'Agregar categoría'}>
      <form className="form-body" onSubmit={save}>
        <label>Nombre<input value={label} onChange={e=>setLabel(e.target.value)} required minLength={2} maxLength={120} placeholder="Ej. Trabajo en equipo"/></label>
        <label>Tipo<select value={kind} onChange={e=>setKind(e.target.value)}><option value="add">Otorgar puntos (+)</option><option value="subtract">Quitar puntos (−)</option></select></label>
        <label>Puntos sugeridos<input type="number" min={0} max={10000} step={1} value={suggested} onChange={e=>setSuggested(e.target.value)} required/></label>
        <div className="notice">Usa 0 para dejar la cantidad completamente manual. Los jueces podrán ajustar los puntos al registrar.</div>
        <Button disabled={disabled}>{edit?'Guardar cambios':'Agregar categoría'}</Button>
        {edit&&<Button type="button" variant="ghost" onClick={clear}>Cancelar edición</Button>}
      </form>
    </Panel>
  </div>
}

function Games({rounds,disabled,prepare,send,admin}:{rounds:Round[];disabled:boolean;prepare:Prepare;send:(c:Command)=>Promise<boolean>;admin:boolean}){
  const [name,setName]=useState(''),[round,setRound]=useState(''),[order,setOrder]=useState<string[]>(TEAMS.map(t=>t.id))

  return <div className="judge-layout">
    <Panel title="Juegos del encuentro">
      {admin&&<form className="form-body" onSubmit={async e=>{
        e.preventDefault()
        const id=crypto.randomUUID()
        if(await send({path:'round',data:{id,name,operationId:crypto.randomUUID()},summary:'Crear juego: '+name})){setName('');setRound(id)}
      }}><label>Nuevo juego<input value={name} onChange={e=>setName(e.target.value)} maxLength={100} required/></label><Button disabled={disabled}><Plus size={17}/>Crear juego</Button></form>}
      {rounds.map(r=><div className="regulation" key={r.id}><span>{r.name}</span><span className="tag">{r.award_operation?'PUNTUADO':r.placements?.length?'EN CURSO':'PENDIENTE'}</span></div>)}
    </Panel>

    <Panel title="Asignar lugares" detail="Selecciona un juego y asigna los lugares.">
      <div className="form-body">
        <label>Juego<select value={round} onChange={e=>setRound(e.target.value)}><option value="">Seleccionar juego</option>{rounds.map(r=><option key={r.id} value={r.id}>{r.name}{r.award_operation?' · puntuado':r.placements?.length?' · en curso':''}</option>)}</select></label>
        <div className="place-list">{PLACES.map((p,i)=><label key={i}><span>{i+1}.º</span><select aria-label={'Equipo en lugar '+(i+1)} value={order[i]} onChange={e=>setOrder(v=>v.map((x,j)=>j===i?e.target.value:x))}>{TEAMS.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><strong>+{p}</strong></label>)}</div>
        <Button disabled={disabled||!round||new Set(order).size!==6||!!rounds.find(r=>r.id===round)?.award_operation||!!rounds.find(r=>r.id===round)?.placements?.length} onClick={()=>prepare('award',{roundId:round,teams:order},'Asignar los seis lugares de '+rounds.find(r=>r.id===round)?.name+': '+order.map((id,i)=>TEAMS.find(t=>t.id===id)?.name+' +'+PLACES[i]).join(', '))}>Revisar reparto</Button>
      </div>
    </Panel>
  </div>
}

function ImagePicker({label,disabled,onFile}:{label:string;disabled:boolean;onFile:(f:File)=>void}){
  const ref=useRef<HTMLInputElement>(null)
  return <><input hidden type="file" accept="image/png,image/jpeg,image/webp" ref={ref} onChange={e=>{const f=e.target.files?.[0];if(f)onFile(f);e.target.value=''}}/><Button disabled={disabled} variant="outline" onClick={()=>ref.current?.click()}><ImagePlus size={17}/>{label}</Button></>
}

function Accounts({disabled,currentUser,onError,notify}:{disabled:boolean;currentUser:User;onError:(s:string)=>void;notify:(s:string)=>void}){
  const [people,setPeople]=useState<Judge[]>([]),[working,setWorking]=useState(false),[reset,setReset]=useState<Judge|null>(null),[password,setPassword]=useState('')

  useEffect(()=>{api('judges').then(setPeople).catch(e=>onError(e.message))},[onError])

  async function act(path:string,data:Record<string,unknown>){
    setWorking(true)
    try{
      await api(path,{...data,operationId:crypto.randomUUID()})
      setPeople(await api('judges'))
      notify('Cuenta actualizada.')
      return true
    }catch(e){
      onError((e as Error).message)
      return false
    }finally{
      setWorking(false)
    }
  }

  return <>
    <div className="judge-layout">
      <Panel title="Administradores y jueces">
        {people.map(p=><div className="judge-row" key={p.id}>
          <span className="user-avatar">{p.name.slice(0,2).toUpperCase()}</span>
          <div><strong>{p.name}</strong><small>{p.email}</small><span className="tag">{p.role==='admin'?'ADMINISTRADOR':'JUEZ'}{!p.active?' · INACTIVO':''}</span></div>
          <Button size="sm" variant="ghost" disabled={disabled||working} onClick={()=>{setReset(p);setPassword('')}}>Contraseña</Button>
          {p.id!==currentUser.id&&<Button size="sm" variant="ghost" disabled={disabled||working} onClick={()=>act('judge-status',{id:p.id,active:!p.active})}>{p.active?'Desactivar':'Activar'}</Button>}
        </div>)}
      </Panel>
      <Panel title="Agregar persona">
        <form className="form-body" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;if(await act('judge',Object.fromEntries(new FormData(form))))form.reset()}}>
          <label>Nombre completo<input name="name" required minLength={2} maxLength={80}/></label>
          <label>Correo<input name="email" type="email" required/></label>
          <label>Contraseña inicial<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label>
          <label>Rol<select name="role"><option value="judge">Juez</option><option value="admin">Administrador</option></select></label>
          <div className="notice">Administrador: acceso a todo. Juez: sumar y quitar puntos por categoría, y consultar el marcador.</div>
          <Button disabled={disabled||working}>Crear cuenta</Button>
        </form>
      </Panel>
    </div>
    {reset&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <h2 id="reset-title">Nueva contraseña</h2><p>{reset.name}</p>
      <form onSubmit={async e=>{e.preventDefault();if(await act('judge-password',{id:reset.id,password})){setReset(null);setPassword('')}}}>
        <label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={12} maxLength={128} required autoComplete="new-password"/></label>
        <div className="modal-actions"><Button type="button" variant="outline" disabled={working} onClick={()=>{setReset(null);setPassword('')}}>Cancelar</Button><Button disabled={working}>Guardar</Button></div>
      </form>
    </section></div>}
  </>
}