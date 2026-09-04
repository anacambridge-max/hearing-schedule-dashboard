'use client';
import {useEffect,useMemo,useState} from 'react';
import {ResponsiveContainer,BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,Legend,PieChart,Pie,Cell,LineChart,Line} from 'recharts';

const SHEET_ID='1KRfUfvw0JmbNBolkVDHyevutOv8nd3JYPgngT5xchFI';
const TABS=['Rough Data','For Hearing Entry','Centre Wise Report','Hearing Schedule Report','Date wise Report'];
const DATE_KEYS=['Date 1','Date 2','Date 3','Date 4','Date 5','Date 6','Date 7'];
const NOTICE_KEYS=['No. of Notices','No. of Notices (2)','No. of Notices (3)','No. of Notices (4)','No. of Notices (5)','No. of Notices (6)','No. of Notices (7)'];
const clean=v=>v==null?'':String(v).trim();
const num=v=>{const n=parseFloat(clean(v).replace(/,/g,''));return Number.isFinite(n)?n:0};
const norm=s=>clean(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
function val(row,wanted){const target=norm(wanted),keys=Object.keys(row);const exact=keys.find(x=>norm(x)===target);if(exact)return row[exact];const k=keys.find(x=>{const n=norm(x);return n.includes(target)||target.includes(n)});return k?row[k]:''}
function psNumber(row){const v=val(row,'New P.S. No.');const n=Number(clean(v));return Number.isInteger(n)&&n>=1&&n<=430?n:0}
function psVal(row){const n=psNumber(row);return n?n.toLocaleString('en-IN'):''}
function noticesForDate(row,date){if(!date||date==='All Dates')return 0;for(let i=0;i<DATE_KEYS.length;i++){if(clean(val(row,DATE_KEYS[i]))===date)return num(val(row,NOTICE_KEYS[i]))}return 0}
async function getTab(tab){const r=await fetch(`/api/sheet?tab=${encodeURIComponent(tab)}`,{cache:'no-store'});const body=await r.json().catch(()=>({}));if(!r.ok)throw Error(body.error||`Unable to load ${tab}`);return body}
function Card({label,value,sub}){return <div className="card"><div className="card-label">{label}</div><div className="card-value">{value}</div><div className="card-sub">{sub}</div></div>}

export default function Page(){
 const[data,setData]=useState({}),[error,setError]=useState(''),[loading,setLoading]=useState(true),[lastUpdated,setLastUpdated]=useState(null),[centre,setCentre]=useState('All Centres'),[date,setDate]=useState('All Dates'),[view,setView]=useState('overview');
 async function refresh(){setLoading(true);setError('');try{const r=await Promise.all(TABS.map(async t=>[t,await getTab(t)]));setData(Object.fromEntries(r));setLastUpdated(new Date())}catch(e){setError(e.message||'Unable to load Google Sheet')}finally{setLoading(false)}}
 useEffect(()=>{refresh();const id=setInterval(refresh,60000);return()=>clearInterval(id)},[]);

 const entry=data['For Hearing Entry']?.rows||[];
 const centres=data['Centre Wise Report']?.rows||[];

 // For Hearing Entry is intentionally treated as the source of truth for the 430 current NEW P.S. records.
 // The sheet repeats headers between centre blocks, so the API already strips those repeated header rows.
 const currentPS=useMemo(()=>entry.filter(r=>psNumber(r)),[entry]);
 const filtered=useMemo(()=>currentPS.filter(r=>(centre==='All Centres'||clean(val(r,'Hearing Centre'))===centre)&&(date==='All Dates'||DATE_KEYS.some(k=>clean(val(r,k))===date))),[currentPS,centre,date]);
 const centreOptions=useMemo(()=>centres.map(r=>clean(val(r,'Hearing Centre'))).filter(x=>x&&norm(x)!=='hearing centre').sort(),[centres]);
 const dateOptions=useMemo(()=>{const s=new Set();currentPS.forEach(r=>DATE_KEYS.forEach(k=>{const d=clean(val(r,k));if(d&&!/^date\s*\d+$/i.test(d))s.add(d)}));return [...s].sort((a,b)=>{const [da,ma,ya]=a.split('-').map(Number),[db,mb,yb]=b.split('-').map(Number);return new Date(ya,ma-1,da)-new Date(yb,mb-1,db)})},[currentPS]);

 const totals=useMemo(()=>{
   if(date==='All Dates') return {anomaly:filtered.reduce((a,r)=>a+num(val(r,'Total Anamoly/Discripancy')),0),mapping:filtered.reduce((a,r)=>a+num(val(r,'Total No Mapping')),0),grand:filtered.reduce((a,r)=>a+num(val(r,'Grand Total')),0),balance:filtered.reduce((a,r)=>a+num(val(r,'Balance No. of Notices')),0)};
   return {anomaly:filtered.reduce((a,r)=>a+num(val(r,'Total Anamoly/Discripancy')),0),mapping:filtered.reduce((a,r)=>a+num(val(r,'Total No Mapping')),0),grand:filtered.reduce((a,r)=>a+noticesForDate(r,date),0),balance:filtered.reduce((a,r)=>a+Math.max(num(val(r,'Balance No. of Notices'))-noticesForDate(r,date),0),0)};
 },[filtered,date]);

 const centreChart=useMemo(()=>centres.filter(r=>{const n=clean(val(r,'Hearing Centre'));return n&&norm(n)!=='hearing centre'&&(centre==='All Centres'||n===centre)}).map(r=>({name:clean(val(r,'Hearing Centre')),ps:num(val(r,'No. of P.S. under Hearing Centre')),anomaly:num(val(r,'Total Anamoly/ Discripancy')),mapping:num(val(r,'Total No Mapping')),grand:num(val(r,'Grand Total')),days:num(val(r,'Total Days Scheduled')),notices:num(val(r,'Total Notice Scheduled')),balance:num(val(r,'Balance Notices to be scheduled (No Map)'))})),[centres,centre]);

 const scheduleChart=useMemo(()=>{const m={};currentPS.forEach(r=>{if(centre!=='All Centres'&&clean(val(r,'Hearing Centre'))!==centre)return;DATE_KEYS.forEach((k,i)=>{const d=clean(val(r,k));const n=num(val(r,NOTICE_KEYS[i]));if(d&&n)m[d]=(m[d]||0)+n})});return Object.entries(m).map(([date,scheduled])=>({date,scheduled})).sort((a,b)=>{const p=x=>{const [d,m,y]=x.split('-').map(Number);return new Date(y,m-1,d)};return p(a.date)-p(b.date)})},[currentPS,centre]);

 const topBLO=useMemo(()=>{const m={};filtered.forEach(r=>{const b=clean(val(r,'All BLO Name'));if(b)m[b]=(m[b]||0)+(date==='All Dates'?num(val(r,'Grand Total')):noticesForDate(r,date))});return Object.entries(m).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total).slice(0,10)},[filtered,date]);
 const totalScheduled=useMemo(()=>scheduleChart.reduce((a,x)=>a+x.scheduled,0),[scheduleChart]);

 return <main>
 <header className="topbar"><div><div className="eyebrow">ELECTORAL HEARING MANAGEMENT</div><h1>Hearing Schedule Dashboard</h1><p>Live operational view of workload, centres, hearing dates and BLO allocation.</p></div><div className="actions"><span className={`status ${loading?'loading':''}`}><i/> {loading?'Refreshing':'Live'}</span><button onClick={refresh}>↻ Refresh</button><a href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`} target="_blank" rel="noreferrer">Open Sheet ↗</a></div></header>
 {error&&<div className="error">Could not load live data: {error}</div>}
 <section className="filters"><div><label>Hearing Centre</label><select value={centre} onChange={e=>setCentre(e.target.value)}><option>All Centres</option>{centreOptions.map(x=><option key={x}>{x}</option>)}</select></div><div><label>Hearing Date</label><select value={date} onChange={e=>setDate(e.target.value)}><option>All Dates</option>{dateOptions.map(x=><option key={x}>{x}</option>)}</select></div><div className="refresh-note">Auto refresh: every 60 seconds<br/>{lastUpdated?`Last synced ${lastUpdated.toLocaleTimeString()}`:'Waiting for first sync'}</div></section>
 <nav className="tabs">{[['overview','Overview'],['centres','Centre Performance'],['schedule','Schedule'],['detail','P.S. / BLO Detail']].map(([id,label])=><button key={id} className={view===id?'active':''} onClick={()=>setView(id)}>{label}</button>)}</nav>
 <section className="cards"><Card label="P.S. Records" value={filtered.length.toLocaleString('en-IN')} sub={date==='All Dates'?(centre==='All Centres'?'All 430 current P.S.':centre):`${date} • P.S. with hearing`}/><Card label="Anomaly / Discrepancy" value={totals.anomaly.toLocaleString('en-IN')} sub={date==='All Dates'?'Current workload':'Selected-date P.S. workload'}/><Card label="No Mapping" value={totals.mapping.toLocaleString('en-IN')} sub="Current mapping workload"/><Card label={date==='All Dates'?'Grand Total':'Notices Scheduled'} value={totals.grand.toLocaleString('en-IN')} sub={date==='All Dates'?'Anomaly + No Mapping':date}/><Card label="Balance Notices" value={totals.balance.toLocaleString('en-IN')} sub={date==='All Dates'?'Current balance':'Approx. remaining after selected date'}/><Card label="Hearing Centres" value={centreChart.length} sub={centre==='All Centres'?'7 active centres':centre}/></section>

 {view==='overview'&&<div className="grid">
   <section className="panel wide"><div className="panel-head"><h2>Scheduled Notices by Centre</h2><span>{date==='All Dates'?'Current sheet totals':date}</span></div><ResponsiveContainer width="100%" height={340}><BarChart data={centreChart} margin={{top:10,right:20,left:10,bottom:90}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={110}/><YAxis/><Tooltip/><Bar dataKey="notices" name="Notices Scheduled" fill="#3157d5" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></section>
   <section className="panel"><div className="panel-head"><h2>Workload Mix</h2><span>{date==='All Dates'?'430 P.S.':'Filtered P.S.'}</span></div><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={[{name:'Anomaly / Discrepancy',value:totals.anomaly},{name:'No Mapping',value:totals.mapping}]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label>{[0,1].map(i=><Cell key={i} fill={i===0?'#3157d5':'#8aa0e8'}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></section>
   <section className="panel"><div className="panel-head"><h2>Top BLO Workload</h2><span>{date==='All Dates'?'Grand total':date}</span></div><div className="rank">{topBLO.map((x,i)=><div className="rank-row" key={x.name}><b>{i+1}</b><span>{x.name}</span><strong>{x.total.toLocaleString('en-IN')}</strong></div>)}</div></section>
 </div>}

 {view==='centres'&&<section className="panel"><div className="panel-head"><h2>Centre Performance</h2><span>{centreChart.length} centres</span></div><ResponsiveContainer width="100%" height={380}><BarChart data={centreChart} margin={{top:10,right:20,left:10,bottom:90}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={110}/><YAxis/><Tooltip/><Legend/><Bar dataKey="ps" name="P.S." fill="#8aa0e8"/><Bar dataKey="notices" name="Notices" fill="#3157d5"/></BarChart></ResponsiveContainer><div className="table-wrap"><table><thead><tr><th>Centre</th><th>P.S.</th><th>Anomaly</th><th>No Mapping</th><th>Grand Total</th><th>Days</th><th>Notices Scheduled</th><th>Balance Notices</th></tr></thead><tbody>{centreChart.map(x=><tr key={x.name}><td>{x.name}</td><td>{x.ps.toLocaleString('en-IN')}</td><td>{x.anomaly.toLocaleString('en-IN')}</td><td>{x.mapping.toLocaleString('en-IN')}</td><td><b>{x.grand.toLocaleString('en-IN')}</b></td><td>{x.days.toLocaleString('en-IN')}</td><td><b>{x.notices.toLocaleString('en-IN')}</b></td><td>{x.balance.toLocaleString('en-IN')}</td></tr>)}</tbody></table></div></section>}

 {view==='schedule'&&<div className="grid"><section className="panel wide"><div className="panel-head"><h2>Daily Notice Schedule</h2><span>{centre==='All Centres'?'All centres':centre} • {totalScheduled.toLocaleString('en-IN')} scheduled</span></div><ResponsiveContainer width="100%" height={350}><LineChart data={scheduleChart}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip/><Line type="monotone" dataKey="scheduled" name="Notices" stroke="#3157d5" strokeWidth={3}/></LineChart></ResponsiveContainer></section><section className="panel"><div className="panel-head"><h2>Schedule Snapshot</h2><span>From For Hearing Entry</span></div><div className="schedule-list">{scheduleChart.map(r=><div className="schedule-row" key={r.date}><span>{r.date}</span><strong>{r.scheduled.toLocaleString('en-IN')}</strong></div>)}</div></section></div>}

 {view==='detail'&&<section className="panel"><div className="panel-head"><h2>P.S. / BLO Detail</h2><span>{filtered.length} current records</span></div><div className="table-wrap tall"><table><thead><tr><th>P.S.</th><th>Locality</th><th>BLO</th><th>Supervisor</th><th>Hearing Centre</th><th>Anomaly</th><th>No Mapping</th><th>Grand Total</th><th>Balance Notices</th></tr></thead><tbody>{filtered.map((r,i)=><tr key={`${psNumber(r)}-${i}`}><td><b>{psVal(r)}</b></td><td>{clean(val(r,'LOCALITY'))}</td><td>{clean(val(r,'All BLO Name'))}</td><td>{clean(val(r,'Supervisor Name'))}</td><td>{clean(val(r,'Hearing Centre'))}</td><td>{num(val(r,'Total Anamoly/Discripancy')).toLocaleString('en-IN')}</td><td>{num(val(r,'Total No Mapping')).toLocaleString('en-IN')}</td><td><b>{num(val(r,'Grand Total')).toLocaleString('en-IN')}</b></td><td>{num(val(r,'Balance No. of Notices')).toLocaleString('en-IN')}</td></tr>)}</tbody></table></div></section>}
 <footer>Source: Google Sheet • 5 source tabs • 430 current NEW P.S. records • Auto-sync every 60 seconds</footer></main>;
}
