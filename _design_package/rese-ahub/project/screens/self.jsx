function SalespersonSelf(){
  const me = {
    name:'Mateo Salgado',
    role:'Sales · Residencial Almagro',
    slug:'reseñahub.es/c/mateo-salgado',
  };

  return (
    <Frame>
      {/* Slimmer sidebar for the comercial — fewer admin tools */}
      <aside style={{
        width: 232, flexShrink:0,
        background: 'var(--bg)',
        borderRight: '1px solid var(--line)',
        padding: '20px 14px',
        display:'flex', flexDirection:'column', gap: 22
      }}>
        <div style={{display:'flex', alignItems:'center', gap:10, padding:'4px 8px'}}>
          <div style={{
            width:26, height:26, borderRadius:8,
            background:'#1D1D1F', color:'#fff',
            display:'grid', placeItems:'center',
            fontSize:13, fontWeight:700
          }}>r</div>
          <div style={{fontWeight:600, fontSize:14, letterSpacing:'-0.015em'}}>ReseñaHub</div>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:2}}>
          {[
            ['Mi panel', true],
            ['Mi enlace', false],
            ['Mis reseñas', false],
            ['Objetivos', false],
            ['Ranking', false],
          ].map(([l,on]) => (
            <div key={l} style={{
              padding:'7px 10px', borderRadius:8,
              background: on ? 'rgba(0,0,0,0.05)' : 'transparent',
              color: on ? 'var(--ink)' : 'var(--ink-3)',
              fontSize: 13.5, fontWeight: on?600:500, cursor:'pointer'
            }}>{l}</div>
          ))}
        </div>
        <div style={{marginTop:'auto', display:'flex', alignItems:'center', gap:10, padding:'8px 8px', borderTop:'1px solid var(--line)', paddingTop:14}}>
          <Avatar name={me.name} size={28}/>
          <div style={{lineHeight:1.15}}>
            <div style={{fontSize:13, fontWeight:600}}>{me.name}</div>
            <div style={{fontSize:11.5, color:'var(--ink-4)'}}>Comercial · Madrid Centro</div>
          </div>
        </div>
      </aside>

      <main style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        <Topbar
          title="Mi panel"
          subtitle="Buenos días, Mateo"
          range="Este mes · mayo"
          right={<>
            <DateRange value="Mes actual"/>
            <GhostBtn primary>Compartir mi enlace</GhostBtn>
          </>}
        />

        <div style={{flex:1, padding:'24px 32px 32px', overflow:'auto'}}>
          {/* HERO summary — single calm row */}
          <Card padding={28}>
            <div style={{display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:32, alignItems:'center'}}>
              <div>
                <div style={{fontSize:13, color:'var(--ink-3)'}}>Llevas en mayo</div>
                <div style={{display:'flex', alignItems:'baseline', gap:14, marginTop:6}}>
                  <span style={{fontFamily:'var(--font-display)', fontSize:64, fontWeight:600, letterSpacing:'-0.035em', lineHeight:1, fontVariantNumeric:'tabular-nums'}}>74</span>
                  <span style={{fontSize:16, color:'var(--ink-3)'}}>reseñas verificadas</span>
                  <span className="pill ok" style={{marginLeft:8}}><span className="dot"/>+9 vs. abril</span>
                </div>
                <div style={{marginTop:18, display:'flex', gap:32, color:'var(--ink-3)', fontSize:13}}>
                  <span><span style={{color:'var(--ink-4)'}}>Conversión</span> &nbsp;<b style={{color:'var(--ink)'}}>77%</b></span>
                  <span><span style={{color:'var(--ink-4)'}}>Estrellas</span> &nbsp;<b style={{color:'var(--ink)'}}>4,8</b></span>
                  <span><span style={{color:'var(--ink-4)'}}>Ranking</span> &nbsp;<b style={{color:'var(--ink)'}}>#2 de 24</b></span>
                </div>
              </div>

              {/* Goal ring + objective text */}
              <div style={{display:'flex', alignItems:'center', gap:24}}>
                <Ring value={74} max={80} size={140} />
                <div>
                  <div style={{fontSize:13, color:'var(--ink-3)'}}>Objetivo mensual</div>
                  <div style={{fontSize:24, fontWeight:600, letterSpacing:'-0.02em', marginTop:4, fontVariantNumeric:'tabular-nums'}}>74 / 80</div>
                  <div style={{marginTop:6, fontSize:12.5, color:'var(--ink-4)', lineHeight:1.5, maxWidth:240}}>
                    Faltan <b style={{color:'var(--ink)'}}>6 reseñas</b> en 11 días. Con tu ritmo actual cierras objetivo el <b style={{color:'var(--ink)'}}>23 de mayo</b>.
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Personal link prominent + tips */}
          <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, marginTop:16}}>
            <Card padding={24}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                <div>
                  <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Tu enlace personal</div>
                  <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Para enviar a clientes tras la visita</div>
                </div>
                <span className="pill ok"><span className="dot"/>Activo</span>
              </div>

              <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:18, alignItems:'center', marginTop:18}}>
                <div>
                  <div style={{
                    padding:'14px 14px',
                    border:'1px solid var(--line-strong)',
                    borderRadius:10,
                    background:'var(--surface-2)',
                    display:'flex', justifyContent:'space-between', alignItems:'center', gap:10
                  }}>
                    <span style={{fontFamily:'var(--font-mono)', fontSize:13.5, color:'var(--ink-2)'}}>{me.slug}</span>
                    <GhostBtn>Copiar</GhostBtn>
                  </div>
                  <div style={{marginTop:12, display:'flex', gap:8, flexWrap:'wrap'}}>
                    <GhostBtn primary>WhatsApp</GhostBtn>
                    <GhostBtn>Email</GhostBtn>
                    <GhostBtn>SMS</GhostBtn>
                    <GhostBtn>QR para imprimir</GhostBtn>
                  </div>
                  <div style={{marginTop:14, fontSize:12.5, color:'var(--ink-4)', lineHeight:1.55, maxWidth:520}}>
                    Cuando el cliente lo abra, irá a la ficha de Google Business de Residencial Almagro. La aplicación detecta su reseña automáticamente y te la suma — sin que tengas que hacer nada más.
                  </div>
                </div>
                <QRPlaceholder />
              </div>
            </Card>

            <Card>
              <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Consejos</div>
              <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Para subir tu conversión</div>
              <div style={{marginTop:14, display:'flex', flexDirection:'column', gap:0}}>
                {[
                  ['1','Envía el enlace en las primeras 2 horas tras la visita — la conversión cae a la mitad pasado un día.'],
                  ['2','El WhatsApp convierte 2,3× mejor que el email para clientes que ya visitaron piso piloto.'],
                  ['3','Comparte el QR impreso en el dossier que entregas al final de la visita.'],
                ].map((c,i) => (
                  <div key={i} style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:12, padding:'10px 0', borderTop:'1px solid var(--line)'}}>
                    <span style={{
                      width:22, height:22, borderRadius:7,
                      background:'var(--surface-2)', border:'1px solid var(--line)',
                      display:'grid', placeItems:'center',
                      fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'
                    }}>{c[0]}</span>
                    <div style={{fontSize:13, color:'var(--ink-2)', lineHeight:1.5, textWrap:'pretty'}}>{c[1]}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Chart + recent reviews */}
          <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, marginTop:16}}>
            <Card>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                <div>
                  <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Tu evolución</div>
                  <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Reseñas verificadas por mes</div>
                </div>
                <Seg options={['12m','6m','3m']} value="6m" onChange={()=>{}}/>
              </div>
              <div style={{marginTop:14}}>
                <MonthBars
                  data={[51,55,59,62,65,74]}
                  labels={['Dic','Ene','Feb','Mar','Abr','May']}
                  height={180}
                  highlight={5}
                />
              </div>
            </Card>

            <Card padding={0}>
              <div style={{padding:'18px 22px 8px'}}>
                <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Últimas reseñas</div>
                <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Esta semana</div>
              </div>
              {[
                { n:'Familia Soriano', s:5, t:'Atención de diez. Nos enseñó tres tipologías sin prisa.', when:'hace 38 min' },
                { n:'Jorge Mas',       s:4, t:'Muy correcto. Volveremos con la financiación cerrada.', when:'hace 1 h' },
                { n:'Cristina Aller',  s:5, t:'Mateo nos cuidó del primer minuto al último.', when:'ayer' },
                { n:'Pareja Hidalgo',  s:5, t:'Salimos con la maqueta y el plano marcado.', when:'14 may' },
              ].map((r,i) => (
                <div key={i} style={{padding:'12px 22px', borderTop:'1px solid var(--line)'}}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <Avatar name={r.n} size={24}/>
                      <span style={{fontSize:13, fontWeight:600}}>{r.n}</span>
                      <Stars value={r.s} size={11}/>
                    </div>
                    <span style={{fontSize:11.5, color:'var(--ink-4)'}}>{r.when}</span>
                  </div>
                  <p style={{margin:'6px 0 0', fontSize:13, color:'var(--ink-2)', lineHeight:1.5}}>{r.t}</p>
                </div>
              ))}
              <div style={{padding:'12px 22px', borderTop:'1px solid var(--line)', textAlign:'center'}}>
                <span style={{fontSize:12.5, color:'var(--ink-3)', cursor:'pointer'}}>Ver todas mis reseñas →</span>
              </div>
            </Card>
          </div>

          {/* Ranking + badges */}
          <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, marginTop:16}}>
            <Card>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                <div>
                  <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Tu posición</div>
                  <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Ranking del mes</div>
                </div>
                <span className="pill"><span className="dot"/>Visible solo para ti y tu manager</span>
              </div>
              <div style={{marginTop:14, display:'flex', flexDirection:'column', gap:0}}>
                {[
                  ['1','Carla Ruiz','Chamberí','87'],
                  ['2','Mateo Salgado','Madrid Centro','74'],
                  ['3','Lucía Vega','Patacona','71'],
                  ['4','Tomás Iglesias','Madrid Centro','62'],
                ].map((row,i) => {
                  const me = row[1] === 'Mateo Salgado';
                  return (
                    <div key={i} style={{
                      display:'grid', gridTemplateColumns:'32px 1fr auto auto', gap:14,
                      padding:'12px 12px', borderRadius:10,
                      background: me ? '#F0F0F2' : 'transparent',
                      alignItems:'center'
                    }}>
                      <span style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--ink-4)'}}>{row[0]}</span>
                      <div style={{display:'flex', alignItems:'center', gap:10}}>
                        <Avatar name={row[1]} size={26}/>
                        <span style={{fontSize:13.5, fontWeight: me?700:600}}>{row[1]}{me ? <span style={{color:'var(--ink-4)', fontWeight:400}}> · tú</span> : ''}</span>
                      </div>
                      <span style={{fontSize:12.5, color:'var(--ink-4)'}}>{row[2]}</span>
                      <span style={{fontFamily:'var(--font-mono)', fontWeight:600, fontVariantNumeric:'tabular-nums'}}>{row[3]}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{marginTop:6, padding:'10px 12px', fontSize:12, color:'var(--ink-3)', borderTop:'1px solid var(--line)'}}>
                Estás a <b style={{color:'var(--ink)'}}>13 reseñas</b> del #1. Mantén tu ritmo y cerrarás el mes en posición <b style={{color:'var(--ink)'}}>#1 o #2</b>.
              </div>
            </Card>

            <Card>
              <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Logros</div>
              <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Insignias conseguidas</div>
              <div style={{marginTop:16, display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10}}>
                {[
                  ['Racha 10', 'reseñas seguidas 5★'],
                  ['Maratón', '60 reseñas en un mes'],
                  ['Cierre 24h', 'media bajo 1 día'],
                  ['Veterano', '1 año en plataforma'],
                  ['Embajador', 'Madrid Centro'],
                  ['+2 por desbloquear', null],
                ].map((b,i) => (
                  <div key={i} style={{
                    padding:'12px 10px',
                    border:'1px solid var(--line)',
                    borderRadius:10,
                    background: i===5 ? 'transparent' : 'var(--surface-2)',
                    textAlign:'center',
                    opacity: i===5 ? 0.55 : 1
                  }}>
                    <div style={{
                      width:30, height:30, margin:'0 auto 8px',
                      borderRadius:999,
                      background: i===5 ? 'transparent' : '#E5E5EA',
                      border: i===5 ? '1px dashed var(--line-strong)' : 'none',
                      display:'grid', placeItems:'center',
                      color:'var(--ink-3)', fontSize:13
                    }}>{i===5 ? '+' : '◆'}</div>
                    <div style={{fontSize:12, fontWeight:600}}>{b[0]}</div>
                    {b[1] && <div style={{fontSize:10.5, color:'var(--ink-4)', marginTop:2}}>{b[1]}</div>}
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

function Ring({ value, max, size=120 }){
  const r = size/2 - 8;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value/max);
  return (
    <svg width={size} height={size} style={{display:'block'}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E5E5EA" strokeWidth="6"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1D1D1F" strokeWidth="6"
        strokeDasharray={`${c*pct} ${c}`}
        strokeDashoffset={c*0.25}
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{transform:`rotate(-90deg)`, transformOrigin:'center', strokeLinecap:'round'}}
      />
      <text x={size/2} y={size/2-2} textAnchor="middle" fontSize="22" fontWeight="600" fill="#1D1D1F" fontFamily="var(--font-display)" style={{letterSpacing:'-0.02em'}}>
        {Math.round(pct*100)}%
      </text>
      <text x={size/2} y={size/2+16} textAnchor="middle" fontSize="10.5" fill="#86868B" style={{textTransform:'uppercase', letterSpacing:'0.05em'}}>
        objetivo
      </text>
    </svg>
  );
}

Object.assign(window, { SalespersonSelf, Ring });
