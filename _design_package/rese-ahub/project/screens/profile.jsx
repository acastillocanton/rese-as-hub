function SalespersonProfile(){
  const person = {
    name:'Carla Ruiz',
    role:'Senior Sales · Residencial Almagro',
    branch:'Madrid · Chamberí',
    team:'Equipo Norte',
    email:'carla.ruiz@grupohabitar.es',
    phone:'+34 612 884 219',
    joined:'desde feb 2023',
    slug:'reseñahub.es/c/carla-ruiz',
    reviews:87, sent:102, avg:4.9, goal:90
  };

  const reviews = [
    { id:1, name:'Andrea Pinto',    when:'hoy · 12:48',  stars:5, text:'Visita al piso piloto impecable. Carla nos explicó cada detalle del plano y los acabados. Volvimos con todas las preguntas resueltas y reservamos la semana siguiente.', verified:true },
    { id:2, name:'Beatriz Llorente',when:'hoy · 09:12',  stars:5, text:'Trato exquisito. Nos sentamos con calma a repasar la financiación y nos enseñó el dúplex incluso fuera de horario.', verified:true },
    { id:3, name:'Javier Soto',     when:'ayer · 18:34', stars:5, text:'Conocemos Chamberí desde hace años y aún así Carla nos descubrió detalles del proyecto que no habríamos visto. Muy recomendable.', verified:true },
    { id:4, name:'Familia Ortuño',  when:'ayer · 11:02', stars:4, text:'Buena atención, el dossier técnico llegó tarde pero acabó resolviéndose. La visita en sí, perfecta.', verified:true },
    { id:5, name:'Núria Sender',    when:'13 may',       stars:5, text:'Recomiendo el piso piloto y especialmente a Carla. Acabamos el café con la maqueta sobre la mesa.', verified:true },
  ];

  return (
    <Frame>
      <Sidebar active="team" />
      <main style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        <Topbar
          title="Comerciales · Carla Ruiz"
          subtitle="Ficha del comercial"
          range="Este mes · mayo"
          right={<>
            <GhostBtn>Editar ficha</GhostBtn>
            <GhostBtn>Suspender</GhostBtn>
            <GhostBtn primary>Compartir enlace</GhostBtn>
          </>}
        />

        <div style={{flex:1, padding:'24px 32px 32px', overflow:'auto'}}>
          {/* Hero card */}
          <Card padding={24}>
            <div style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:28, alignItems:'center'}}>
              <div style={{position:'relative'}}>
                <Avatar name={person.name} size={88} color="#C7C7CC"/>
                <span className="pill ok" style={{position:'absolute', bottom:-6, right:-6}}><span className="dot"/>activa</span>
              </div>
              <div>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <h2 style={{margin:0, fontFamily:'var(--font-display)', fontSize:24, fontWeight:600, letterSpacing:'-0.025em'}}>{person.name}</h2>
                  <span className="pill"><span style={{color:'var(--gold)'}}>◆</span>Top performer</span>
                  <span className="pill">3 meses seguidos #1</span>
                </div>
                <div style={{marginTop:4, color:'var(--ink-3)', fontSize:13.5}}>{person.role}</div>
                <div style={{marginTop:14, display:'flex', gap:24, fontSize:12.5, color:'var(--ink-3)'}}>
                  <span><span style={{color:'var(--ink-4)'}}>Sucursal</span> &nbsp; {person.branch}</span>
                  <span><span style={{color:'var(--ink-4)'}}>Equipo</span> &nbsp; {person.team}</span>
                  <span><span style={{color:'var(--ink-4)'}}>Alta</span> &nbsp; {person.joined}</span>
                </div>
                <div style={{marginTop:8, display:'flex', gap:24, fontSize:12.5, color:'var(--ink-3)'}}>
                  <span><span style={{color:'var(--ink-4)'}}>Email</span> &nbsp; {person.email}</span>
                  <span><span style={{color:'var(--ink-4)'}}>Teléfono</span> &nbsp; {person.phone}</span>
                </div>
              </div>

              {/* mini KPI bar */}
              <div style={{display:'grid', gridTemplateColumns:'repeat(4,auto)', gap:24, paddingLeft:24, borderLeft:'1px solid var(--line)'}}>
                {[
                  ['Reseñas','87','este mes'],
                  ['Conversión','85%','102 enlaces'],
                  ['Estrellas','4,9','★★★★★'],
                  ['Ranking','#1','de 24'],
                ].map((k,i) => (
                  <div key={i}>
                    <div style={{fontSize:11, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.04em'}}>{k[0]}</div>
                    <div style={{fontFamily:'var(--font-display)', fontSize:24, fontWeight:600, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em', marginTop:4}}>{k[1]}</div>
                    <div style={{fontSize:11.5, color:'var(--ink-4)', marginTop:2}}>{k[2]}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Two-column body */}
          <div style={{display:'grid', gridTemplateColumns:'1.65fr 1fr', gap:16, marginTop:16}}>
            {/* LEFT */}
            <div style={{display:'flex', flexDirection:'column', gap:16}}>
              {/* Chart */}
              <Card>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Histórico personal</div>
                    <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Reseñas verificadas por mes</div>
                  </div>
                  <Seg options={['12m','6m','3m']} value="12m" onChange={()=>{}} />
                </div>
                <div style={{marginTop:14}}>
                  <MonthBars
                    data={[42, 48, 51, 55, 61, 64, 70, 66, 73, 79, 81, 87]}
                    labels={MONTHS}
                    height={180}
                    highlight={11}
                  />
                </div>
              </Card>

              {/* Reviews list */}
              <Card padding={0}>
                <div style={{padding:'18px 22px 12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Histórico</div>
                    <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Reseñas verificadas (87)</div>
                  </div>
                  <div style={{display:'flex', gap:10, alignItems:'center', fontSize:12, color:'var(--ink-3)'}}>
                    <Seg options={['Todas','5★','4★','≤3★']} value="Todas" onChange={()=>{}} />
                  </div>
                </div>
                {reviews.map((r,i) => (
                  <div key={r.id} style={{padding:'14px 22px', borderTop:'1px solid var(--line)'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                      <div style={{display:'flex', alignItems:'center', gap:10}}>
                        <Avatar name={r.name} size={26}/>
                        <span style={{fontSize:13.5, fontWeight:600}}>{r.name}</span>
                        <Stars value={r.stars} size={11}/>
                      </div>
                      <span style={{fontSize:11.5, color:'var(--ink-4)'}}>{r.when}</span>
                    </div>
                    <p style={{margin:'8px 0 10px', fontSize:13, color:'var(--ink-2)', lineHeight:1.55, textWrap:'pretty'}}>{r.text}</p>
                    <div style={{display:'flex', gap:8}}>
                      <span className="pill ok"><span className="dot"/>Verificada en Google</span>
                      <span className="pill">Cliente del piso piloto · 04 may</span>
                    </div>
                  </div>
                ))}
                <div style={{padding:'14px 22px', borderTop:'1px solid var(--line)', textAlign:'center'}}>
                  <span style={{fontSize:12.5, color:'var(--ink-3)', cursor:'pointer'}}>Ver las 82 restantes →</span>
                </div>
              </Card>
            </div>

            {/* RIGHT */}
            <div style={{display:'flex', flexDirection:'column', gap:16}}>
              {/* Link + QR */}
              <Card>
                <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Enlace personal</div>
                <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Para compartir con clientes</div>
                <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:14, alignItems:'center', marginTop:14}}>
                  <div>
                    <div style={{
                      padding:'10px 12px',
                      border:'1px solid var(--line-strong)',
                      borderRadius:9,
                      background:'var(--surface-2)',
                      fontFamily:'var(--font-mono)', fontSize:12.5, color:'var(--ink-2)',
                      display:'flex', justifyContent:'space-between', alignItems:'center'
                    }}>
                      <span>{person.slug}</span>
                      <span style={{fontSize:11, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.05em'}}>copiar</span>
                    </div>
                    <div style={{marginTop:10, display:'flex', gap:8}}>
                      <GhostBtn>WhatsApp</GhostBtn>
                      <GhostBtn>Email</GhostBtn>
                      <GhostBtn>SMS</GhostBtn>
                    </div>
                    <div style={{marginTop:14, fontSize:12, color:'var(--ink-4)', lineHeight:1.5}}>
                      Al abrirlo, el cliente va directamente a la ficha de Google Business. La aplicación detecta automáticamente la reseña y la asocia a Carla.
                    </div>
                  </div>
                  <QRPlaceholder />
                </div>
              </Card>

              {/* Monthly goal */}
              <Card>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Objetivo de mayo</div>
                    <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>87 / 90 reseñas</div>
                  </div>
                  <span className="pill ok"><span className="dot"/>97% alcanzado</span>
                </div>
                <div style={{marginTop:14}}><Progress value={87} max={90} /></div>
                <div style={{marginTop:8, fontSize:12, color:'var(--ink-4)'}}>Faltan 3 reseñas en 11 días. Ritmo de cierre 0,3/día — objetivo asegurado.</div>

                <div style={{marginTop:18, paddingTop:14, borderTop:'1px solid var(--line)'}}>
                  <div style={{fontSize:13, fontWeight:600, marginBottom:10}}>Logros</div>
                  <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
                    <Badge>3 meses seguidos #1</Badge>
                    <Badge>50 reseñas 5★ seguidas</Badge>
                    <Badge>Cierre &lt; 24h</Badge>
                    <Badge>Embajadora Chamberí</Badge>
                  </div>
                </div>
              </Card>

              {/* Activity */}
              <Card>
                <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Actividad reciente</div>
                <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Últimos eventos</div>
                <div style={{marginTop:14, display:'flex', flexDirection:'column', gap:0}}>
                  {[
                    ['hace 12 min','Reseña verificada de Andrea Pinto · 5★'],
                    ['hace 38 min','Enlace enviado a Familia Soriano vía WhatsApp'],
                    ['hace 2 h',   'Reseña verificada de Marta Llamas · 5★'],
                    ['hoy 09:12',  'Reseña verificada de Beatriz Llorente · 5★'],
                    ['ayer',       '4 enlaces enviados tras visita guiada'],
                    ['12 may',     'Objetivo mensual al 50%'],
                  ].map((e,i,arr) => (
                    <div key={i} style={{display:'grid', gridTemplateColumns:'14px 1fr', gap:12, padding:'10px 0', borderTop: i===0?'1px solid var(--line)':'1px solid var(--line)'}}>
                      <div style={{display:'flex', justifyContent:'center'}}>
                        <span style={{width:6, height:6, borderRadius:999, background:'var(--ink-5)', marginTop:7}}/>
                      </div>
                      <div>
                        <div style={{fontSize:11.5, color:'var(--ink-4)'}}>{e[0]}</div>
                        <div style={{fontSize:13, color:'var(--ink-2)', marginTop:1}}>{e[1]}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </Frame>
  );
}

function Badge({ children }){
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:6,
      padding:'5px 9px', borderRadius:7,
      background:'var(--surface-2)', border:'1px solid var(--line)',
      fontSize:11.5, color:'var(--ink-2)', fontWeight:500
    }}>
      <span style={{width:5, height:5, borderRadius:999, background:'var(--ink-3)'}}/>
      {children}
    </span>
  );
}

function QRPlaceholder(){
  /* hand-drawn QR-ish pattern */
  const cells = useMemo(() => {
    const seed = 42;
    const rnd = (n) => ((Math.sin(seed*n*97.13)+1)/2);
    const out = [];
    for(let y=0;y<13;y++){
      for(let x=0;x<13;x++){
        const corner = (x<3&&y<3)||(x>9&&y<3)||(x<3&&y>9);
        const center = x>=5&&x<=7&&y>=5&&y<=7;
        out.push({x,y,on: corner || center ? true : rnd(y*13+x) > 0.55});
      }
    }
    return out;
  }, []);
  const cs = 8, pad = 6;
  const size = 13*cs + pad*2;
  return (
    <div style={{padding:10, border:'1px solid var(--line-strong)', borderRadius:10, background:'#fff'}}>
      <svg width={size} height={size} style={{display:'block'}}>
        <rect width={size} height={size} fill="#fff"/>
        {cells.map((c,i) => c.on && (
          <rect key={i} x={pad + c.x*cs} y={pad + c.y*cs} width={cs} height={cs} fill="#1D1D1F"/>
        ))}
      </svg>
      <div style={{textAlign:'center', fontSize:10.5, color:'var(--ink-4)', marginTop:6, fontFamily:'var(--font-mono)'}}>c/carla-ruiz</div>
    </div>
  );
}

Object.assign(window, { SalespersonProfile, QRPlaceholder, Badge });
