function SalespeopleList(){
  const ALL = [
    ...TEAM,
    { id:9, name:'Sergio Aparicio', role:'Sales', branch:'Madrid · Chamberí', team:'Norte', reviews:34, sent:52, avg:4.6, goal:50, delta:'-1', avatar:'#C7C7CC', status:'paused' },
    { id:10, name:'Aitana Ferrer',   role:'Junior Sales', branch:'Valencia · Patacona', team:'Levante', reviews:0, sent:0, avg:0,  goal:30, delta:'—', avatar:'#CFCFD4', status:'invited' },
    { id:11, name:'David Mora',     role:'Sales',     branch:'Málaga · Limonar', team:'Sur', reviews:36, sent:51, avg:4.7, goal:50, delta:'+2', avatar:'#BFBFC4', status:'active' },
  ];

  return (
    <Frame>
      <Sidebar active="team" />
      <main style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative'}}>
        <Topbar
          title="Comerciales"
          subtitle="Gestión de comerciales"
          range="11 sucursales · 24 personas"
          right={<>
            <GhostBtn>Exportar CSV</GhostBtn>
            <GhostBtn primary>+ Invitar comercial</GhostBtn>
          </>}
        />

        {/* Filter / search bar */}
        <div style={{padding:'18px 32px 0', display:'flex', gap:10, alignItems:'center'}}>
          <SearchField placeholder="Buscar por nombre, email o sucursal…" />
          <FilterPill label="Sucursal" value="Todas (11)" />
          <FilterPill label="Equipo" value="Todos" />
          <FilterPill label="Estado" value="Activos · 22" />
          <FilterPill label="Ordenar" value="Reseñas · este mes" />
          <div style={{marginLeft:'auto', display:'flex', gap:8, alignItems:'center'}}>
            <Seg options={['Tabla','Tarjetas']} value="Tabla" onChange={()=>{}}/>
          </div>
        </div>

        <div style={{flex:1, padding:'18px 32px 32px', overflow:'auto'}}>
          {/* Mini stats strip */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:16}}>
            <MiniStat label="Total" value="24" sub="comerciales en plantilla"/>
            <MiniStat label="Activos" value="22" sub="con enlace en circulación"/>
            <MiniStat label="Pausados" value="1" sub="sin actividad &gt; 30 días"/>
            <MiniStat label="Invitados" value="1" sub="pendientes de aceptar"/>
            <MiniStat label="Reseñas este mes" value="459" sub="de los 24"/>
          </div>

          {/* Table */}
          <Card padding={0} style={{marginTop:16}}>
            <div style={{
              padding:'12px 22px',
              borderBottom:'1px solid var(--line)',
              display:'grid',
              gridTemplateColumns:'24px 2fr 1.4fr 0.8fr 0.8fr 0.8fr 0.8fr 110px 32px',
              gap:14,
              fontSize:11, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.04em'
            }}>
              <span><input type="checkbox" style={{accentColor:'#1D1D1F'}}/></span>
              <span>Comercial</span>
              <span>Sucursal · Equipo</span>
              <span style={{textAlign:'right'}}>Reseñas</span>
              <span style={{textAlign:'right'}}>Conv.</span>
              <span style={{textAlign:'right'}}>★</span>
              <span style={{textAlign:'right'}}>Objetivo</span>
              <span>Estado</span>
              <span></span>
            </div>
            {ALL.map((p,i) => (
              <Row key={p.id} p={p} last={i===ALL.length-1}/>
            ))}
          </Card>

          {/* Pagination */}
          <div style={{marginTop:14, display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12.5, color:'var(--ink-3)'}}>
            <span>Mostrando 11 de 24</span>
            <div style={{display:'flex', gap:6}}>
              <GhostBtn>‹ Anterior</GhostBtn>
              <GhostBtn>Siguiente ›</GhostBtn>
            </div>
          </div>
        </div>

        {/* Invite modal overlay */}
        <InviteModal />
      </main>
    </Frame>
  );
}

function Row({ p, last }){
  const conv = p.sent ? Math.round(p.reviews/p.sent*100) : 0;
  const statusMeta = {
    active:  { label:'Activa',     tone:'ok'   },
    paused:  { label:'Pausada',    tone:'warn' },
    invited: { label:'Invitada',   tone:'neu'  },
  }[p.status || 'active'];
  return (
    <div style={{
      padding:'14px 22px',
      borderBottom: last ? 'none' : '1px solid var(--line)',
      display:'grid',
      gridTemplateColumns:'24px 2fr 1.4fr 0.8fr 0.8fr 0.8fr 0.8fr 110px 32px',
      gap:14,
      alignItems:'center',
      fontSize:13.5
    }}>
      <span><input type="checkbox" style={{accentColor:'#1D1D1F'}}/></span>
      <div style={{display:'flex', alignItems:'center', gap:12, minWidth:0}}>
        <Avatar name={p.name} size={32} color={p.avatar}/>
        <div style={{minWidth:0}}>
          <div style={{fontWeight:600, letterSpacing:'-0.005em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.name}</div>
          <div style={{fontSize:11.5, color:'var(--ink-4)', fontFamily:'var(--font-mono)'}}>reseñahub.es/c/{p.name.toLowerCase().replace(/[áéíóú]/g, m => ({á:'a',é:'e',í:'i',ó:'o',ú:'u'}[m])).replace(/\s+/g,'-')}</div>
        </div>
      </div>
      <div>
        <div style={{fontSize:13, color:'var(--ink-2)'}}>{p.branch}</div>
        <div style={{fontSize:11.5, color:'var(--ink-4)'}}>{p.team}</div>
      </div>
      <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:600}}>{p.reviews || '—'}</span>
      <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--ink-3)'}}>{p.sent ? conv+'%' : '—'}</span>
      <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{p.avg ? p.avg.toString().replace('.',',') : '—'}</span>
      <div style={{textAlign:'right'}}>
        <div style={{fontSize:12, color:'var(--ink-3)', fontVariantNumeric:'tabular-nums'}}>{p.reviews}/{p.goal}</div>
        <div style={{marginTop:4, width:80, marginLeft:'auto'}}>
          <Progress value={Math.min(p.reviews, p.goal)} max={p.goal}/>
        </div>
      </div>
      <span className={`pill ${statusMeta.tone === 'ok' ? 'ok' : statusMeta.tone === 'warn' ? 'warn' : ''}`}>
        <span className="dot"/>{statusMeta.label}
      </span>
      <span style={{textAlign:'center', color:'var(--ink-4)', cursor:'pointer', fontSize:18, letterSpacing:'-0.05em'}}>···</span>
    </div>
  );
}

function MiniStat({ label, value, sub }){
  return (
    <Card padding={16}>
      <div style={{fontSize:11.5, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.04em', fontWeight:500}}>{label}</div>
      <div style={{
        marginTop:6, fontFamily:'var(--font-display)',
        fontWeight:600, letterSpacing:'-0.025em',
        fontSize:24, fontVariantNumeric:'tabular-nums', lineHeight:1
      }}>{value}</div>
      <div style={{marginTop:6, fontSize:11.5, color:'var(--ink-4)'}} dangerouslySetInnerHTML={{__html:sub}}/>
    </Card>
  );
}

function SearchField({ placeholder }){
  return (
    <div style={{
      flex:1, maxWidth: 420,
      display:'flex', alignItems:'center', gap:8,
      padding:'8px 12px',
      background:'var(--surface)',
      border:'1px solid var(--line-strong)',
      borderRadius: 9, fontSize:13
    }}>
      <span style={{color:'var(--ink-4)'}}>⌕</span>
      <span style={{color:'var(--ink-4)'}}>{placeholder}</span>
      <span style={{marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-4)', padding:'1px 5px', border:'1px solid var(--line)', borderRadius:4}}>⌘K</span>
    </div>
  );
}

function FilterPill({ label, value }){
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap:6,
      padding:'7px 11px',
      background:'var(--surface)',
      border:'1px solid var(--line-strong)',
      borderRadius:9, fontSize:13
    }}>
      <span style={{color:'var(--ink-4)'}}>{label}</span>
      <span style={{fontWeight:500}}>{value}</span>
      <span style={{color:'var(--ink-4)', fontSize:10, marginLeft:2}}>▾</span>
    </div>
  );
}

function InviteModal(){
  return (
    <div style={{
      position:'absolute', inset:0, zIndex:20,
      background:'rgba(20,20,22,0.32)',
      backdropFilter:'blur(2px)',
      display:'flex', alignItems:'center', justifyContent:'center'
    }}>
      <div style={{
        width: 480, background:'var(--surface)',
        border:'1px solid var(--line)',
        borderRadius: 18,
        boxShadow:'0 24px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)',
        overflow:'hidden'
      }}>
        <div style={{padding:'20px 22px 14px', borderBottom:'1px solid var(--line)'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
            <div>
              <div style={{fontSize:12.5, color:'var(--ink-3)', fontWeight:500}}>Nuevo comercial</div>
              <div style={{fontFamily:'var(--font-display)', fontSize:20, fontWeight:600, letterSpacing:'-0.025em', marginTop:2}}>Invitar a la plataforma</div>
            </div>
            <span style={{fontSize:20, color:'var(--ink-4)', cursor:'pointer', lineHeight:1, marginTop:-2}}>×</span>
          </div>
          <div style={{marginTop:8, fontSize:12.5, color:'var(--ink-3)', lineHeight:1.5}}>
            Se generará un enlace personal único y un acceso al panel. La persona recibe un email para terminar el alta.
          </div>
        </div>

        <div style={{padding:'18px 22px', display:'flex', flexDirection:'column', gap:14}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <FormField label="Nombre" value="Aitana"/>
            <FormField label="Apellidos" value="Ferrer Llopis"/>
          </div>
          <FormField label="Email" value="aitana.ferrer@grupohabitar.es" mono/>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <FormField label="Cargo" value="Junior Sales"/>
            <FormField label="Teléfono (opcional)" value="—" muted/>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <FormSelect label="Sucursal" value="Valencia · Patacona"/>
            <FormSelect label="Equipo" value="Levante"/>
          </div>
          <FormSelect label="Objetivo mensual sugerido" value="30 reseñas (primer mes · ajustable luego)"/>
          <div style={{
            padding:'10px 12px',
            background:'var(--surface-2)',
            border:'1px solid var(--line)',
            borderRadius:10
          }}>
            <div style={{fontSize:11.5, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.04em'}}>Enlace que se generará</div>
            <div style={{marginTop:6, fontFamily:'var(--font-mono)', fontSize:12.5, color:'var(--ink)'}}>reseñahub.es/c/aitana-ferrer</div>
          </div>
        </div>

        <div style={{padding:'14px 22px', borderTop:'1px solid var(--line)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <span style={{fontSize:11.5, color:'var(--ink-4)'}}>El comercial recibirá el correo en menos de 1 min.</span>
          <div style={{display:'flex', gap:8}}>
            <GhostBtn>Cancelar</GhostBtn>
            <GhostBtn primary>Enviar invitación</GhostBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, mono, muted }){
  return (
    <div>
      <div style={{fontSize:11.5, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6}}>{label}</div>
      <div style={{
        padding:'9px 12px',
        background:'var(--surface)',
        border:'1px solid var(--line-strong)',
        borderRadius:9,
        fontSize:13,
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        color: muted ? 'var(--ink-4)' : 'var(--ink)'
      }}>{value}</div>
    </div>
  );
}

function FormSelect({ label, value }){
  return (
    <div>
      <div style={{fontSize:11.5, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6}}>{label}</div>
      <div style={{
        padding:'9px 12px',
        background:'var(--surface)',
        border:'1px solid var(--line-strong)',
        borderRadius:9,
        fontSize:13,
        display:'flex', justifyContent:'space-between', alignItems:'center'
      }}>
        <span>{value}</span>
        <span style={{color:'var(--ink-4)', fontSize:10}}>▾</span>
      </div>
    </div>
  );
}

Object.assign(window, { SalespeopleList });
