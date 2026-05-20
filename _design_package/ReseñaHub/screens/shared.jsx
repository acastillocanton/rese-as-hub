/* Shared visual primitives — Apple-ish minimal. */
const { useState, useEffect, useRef, useMemo } = React;

/* ---------- Layout ---------- */

function Frame({ children }){
  return (
    <div style={{
      width:'100%', height:'100%',
      background:'var(--bg)',
      color:'var(--ink)',
      display:'flex',
      fontFamily:'var(--font-text)',
      letterSpacing:'-0.01em',
      overflow:'hidden'
    }}>{children}</div>
  );
}

function Sidebar({ active='dashboard' }){
  const items = [
    { id:'dashboard', label:'Dashboard', icon:'◧' },
    { id:'team', label:'Comerciales', icon:'◔' },
    { id:'reviews', label:'Reseñas', icon:'☆' },
    { id:'branches', label:'Sucursales', icon:'⌂' },
    { id:'goals', label:'Objetivos', icon:'◐' },
    { id:'settings', label:'Ajustes', icon:'◇' },
  ];
  return (
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
          fontSize:13, fontWeight:700, letterSpacing:'-0.02em'
        }}>r</div>
        <div style={{fontWeight:600, fontSize:14, letterSpacing:'-0.015em'}}>ReseñaHub</div>
      </div>

      <div style={{display:'flex', flexDirection:'column', gap:2}}>
        {items.map(it => {
          const on = it.id === active;
          return (
            <div key={it.id} style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'7px 10px', borderRadius:8,
              background: on ? 'rgba(0,0,0,0.05)' : 'transparent',
              color: on ? 'var(--ink)' : 'var(--ink-3)',
              fontSize: 13.5, fontWeight: on ? 600 : 500,
              cursor:'pointer'
            }}>
              <span style={{width:18, textAlign:'center', color:'var(--ink-4)', fontSize:13}}>{it.icon}</span>
              <span>{it.label}</span>
            </div>
          );
        })}
      </div>

      <div style={{marginTop:'auto', display:'flex', alignItems:'center', gap:10, padding:'8px 8px', borderTop:'1px solid var(--line)', paddingTop:14}}>
        <Avatar name="Laura Méndez" size={28} />
        <div style={{lineHeight:1.15}}>
          <div style={{fontSize:13, fontWeight:600}}>Laura Méndez</div>
          <div style={{fontSize:11.5, color:'var(--ink-4)'}}>Admin · Grupo Habitar</div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ title, subtitle, range='Este mes', right }){
  return (
    <header style={{
      padding:'18px 32px 14px',
      borderBottom:'1px solid var(--line)',
      display:'flex', alignItems:'flex-end', justifyContent:'space-between',
      background:'var(--bg)'
    }}>
      <div>
        <div style={{display:'flex', alignItems:'center', gap:10, color:'var(--ink-4)', fontSize:12, letterSpacing:'-0.005em'}}>
          <span>Grupo Habitar</span>
          <span style={{opacity:.5}}>›</span>
          <span>{title}</span>
        </div>
        <h1 style={{
          margin:'4px 0 0',
          fontFamily:'var(--font-display)',
          fontSize:26, fontWeight:600, letterSpacing:'-0.025em'
        }}>{subtitle || title}</h1>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <DateRange value={range} />
        {right}
      </div>
    </header>
  );
}

function DateRange({ value='Este mes' }){
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap:8,
      padding:'7px 12px',
      background:'var(--surface)',
      border:'1px solid var(--line-strong)',
      borderRadius: 9,
      fontSize:13, fontWeight:500
    }}>
      <span style={{color:'var(--ink-4)'}}>◴</span>
      <span>{value}</span>
      <span style={{color:'var(--ink-4)', marginLeft:4, fontSize:10}}>▾</span>
    </div>
  );
}

function GhostBtn({ children, primary }){
  return (
    <button style={{
      padding:'7px 12px',
      border:'1px solid var(--line-strong)',
      background: primary ? 'var(--ink)' : 'var(--surface)',
      color: primary ? '#fff' : 'var(--ink)',
      borderRadius: 9,
      fontSize: 13, fontWeight: 500,
      cursor:'pointer'
    }}>{children}</button>
  );
}

/* ---------- Cards & stats ---------- */

function Card({ children, padding=20, style={} }){
  return (
    <div style={{
      background:'var(--surface)',
      border:'1px solid var(--line)',
      borderRadius:'var(--radius)',
      padding,
      boxShadow:'var(--shadow-card)',
      ...style
    }}>{children}</div>
  );
}

function Stat({ label, value, sub, delta, deltaTone='ok', big=false }){
  const toneColor = deltaTone === 'ok' ? 'var(--ok)' : deltaTone === 'warn' ? 'var(--warn)' : 'var(--ink-3)';
  return (
    <Card>
      <div style={{fontSize:12.5, color:'var(--ink-3)', fontWeight:500, letterSpacing:'-0.005em'}}>{label}</div>
      <div style={{
        marginTop:8,
        fontFamily:'var(--font-display)',
        fontWeight:600, letterSpacing:'-0.03em',
        fontSize: big ? 38 : 32,
        fontVariantNumeric:'tabular-nums', lineHeight:1
      }}>{value}</div>
      <div style={{marginTop:10, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10}}>
        <div style={{fontSize:12, color:'var(--ink-4)'}}>{sub}</div>
        {delta != null && (
          <div style={{fontSize:12, color: toneColor, fontWeight:500, fontVariantNumeric:'tabular-nums'}}>
            {delta}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------- Sparkline & Bars ---------- */

function Sparkline({ data, width=120, height=32, stroke='var(--ink-2)' }){
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v,i) => {
    const x = (i/(data.length-1)) * width;
    const y = height - ((v-min)/span) * (height-4) - 2;
    return [x,y];
  });
  const d = pts.map((p,i) => (i?'L':'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length-1];
  return (
    <svg width={width} height={height}>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={stroke} />
    </svg>
  );
}

function MonthBars({ data, labels, height=200, highlight=null }){
  const max = Math.max(...data);
  return (
    <div style={{display:'flex', alignItems:'flex-end', gap:8, height, padding:'0 4px'}}>
      {data.map((v,i) => {
        const h = (v/max) * (height-28);
        const isHi = highlight === i;
        return (
          <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
            <div style={{fontSize:10.5, color: isHi ? 'var(--ink)' : 'var(--ink-4)', fontVariantNumeric:'tabular-nums', fontWeight: isHi?600:400}}>{v}</div>
            <div style={{
              width:'100%', height:h, minHeight:2,
              background: isHi ? 'var(--ink)' : '#D6D6DB',
              borderRadius:4,
              transition:'background .2s'
            }}/>
            <div style={{fontSize:10.5, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.05em'}}>{labels[i]}</div>
          </div>
        );
      })}
    </div>
  );
}

/* Two-tone area chart for "evolución temporal" */
function AreaChart({ enviados, conseguidos, labels, height=210 }){
  const w = 760;
  const h = height;
  const padL = 28, padR = 12, padT = 14, padB = 22;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const max = Math.max(...enviados, ...conseguidos);
  const niceMax = Math.ceil(max/10)*10;
  const xOf = i => padL + (i/(enviados.length-1)) * innerW;
  const yOf = v => padT + innerH - (v/niceMax) * innerH;
  const path = (arr) => arr.map((v,i) => (i?'L':'M') + xOf(i).toFixed(1) + ' ' + yOf(v).toFixed(1)).join(' ');
  const area = (arr) => path(arr) + ` L ${xOf(arr.length-1)} ${padT+innerH} L ${xOf(0)} ${padT+innerH} Z`;
  const ticks = [0, niceMax/2, niceMax];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:'100%', height:'auto', display:'block'}}>
      <defs>
        <linearGradient id="g-cons" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1D1D1F" stopOpacity="0.10"/>
          <stop offset="100%" stopColor="#1D1D1F" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {ticks.map((t,i) => (
        <g key={i}>
          <line x1={padL} x2={w-padR} y1={yOf(t)} y2={yOf(t)} stroke="#E5E5EA" strokeDasharray="2 4"/>
          <text x={padL-8} y={yOf(t)+3} textAnchor="end" fontSize="10" fill="#86868B" fontFamily="var(--font-mono)">{t}</text>
        </g>
      ))}
      {labels.map((l,i) => (
        <text key={i} x={xOf(i)} y={h-6} textAnchor="middle" fontSize="10" fill="#86868B">{l}</text>
      ))}
      <path d={area(conseguidos)} fill="url(#g-cons)" />
      <path d={path(enviados)} fill="none" stroke="#AEAEB2" strokeWidth="1.3" strokeDasharray="3 3"/>
      <path d={path(conseguidos)} fill="none" stroke="#1D1D1F" strokeWidth="1.6"/>
      {conseguidos.map((v,i) => (
        <circle key={i} cx={xOf(i)} cy={yOf(v)} r="2.5" fill="#1D1D1F"/>
      ))}
    </svg>
  );
}

/* ---------- Stars & misc ---------- */

function Stars({ value=5, size=12, color='var(--ink-2)', muted='var(--line-strong)' }){
  return (
    <span style={{display:'inline-flex', gap:1}}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{fontSize:size, color: i<=value ? color : muted, lineHeight:1}}>★</span>
      ))}
    </span>
  );
}

function Avatar({ name='', size=36, color }){
  const initials = name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
  /* Generate a stable gray tone per initial */
  const hashes = ['#D2D2D7','#C7C7CC','#BCBCC1','#B0B0B6','#A6A6AB','#9C9CA1'];
  const h = hashes[(name.charCodeAt(0) || 65) % hashes.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: color || h,
      color:'#3C3C43',
      display:'grid', placeItems:'center',
      fontWeight: 600, fontSize: size*0.36,
      letterSpacing:'-0.02em',
      flexShrink: 0
    }}>{initials}</div>
  );
}

function Progress({ value, max=100, height=4, tone='ink' }){
  const pct = Math.min(100, (value/max)*100);
  const fg = tone === 'ok' ? 'var(--ok)' : 'var(--ink)';
  return (
    <div style={{height, background:'#E5E5EA', borderRadius:999, overflow:'hidden'}}>
      <div style={{width: pct+'%', height:'100%', background: fg, borderRadius:999}}/>
    </div>
  );
}

function Seg({ options, value, onChange }){
  return (
    <div style={{
      display:'inline-flex', padding:2,
      background:'#EBEBF0', borderRadius:9,
      fontSize:12, fontWeight:500
    }}>
      {options.map(o => (
        <div key={o} onClick={() => onChange && onChange(o)} style={{
          padding:'5px 11px', borderRadius:7, cursor:'pointer',
          background: value===o ? 'var(--surface)' : 'transparent',
          boxShadow: value===o ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
          color: value===o ? 'var(--ink)' : 'var(--ink-3)'
        }}>{o}</div>
      ))}
    </div>
  );
}

/* ---------- Data (shared) ---------- */

const TEAM = [
  { id:1, name:'Carla Ruiz',      role:'Senior Sales',     branch:'Madrid · Chamberí',  team:'Norte',  reviews: 87, sent: 102, avg: 4.9, goal: 90, delta: '+12', avatar:'#CFCFD4' },
  { id:2, name:'Mateo Salgado',   role:'Sales',            branch:'Madrid · Centro',    team:'Norte',  reviews: 74, sent: 96,  avg: 4.8, goal: 80, delta: '+9',  avatar:'#C7C7CC' },
  { id:3, name:'Lucía Vega',      role:'Senior Sales',     branch:'Valencia · Patacona',team:'Levante',reviews: 71, sent: 88,  avg: 4.9, goal: 80, delta: '+7',  avatar:'#BFBFC4' },
  { id:4, name:'Tomás Iglesias',  role:'Sales',            branch:'Madrid · Centro',    team:'Norte',  reviews: 62, sent: 95,  avg: 4.6, goal: 80, delta: '+2',  avatar:'#C7C7CC' },
  { id:5, name:'Noa Herrero',     role:'Sales',            branch:'Sevilla · Triana',   team:'Sur',    reviews: 58, sent: 71,  avg: 4.8, goal: 70, delta: '+5',  avatar:'#CFCFD4' },
  { id:6, name:'Bruno Castaño',   role:'Junior Sales',     branch:'Valencia · Patacona',team:'Levante',reviews: 41, sent: 64,  avg: 4.5, goal: 60, delta: '-3',  avatar:'#BFBFC4' },
  { id:7, name:'Inés Olivares',   role:'Sales',            branch:'Málaga · Limonar',   team:'Sur',    reviews: 39, sent: 58,  avg: 4.7, goal: 60, delta: '+1',  avatar:'#C7C7CC' },
  { id:8, name:'Pablo Domínguez', role:'Junior Sales',     branch:'Sevilla · Triana',   team:'Sur',    reviews: 27, sent: 49,  avg: 4.4, goal: 50, delta: '-6',  avatar:'#CFCFD4' },
];

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const RECENT = [
  { id:'r1', name:'Andrea Pinto',     time:'hace 12 min', stars:5, sales:'Carla Ruiz',     text:'Visita al piso piloto de Residencial Almagro impecable. Carla nos explicó cada detalle del plano y los acabados.', verified:true },
  { id:'r2', name:'Familia Soriano',  time:'hace 38 min', stars:5, sales:'Mateo Salgado',  text:'Atención de diez. Nos enseñó tres tipologías diferentes sin prisa y resolvió cada duda.', verified:true },
  { id:'r3', name:'Jorge Mas',        time:'hace 1 h',    stars:4, sales:'Tomás Iglesias', text:'Muy correcto. Hubiéramos preferido más información de la financiación, pero todo cumplido.', verified:true },
  { id:'r4', name:'Marta Llamas',     time:'hace 2 h',    stars:5, sales:'Lucía Vega',     text:'Lucía es un encanto. Visitamos el piso piloto de Patacona en Valencia y nos lo pintó tal cual lo imaginábamos.', verified:true },
  { id:'r5', name:'Diego Carranza',   time:'hace 3 h',    stars:5, sales:'Noa Herrero',    text:'Sevilla, Triana. Salimos con la maqueta clara y un dossier muy completo.', verified:false, pending:true },
];

/* trends per month for charts */
const SERIES_SENT       = [128, 142, 151, 160, 178, 196, 208, 192, 215, 234, 251, 268];
const SERIES_VERIFIED   = [ 86,  97, 106, 115, 132, 148, 162, 151, 174, 191, 208, 227];

Object.assign(window, {
  Frame, Sidebar, Topbar, DateRange, GhostBtn,
  Card, Stat, Sparkline, MonthBars, AreaChart,
  Stars, Avatar, Progress, Seg,
  TEAM, MONTHS, RECENT, SERIES_SENT, SERIES_VERIFIED
});
