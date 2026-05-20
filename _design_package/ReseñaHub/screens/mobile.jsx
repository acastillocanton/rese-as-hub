/* Mobile view of the comercial — what they use in the field. */

function SalespersonMobile(){
  return (
    <div style={{
      width:'100%', height:'100%',
      background:'#E8E8EC',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:32
    }}>
      <IOSDevice width={402} height={874}>
        <MobileHome />
      </IOSDevice>
    </div>
  );
}

function MobileHome(){
  return (
    <div style={{
      height:'100%',
      background:'#F2F2F7',
      display:'flex', flexDirection:'column',
      fontFamily:'-apple-system, "SF Pro Text", system-ui',
      color:'#1D1D1F'
    }}>
      {/* Spacer to clear the status bar */}
      <div style={{height:60}}/>

      {/* Header */}
      <div style={{padding:'4px 20px 14px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <div style={{fontSize:13, color:'#6E6E73'}}>Mateo, buenos días</div>
          <div style={{fontFamily:'-apple-system, "SF Pro Display"', fontSize:28, fontWeight:700, letterSpacing:'-0.025em', lineHeight:1.1, marginTop:2}}>Tu panel</div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <BellPill count={3}/>
          <Avatar name="Mateo Salgado" size={36} color="#C7C7CC"/>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{flex:1, overflow:'auto', padding:'0 16px 90px'}}>

        {/* HERO progress card */}
        <div style={{
          background:'#1D1D1F',
          color:'#fff',
          borderRadius:22,
          padding:'18px 18px 16px',
          position:'relative',
          overflow:'hidden'
        }}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <span style={{fontSize:12, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.05em'}}>Mayo</span>
            <span style={{
              fontSize:11.5, color:'#fff',
              padding:'3px 8px',
              background:'rgba(255,255,255,0.12)',
              borderRadius:999
            }}>#2 del ranking</span>
          </div>
          <div style={{display:'flex', alignItems:'baseline', gap:10, marginTop:14}}>
            <span style={{fontFamily:'-apple-system, "SF Pro Display"', fontSize:64, fontWeight:600, letterSpacing:'-0.04em', lineHeight:1, fontVariantNumeric:'tabular-nums'}}>74</span>
            <span style={{fontSize:14, color:'rgba(255,255,255,0.65)'}}>de 80 reseñas</span>
          </div>
          <div style={{marginTop:14, height:5, borderRadius:999, background:'rgba(255,255,255,0.16)', overflow:'hidden'}}>
            <div style={{width:'92%', height:'100%', background:'#fff', borderRadius:999}}/>
          </div>
          <div style={{marginTop:10, display:'flex', justifyContent:'space-between', fontSize:12, color:'rgba(255,255,255,0.65)'}}>
            <span>92% del objetivo</span>
            <span>Faltan 6 · ritmo 0,6/día</span>
          </div>
        </div>

        {/* Personal link — the most important action on this screen */}
        <div style={{
          marginTop:14,
          background:'#fff',
          borderRadius:18,
          padding:'16px 16px 14px',
          boxShadow:'0 1px 2px rgba(0,0,0,0.04)'
        }}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <span style={{fontSize:12.5, color:'#6E6E73', fontWeight:500}}>Tu enlace personal</span>
            <span style={{
              display:'inline-flex', alignItems:'center', gap:6,
              padding:'2px 8px', borderRadius:999,
              background:'#E8F0EB', color:'#2D7D46',
              fontSize:11, fontWeight:500
            }}>
              <span style={{width:5, height:5, borderRadius:999, background:'#2D7D46'}}/>
              activo
            </span>
          </div>
          <div style={{
            marginTop:10,
            padding:'12px 14px',
            background:'#F2F2F7',
            borderRadius:12,
            fontFamily:'ui-monospace, "SF Mono"',
            fontSize:13, color:'#1D1D1F',
            display:'flex', justifyContent:'space-between', alignItems:'center'
          }}>
            <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>reseñahub.es/c/mateo-salgado</span>
            <span style={{color:'#86868B', fontSize:14, marginLeft:8}}>⎘</span>
          </div>

          <div style={{marginTop:12, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <MobileBtn primary>WhatsApp</MobileBtn>
            <MobileBtn>Compartir</MobileBtn>
          </div>
          <div style={{marginTop:8, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
            <MobileBtn small>Email</MobileBtn>
            <MobileBtn small>SMS</MobileBtn>
            <MobileBtn small>QR</MobileBtn>
          </div>
        </div>

        {/* Today summary */}
        <div style={{marginTop:18}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'0 4px'}}>
            <span style={{fontSize:13, color:'#6E6E73', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em'}}>Hoy</span>
            <span style={{fontSize:12, color:'#86868B'}}>20 mayo</span>
          </div>
          <div style={{marginTop:10, display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10}}>
            <MobileTile big="3" label="Reseñas nuevas" tone="ok"/>
            <MobileTile big="5" label="Enlaces enviados"/>
            <MobileTile big="5,0" label="Estrellas hoy"/>
          </div>
        </div>

        {/* Recent reviews */}
        <div style={{marginTop:20}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'0 4px'}}>
            <span style={{fontSize:13, color:'#6E6E73', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em'}}>Últimas reseñas</span>
            <span style={{fontSize:12, color:'#86868B'}}>ver todas</span>
          </div>
          <div style={{marginTop:10, background:'#fff', borderRadius:18, overflow:'hidden'}}>
            {[
              { n:'Familia Soriano', s:5, t:'Atención de diez. Nos enseñó tres tipologías sin prisa.', when:'hace 38 min', verified:true },
              { n:'Jorge Mas',       s:4, t:'Muy correcto. Volveremos con la financiación cerrada.',     when:'hace 1 h',   verified:true },
              { n:'Cristina Aller',  s:5, t:'Mateo nos cuidó del primer minuto al último.',              when:'ayer',       verified:true },
            ].map((r,i,arr) => (
              <div key={i} style={{
                padding:'14px 16px',
                borderTop: i===0 ? 'none' : '1px solid #E5E5EA'
              }}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <Avatar name={r.n} size={28}/>
                    <div>
                      <div style={{fontSize:13.5, fontWeight:600}}>{r.n}</div>
                      <Stars value={r.s} size={11}/>
                    </div>
                  </div>
                  <span style={{fontSize:11.5, color:'#86868B'}}>{r.when}</span>
                </div>
                <p style={{margin:'8px 0 0', fontSize:13, color:'#3C3C43', lineHeight:1.45}}>{r.t}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tip */}
        <div style={{
          marginTop:18,
          padding:'14px 16px',
          background:'#fff',
          borderRadius:18,
          display:'flex', gap:12,
          alignItems:'flex-start',
          boxShadow:'0 1px 2px rgba(0,0,0,0.04)'
        }}>
          <div style={{
            width:32, height:32, borderRadius:10,
            background:'#F2F2F7',
            display:'grid', placeItems:'center',
            flexShrink:0, color:'#6E6E73'
          }}>◇</div>
          <div>
            <div style={{fontSize:13, fontWeight:600}}>Envía el enlace cuanto antes</div>
            <div style={{marginTop:3, fontSize:12.5, color:'#6E6E73', lineHeight:1.5}}>
              Las reseñas pedidas en las primeras 2 h tras la visita convierten <b style={{color:'#1D1D1F'}}>2,3×</b> mejor.
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <TabBar />
    </div>
  );
}

function BellPill({ count }){
  return (
    <div style={{
      position:'relative',
      width:36, height:36, borderRadius:999,
      background:'#fff',
      display:'grid', placeItems:'center',
      color:'#3C3C43',
      boxShadow:'0 1px 2px rgba(0,0,0,0.05)'
    }}>
      <span style={{fontSize:16}}>♪</span>
      {count > 0 && (
        <span style={{
          position:'absolute', top:-2, right:-2,
          minWidth:16, height:16, padding:'0 4px',
          borderRadius:999, background:'#1D1D1F', color:'#fff',
          fontSize:10, fontWeight:600,
          display:'grid', placeItems:'center',
          border:'2px solid #F2F2F7'
        }}>{count}</span>
      )}
    </div>
  );
}

function MobileBtn({ children, primary, small }){
  return (
    <button style={{
      width:'100%',
      padding: small ? '9px 0' : '13px 0',
      borderRadius: 12,
      border: primary ? 'none' : '1px solid #D2D2D7',
      background: primary ? '#1D1D1F' : '#fff',
      color: primary ? '#fff' : '#1D1D1F',
      fontSize: small ? 13 : 14.5, fontWeight: 600,
      letterSpacing:'-0.01em',
      cursor:'pointer'
    }}>{children}</button>
  );
}

function MobileTile({ big, label, tone }){
  const accent = tone === 'ok' ? '#2D7D46' : '#1D1D1F';
  return (
    <div style={{
      padding:'14px 12px',
      background:'#fff',
      borderRadius:14,
      boxShadow:'0 1px 2px rgba(0,0,0,0.04)'
    }}>
      <div style={{
        fontFamily:'-apple-system, "SF Pro Display"',
        fontSize:26, fontWeight:600,
        letterSpacing:'-0.025em',
        fontVariantNumeric:'tabular-nums',
        color: accent, lineHeight:1
      }}>{big}</div>
      <div style={{marginTop:6, fontSize:11.5, color:'#6E6E73', lineHeight:1.3}}>{label}</div>
    </div>
  );
}

function TabBar(){
  const items = [
    ['Panel', '◧', true],
    ['Enlace','⊕', false],
    ['Reseñas','★', false],
    ['Ranking','◑', false],
  ];
  return (
    <div style={{
      borderTop:'1px solid #E5E5EA',
      background:'rgba(248,248,250,0.92)',
      backdropFilter:'blur(20px)',
      padding:'10px 12px 30px',
      display:'flex', justifyContent:'space-around'
    }}>
      {items.map(([l,icon,on],i) => (
        <div key={i} style={{
          display:'flex', flexDirection:'column', alignItems:'center', gap:2,
          color: on ? '#1D1D1F' : '#86868B',
          fontWeight: on ? 600 : 500
        }}>
          <span style={{fontSize:18}}>{icon}</span>
          <span style={{fontSize:10.5}}>{l}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { SalespersonMobile });
