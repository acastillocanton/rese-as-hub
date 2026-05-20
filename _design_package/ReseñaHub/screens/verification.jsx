function VerificationScreen(){
  /* This is the admin's view into the silent verification engine. */

  const steps = [
    { k:'detected', label:'Reseña detectada',      time:'13:42:08', detail:'Google Business · Residencial Almagro' },
    { k:'parsed',   label:'Contenido analizado',   time:'13:42:09', detail:'Idioma ES · 5★ · Andrea Pinto' },
    { k:'matched',  label:'Atribuida al comercial',time:'13:42:10', detail:'Carla Ruiz · confianza 98%' },
    { k:'counted',  label:'Sumada al dashboard',   time:'13:42:10', detail:'Total Carla: 86 → 87 · Sucursal: 141 → 142' },
  ];

  const feed = [
    { t:'13:42:10', who:'Andrea Pinto',    sales:'Carla Ruiz',     stars:5, conf:98, state:'counted' },
    { t:'13:38:54', who:'Familia Soriano', sales:'Mateo Salgado',  stars:5, conf:96, state:'counted' },
    { t:'13:31:02', who:'Jorge Mas',       sales:'Tomás Iglesias', stars:4, conf:91, state:'counted' },
    { t:'13:14:47', who:'Marta Llamas',    sales:'Lucía Vega',     stars:5, conf:97, state:'counted' },
    { t:'12:58:21', who:'Diego Carranza',  sales:'Noa Herrero',    stars:5, conf:74, state:'pending', note:'ventana visita 48 h' },
    { t:'12:41:33', who:'Anónimo',         sales:'—',              stars:5, conf:38, state:'unmatched', note:'sin enlace previo · revisar' },
    { t:'12:22:09', who:'Sara Bertrán',    sales:'Inés Olivares',  stars:5, conf:99, state:'counted' },
  ];

  return (
    <Frame>
      <Sidebar active="reviews" />
      <main style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        <Topbar
          title="Reseñas · Verificación"
          subtitle="Motor de verificación"
          range="Últimas 24 h"
          right={<>
            <span className="pill ok"><span className="dot"/>Sincronizando con Google · cada 90 s</span>
            <GhostBtn>Forzar sincronización</GhostBtn>
            <GhostBtn>Configurar</GhostBtn>
          </>}
        />

        <div style={{flex:1, padding:'24px 32px 32px', overflow:'auto'}}>
          {/* Engine status */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16}}>
            <Stat label="Detectadas hoy" value="38" sub="vs 31 ayer" delta="+7" />
            <Stat label="Verificadas auto" value="36" sub="94,7% sin intervención" delta="" />
            <Stat label="Confianza media" value="96%" sub="de las atribuciones automáticas" delta="" />
            <Stat label="Tiempo medio detección" value="2,4 s" sub="desde publicación en Google" delta="−0,3 s" />
          </div>

          {/* Pipeline detail + Recent feed */}
          <div style={{display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:16, marginTop:16}}>
            {/* DETAIL */}
            <Card>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                <div>
                  <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Verificación en curso · más reciente</div>
                  <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Andrea Pinto · 5★ · Residencial Almagro</div>
                </div>
                <span className="pill ok"><span className="dot"/>completada en 2,1 s</span>
              </div>

              {/* The matched review preview */}
              <div style={{
                marginTop:16,
                padding:'14px 16px',
                border:'1px solid var(--line)',
                borderRadius:10,
                background:'var(--surface-2)'
              }}>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <Avatar name="Andrea Pinto" size={28} />
                  <div>
                    <div style={{fontSize:13.5, fontWeight:600}}>Andrea Pinto</div>
                    <div style={{display:'flex', alignItems:'center', gap:8, marginTop:2}}>
                      <Stars value={5} size={11}/>
                      <span style={{fontSize:11.5, color:'var(--ink-4)'}}>publicada en Google · hoy 13:42</span>
                    </div>
                  </div>
                  <span style={{marginLeft:'auto', fontSize:11, color:'var(--ink-4)', fontFamily:'var(--font-mono)'}}>#GR-49813</span>
                </div>
                <p style={{margin:'10px 0 0', fontSize:13, color:'var(--ink-2)', lineHeight:1.55, textWrap:'pretty'}}>
                  «Visita al piso piloto de Residencial Almagro impecable. Carla nos explicó cada detalle del plano y los acabados. Volvimos con todas las preguntas resueltas y reservamos la semana siguiente.»
                </p>
              </div>

              {/* Pipeline */}
              <div style={{marginTop:18}}>
                <div style={{fontSize:13, fontWeight:600, marginBottom:10}}>Pipeline silencioso</div>
                <div style={{display:'flex', flexDirection:'column'}}>
                  {steps.map((s,i) => {
                    const last = i===steps.length-1;
                    return (
                      <div key={s.k} style={{display:'grid', gridTemplateColumns:'18px 1fr auto', gap:14, paddingBottom: last?0:14, position:'relative'}}>
                        {/* connector line */}
                        {!last && (
                          <div style={{position:'absolute', left:8, top:18, bottom:0, width:1, background:'var(--line-strong)'}}/>
                        )}
                        <div style={{
                          width:16, height:16, marginTop:2, borderRadius:999,
                          background:'var(--ok)', color:'#fff',
                          display:'grid', placeItems:'center',
                          fontSize:10, fontWeight:700
                        }}>✓</div>
                        <div>
                          <div style={{fontSize:13.5, fontWeight:600}}>{s.label}</div>
                          <div style={{fontSize:12, color:'var(--ink-3)', marginTop:2}}>{s.detail}</div>
                        </div>
                        <div style={{fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--ink-4)', marginTop:2}}>{s.time}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Match evidence */}
              <div style={{marginTop:18, paddingTop:16, borderTop:'1px solid var(--line)'}}>
                <div style={{fontSize:13, fontWeight:600, marginBottom:10}}>Evidencias del cruce</div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10}}>
                  <Evidence
                    label="Enlace visitado"
                    detail="reseñahub.es/c/carla-ruiz · 04 may 17:32"
                    weight="40%"
                  />
                  <Evidence
                    label="Ventana temporal"
                    detail="Reseña a 11 días de la visita · dentro de ventana"
                    weight="20%"
                  />
                  <Evidence
                    label="Sucursal"
                    detail="Google Business: Residencial Almagro · Chamberí"
                    weight="20%"
                  />
                  <Evidence
                    label="Mención del comercial"
                    detail="«Carla nos explicó…» — coincide con perfil"
                    weight="18%"
                  />
                </div>
                <div style={{marginTop:14, padding:'10px 12px', background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:10, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <span style={{fontSize:12.5, color:'var(--ink-3)'}}>Confianza combinada</span>
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <div style={{width:200, height:6, background:'#E5E5EA', borderRadius:999, overflow:'hidden'}}>
                      <div style={{width:'98%', height:'100%', background:'var(--ok)'}}/>
                    </div>
                    <span style={{fontFamily:'var(--font-mono)', fontWeight:600, fontVariantNumeric:'tabular-nums'}}>98%</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* LIVE FEED */}
            <Card padding={0}>
              <div style={{padding:'18px 22px 12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Cola del motor</div>
                  <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Verificaciones recientes</div>
                </div>
                <Seg options={['Todas','Auto','Pendientes','Sin asignar']} value="Todas" onChange={()=>{}}/>
              </div>

              <div style={{padding:'0 22px 14px'}}>
                {feed.map((f,i) => {
                  const tone = f.state==='counted' ? 'ok' : f.state==='pending' ? 'warn' : 'unm';
                  const label = f.state==='counted' ? 'Contabilizada' : f.state==='pending' ? 'Esperando ventana' : 'Sin asignar';
                  const dotColor = tone==='ok' ? 'var(--ok)' : tone==='warn' ? 'var(--warn)' : 'var(--ink-4)';
                  return (
                    <div key={i} style={{padding:'14px 0', borderTop:'1px solid var(--line)'}}>
                      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:10}}>
                        <div style={{display:'flex', alignItems:'center', gap:10, minWidth:0}}>
                          <span style={{
                            width:10, height:10, borderRadius:999,
                            background: dotColor, flexShrink:0
                          }}/>
                          <span style={{fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--ink-4)'}}>{f.t}</span>
                          <span style={{fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f.who}</span>
                          <Stars value={f.stars} size={10}/>
                        </div>
                        <span style={{fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--ink-3)', fontVariantNumeric:'tabular-nums'}}>{f.conf}%</span>
                      </div>
                      <div style={{marginTop:6, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, fontSize:12, color:'var(--ink-3)'}}>
                        <span>→ {f.sales}</span>
                        <span style={{
                          fontSize:11, fontWeight:500,
                          color: tone==='ok' ? 'var(--ok)' : tone==='warn' ? 'var(--warn)' : 'var(--ink-4)'
                        }}>{label}{f.note ? ` · ${f.note}`:''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{padding:'12px 22px', borderTop:'1px solid var(--line)', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:'var(--ink-4)'}}>
                <span>14 pendientes · 2 sin asignar en últimas 24 h</span>
                <span style={{cursor:'pointer', color:'var(--ink-3)'}}>Ver todas →</span>
              </div>
            </Card>
          </div>

          {/* Configuration row */}
          <div style={{marginTop:16}}>
            <Card>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14}}>
                <div>
                  <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Reglas activas</div>
                  <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Cómo se atribuye una reseña</div>
                </div>
                <GhostBtn>Editar reglas</GhostBtn>
              </div>

              <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14}}>
                {[
                  ['Ventana de atribución','30 días desde la apertura del enlace personal.'],
                  ['Múltiples enlaces','Se atribuye al último enlace abierto por el cliente.'],
                  ['Sin enlace previo','Queda en bandeja "Sin asignar" para revisión manual.'],
                  ['Reseñas ≤ 3★','Se notifican al manager de sucursal en tiempo real.'],
                ].map((r,i) => (
                  <div key={i} style={{padding:'12px 14px', border:'1px solid var(--line)', borderRadius:10, background:'var(--surface-2)'}}>
                    <div style={{fontSize:12.5, fontWeight:600}}>{r[0]}</div>
                    <div style={{marginTop:6, fontSize:12, color:'var(--ink-3)', lineHeight:1.5}}>{r[1]}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </Frame>
  );
}

function Evidence({ label, detail, weight }){
  return (
    <div style={{
      padding:'10px 12px',
      border:'1px solid var(--line)',
      borderRadius:10,
      background:'var(--surface-2)'
    }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
        <span style={{fontSize:12.5, fontWeight:600}}>{label}</span>
        <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-4)'}}>{weight}</span>
      </div>
      <div style={{marginTop:4, fontSize:12, color:'var(--ink-3)', lineHeight:1.5}}>{detail}</div>
    </div>
  );
}

Object.assign(window, { VerificationScreen, Evidence });
