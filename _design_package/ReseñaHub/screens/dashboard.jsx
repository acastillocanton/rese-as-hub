function AdminDashboard(){
  return (
    <Frame>
      <Sidebar active="dashboard" />
      <main style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        <Topbar
          title="Dashboard"
          subtitle="Dashboard general"
          range="Este mes · mayo"
          right={<>
            <Seg options={['Hoy','Semana','Mes','Año']} value="Mes" onChange={()=>{}} />
            <GhostBtn>Exportar</GhostBtn>
            <GhostBtn primary>Invitar comercial</GhostBtn>
          </>}
        />

        <div style={{flex:1, padding:'24px 32px 32px', overflow:'auto'}}>
          {/* KPI row */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16}}>
            <Stat label="Reseñas totales"   value="459"  sub="vs 387 el mes pasado" delta="+18,6%" />
            <Stat label="Conversión enlace → reseña" value="78,4%" sub="585 enlaces · 459 reseñas" delta="+4,1 pp" />
            <Stat label="Valoración media"  value="4,82" sub="sobre 5 · 459 valoraciones" delta="+0,07" />
            <Stat label="Pendientes de verificar" value="14" sub="detectando vía Google Business" delta="−6" deltaTone="ok" />
          </div>

          {/* Chart + goals */}
          <div style={{display:'grid', gridTemplateColumns:'1.85fr 1fr', gap:16, marginTop:16}}>
            <Card>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6}}>
                <div>
                  <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Evolución temporal</div>
                  <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Enlaces enviados vs. reseñas verificadas</div>
                </div>
                <div style={{display:'flex', gap:14, fontSize:12, color:'var(--ink-3)', alignItems:'center'}}>
                  <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
                    <span style={{width:14, height:0, borderTop:'1.5px dashed #AEAEB2'}}/> Enlaces enviados
                  </span>
                  <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
                    <span style={{width:14, height:0, borderTop:'1.5px solid #1D1D1F'}}/> Verificadas
                  </span>
                </div>
              </div>
              <div style={{marginTop:12}}>
                <AreaChart enviados={SERIES_SENT} conseguidos={SERIES_VERIFIED} labels={MONTHS} height={230}/>
              </div>
            </Card>

            <Card>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                <div>
                  <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Objetivos · mayo</div>
                  <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Equipo en conjunto</div>
                </div>
                <span className="pill ok"><span className="dot"/>En ritmo</span>
              </div>

              <div style={{marginTop:18}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                  <span style={{fontSize:13, color:'var(--ink-3)'}}>Reseñas verificadas</span>
                  <span style={{fontSize:13, fontWeight:600, fontVariantNumeric:'tabular-nums'}}>459 / 520</span>
                </div>
                <div style={{marginTop:8}}><Progress value={459} max={520} /></div>
                <div style={{marginTop:6, fontSize:11.5, color:'var(--ink-4)'}}>88% · faltan 61 en 11 días</div>
              </div>

              <div style={{marginTop:18}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                  <span style={{fontSize:13, color:'var(--ink-3)'}}>Conversión objetivo</span>
                  <span style={{fontSize:13, fontWeight:600, fontVariantNumeric:'tabular-nums'}}>78,4 / 75%</span>
                </div>
                <div style={{marginTop:8}}><Progress value={104} max={100} tone="ok" /></div>
                <div style={{marginTop:6, fontSize:11.5, color:'var(--ok)'}}>Superado · +3,4 puntos</div>
              </div>

              <div style={{marginTop:18}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                  <span style={{fontSize:13, color:'var(--ink-3)'}}>Valoración media</span>
                  <span style={{fontSize:13, fontWeight:600, fontVariantNumeric:'tabular-nums'}}>4,82 / 4,70</span>
                </div>
                <div style={{marginTop:8}}><Progress value={4.82-3} max={4.7-3} tone="ok" /></div>
                <div style={{marginTop:6, fontSize:11.5, color:'var(--ok)'}}>Superado · +0,12</div>
              </div>
            </Card>
          </div>

          {/* Leaderboard + Recent */}
          <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, marginTop:16}}>
            <Card padding={0}>
              <div style={{padding:'18px 22px 12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Ranking</div>
                  <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Leaderboard del mes</div>
                </div>
                <div style={{display:'flex', gap:8, alignItems:'center', fontSize:12, color:'var(--ink-3)'}}>
                  <span>Ordenar por</span>
                  <Seg options={['Reseñas','Conversión','Estrellas']} value="Reseñas" onChange={()=>{}} />
                </div>
              </div>
              <div style={{padding:'4px 22px 14px'}}>
                <div style={{display:'grid', gridTemplateColumns:'28px 1.6fr 1fr 0.8fr 0.8fr 0.8fr 100px', gap:14, padding:'8px 0', fontSize:11, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.04em', borderBottom:'1px solid var(--line)'}}>
                  <span>#</span>
                  <span>Comercial</span>
                  <span>Sucursal</span>
                  <span style={{textAlign:'right'}}>Reseñas</span>
                  <span style={{textAlign:'right'}}>Conv.</span>
                  <span style={{textAlign:'right'}}>★</span>
                  <span style={{textAlign:'right'}}>Tendencia</span>
                </div>
                {TEAM.map((p,i) => (
                  <div key={p.id} style={{
                    display:'grid', gridTemplateColumns:'28px 1.6fr 1fr 0.8fr 0.8fr 0.8fr 100px',
                    gap:14, padding:'12px 0', alignItems:'center',
                    borderBottom: i===TEAM.length-1 ? 'none' : '1px solid var(--line)',
                    fontSize:13.5
                  }}>
                    <span style={{fontVariantNumeric:'tabular-nums', color: i<3 ? 'var(--ink)' : 'var(--ink-4)', fontWeight: i<3?600:500}}>{(i+1).toString().padStart(2,'0')}</span>
                    <div style={{display:'flex', alignItems:'center', gap:10, minWidth:0}}>
                      <Avatar name={p.name} size={28} color={p.avatar}/>
                      <div style={{minWidth:0}}>
                        <div style={{fontWeight:600, letterSpacing:'-0.005em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.name}</div>
                        <div style={{fontSize:11.5, color:'var(--ink-4)'}}>{p.role}</div>
                      </div>
                    </div>
                    <span style={{color:'var(--ink-3)', fontSize:12.5}}>{p.branch}</span>
                    <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:600}}>{p.reviews}</span>
                    <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--ink-3)'}}>{Math.round(p.reviews/p.sent*100)}%</span>
                    <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{p.avg.toString().replace('.',',')}</span>
                    <div style={{display:'flex', justifyContent:'flex-end'}}>
                      <Sparkline data={[3,5,4,7,6,9,8, p.reviews/8]} width={84} height={22} stroke={p.delta.startsWith('-') ? '#9C9CA1' : 'var(--ink-2)'}/>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card padding={0}>
              <div style={{padding:'18px 22px 12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Actividad</div>
                  <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Reseñas recientes</div>
                </div>
                <span className="pill"><span className="dot" style={{color:'#34C759'}}/>en vivo</span>
              </div>
              <div style={{padding:'0 22px 12px'}}>
                {RECENT.map((r,i) => (
                  <div key={r.id} style={{padding:'14px 0', borderTop: i===0?'1px solid var(--line)':'1px solid var(--line)'}}>
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <Avatar name={r.name} size={26}/>
                      <div style={{display:'flex', flexDirection:'column', minWidth:0, flex:1}}>
                        <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:8}}>
                          <span style={{fontSize:13.5, fontWeight:600}}>{r.name}</span>
                          <span style={{fontSize:11.5, color:'var(--ink-4)'}}>{r.time}</span>
                        </div>
                        <div style={{display:'flex', alignItems:'center', gap:8, marginTop:2}}>
                          <Stars value={r.stars} size={11}/>
                          <span style={{fontSize:11.5, color:'var(--ink-4)'}}>· para {r.sales}</span>
                        </div>
                      </div>
                    </div>
                    <p style={{margin:'8px 0 8px', fontSize:13, color:'var(--ink-2)', lineHeight:1.5}}>{r.text}</p>
                    <div>
                      {r.verified
                        ? <span className="pill ok"><span className="dot"/>Verificada en Google</span>
                        : <span className="pill warn"><span className="dot"/>Pendiente · detectando…</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Branches breakdown */}
          <div style={{marginTop:16}}>
            <Card>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14}}>
                <div>
                  <div style={{fontSize:13, color:'var(--ink-3)', fontWeight:500}}>Sucursales</div>
                  <div style={{fontSize:18, fontWeight:600, marginTop:4, letterSpacing:'-0.02em'}}>Rendimiento por piso piloto</div>
                </div>
                <Seg options={['Resumen','Detalle']} value="Resumen" onChange={()=>{}} />
              </div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16}}>
                {[
                  { name:'Madrid · Chamberí',   reviews:142, conv:'82%', stars:'4,9', dev:'+14%' },
                  { name:'Madrid · Centro',     reviews:128, conv:'76%', stars:'4,7', dev:'+9%'  },
                  { name:'Valencia · Patacona', reviews:112, conv:'81%', stars:'4,8', dev:'+11%' },
                  { name:'Sevilla · Triana',    reviews: 77, conv:'70%', stars:'4,6', dev:'+3%'  },
                ].map(b => (
                  <div key={b.name} style={{padding:'12px 14px', border:'1px solid var(--line)', borderRadius:'var(--radius-sm)', background:'var(--surface-2)'}}>
                    <div style={{fontSize:12, color:'var(--ink-3)', fontWeight:500}}>{b.name}</div>
                    <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:6}}>
                      <span style={{fontSize:24, fontWeight:600, letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums'}}>{b.reviews}</span>
                      <span style={{fontSize:12, color:'var(--ok)'}}>{b.dev}</span>
                    </div>
                    <div style={{marginTop:8, display:'flex', justifyContent:'space-between', fontSize:11.5, color:'var(--ink-4)'}}>
                      <span>Conv. {b.conv}</span>
                      <span>★ {b.stars}</span>
                    </div>
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

window.AdminDashboard = AdminDashboard;
