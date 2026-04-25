import { useState, useEffect, useCallback } from "react";

const API_BASE = "https://statsapi.mlb.com/api/v1";
const TA = {"Arizona Diamondbacks":"ARI","Atlanta Braves":"ATL","Baltimore Orioles":"BAL","Boston Red Sox":"BOS","Chicago Cubs":"CHC","Chicago White Sox":"CWS","Cincinnati Reds":"CIN","Cleveland Guardians":"CLE","Colorado Rockies":"COL","Detroit Tigers":"DET","Houston Astros":"HOU","Kansas City Royals":"KC","Los Angeles Angels":"LAA","Los Angeles Dodgers":"LAD","Miami Marlins":"MIA","Milwaukee Brewers":"MIL","Minnesota Twins":"MIN","New York Mets":"NYM","New York Yankees":"NYY","Athletics":"ATH","Oakland Athletics":"ATH","Philadelphia Phillies":"PHI","Pittsburgh Pirates":"PIT","San Diego Padres":"SD","San Francisco Giants":"SF","Seattle Mariners":"SEA","St. Louis Cardinals":"STL","Tampa Bay Rays":"TB","Texas Rangers":"TEX","Toronto Blue Jays":"TOR","Washington Nationals":"WSH"};
const PF = {"Coors Field":1.38,"Great American Ball Park":1.15,"Globe Life Field":1.04,"Fenway Park":1.08,"Wrigley Field":1.05,"Citizens Bank Park":1.06,"Yankee Stadium":1.08,"American Family Field":1.05,"Oriole Park at Camden Yards":1.04,"Target Field":1.02,"Busch Stadium":0.94,"Oracle Park":0.88,"Tropicana Field":0.96,"Petco Park":0.93,"Kauffman Stadium":0.98,"T-Mobile Park":0.95,"Citi Field":0.95,"Dodger Stadium":0.93,"UNIQLO Field at Dodger Stadium":0.93,"Minute Maid Park":1.02,"Daikin Park":1.02,"loanDepot park":1.01,"PNC Park":0.97,"Comerica Park":0.96,"Progressive Field":0.97,"Rogers Centre":1.02,"Nationals Park":1.00,"Chase Field":1.06,"Angel Stadium":1.00,"Rate Field":1.01,"Guaranteed Rate Field":1.01,"Estadio Alfredo Harp Helu":1.12,"Truist Park":0.99};
function ga(n){return TA[n]||n?.split(" ").pop()?.substring(0,3).toUpperCase()||"???";}
function gp(v){if(!v)return 1;for(const[k,val]of Object.entries(PF))if(v.toLowerCase().includes(k.toLowerCase().substring(0,10)))return val;return 1;}

const B=0.735;
function lo(p){return Math.log(p/(1-p));}
function fl(x){return 1/(1+Math.exp(-x));}
function blend(r,n,pr,w){return n<2?pr:(r*n+pr*w)/(n+w);}
function computeNRFI({ap,hp,ab,hb,pf,sa,sh}){
  const blo=lo(B),apA=blend(ap,sa,B,2),hpA=blend(hp,sh,B,2),abA=blend(ab,20,B,3),hbA=blend(hb,20,B,3);
  const tLO=blo+(lo(hpA)-blo)*.65+(lo(abA)-blo)*.35;
  const bLO=blo+(lo(apA)-blo)*.65+(lo(hbA)-blo)*.35;
  return Math.min(.88,Math.max(.32,fl(lo(fl(tLO))+lo(fl(bLO))-blo+(1-pf)*.6)));
}
function p2n(s){
  if(!s)return B;
  const re=(s.era/9)*.9,kf=1-Math.min(.08,Math.max(-.04,(s.k9-8.5)*.015));
  const bf=1+Math.max(0,(s.bb9-2.8)*.03),wf=1+Math.max(0,(s.whip-1.2)*.08);
  return Math.min(.93,Math.max(.45,Math.exp(-re*kf*bf*wf)));
}
function conf(n){
  if(n>=.68)return{t:"Strong",c:"#0f7b5f"};
  if(n>=.58)return{t:"Lean",c:"#2d6a9f"};
  if(n>=.50)return{t:"Toss-up",c:"#8a6d1b"};
  return{t:"Fade",c:"#a63d3d"};
}
function tileStyle(nrfi){
  const c=conf(nrfi);
  if(nrfi>=.68)return{bg:c.c,fg:"#fff"};
  if(nrfi>=.62)return{bg:"rgba(45,106,159,0.85)",fg:"#fff"};
  if(nrfi>=.58)return{bg:"rgba(45,106,159,0.6)",fg:"#fff"};
  if(nrfi>=.54)return{bg:"rgba(138,109,27,0.3)",fg:"var(--ink)"};
  if(nrfi>=.50)return{bg:"rgba(138,109,27,0.18)",fg:"var(--ink)"};
  if(nrfi>=.45)return{bg:"rgba(166,61,61,0.15)",fg:"var(--ink)"};
  return{bg:"rgba(166,61,61,0.1)",fg:"var(--ink)"};
}

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
:root{--paper:#faf9f7;--white:#fff;--ink:#1a1a18;--ink2:#3d3b36;--ink3:#6b6760;--ink4:#9e9a92;--ink5:#c4c0b8;--rule:#e2ddd5;--rule-l:#eee9e2;--serif:'Instrument Serif',Georgia,serif;--sans:'Source Sans 3',-apple-system,sans-serif;--mono:'IBM Plex Mono',monospace;}
*{margin:0;padding:0;box-sizing:border-box;}
body{background:var(--paper);-webkit-font-smoothing:antialiased;}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes liveDot{0%,100%{opacity:1}50%{opacity:.3}}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:3px;}
.tile{padding:16px 14px;cursor:pointer;min-height:115px;display:flex;flex-direction:column;justify-content:space-between;transition:opacity .12s;}
.tile:hover{opacity:.85;}

.dp{background:var(--rule-l);padding:20px;margin-bottom:12px;}
.dp-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;}
.dp-stat{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;}

.ftab{background:none;border:none;cursor:pointer;font-family:var(--sans);font-size:13px;padding:6px 0;margin-right:18px;color:var(--ink4);border-bottom:2px solid transparent;font-weight:400;}
.ftab.on{color:var(--ink);border-bottom-color:var(--ink);font-weight:600;}

@media(max-width:600px){
  .grid{grid-template-columns:repeat(2,1fr);gap:2px;}
  .tile{min-height:100px;padding:12px 10px;}
  .tile-pct{font-size:20px!important;}
  .kpi-row{flex-direction:column!important;}
  .kpi+.kpi{border-left:none!important;padding-left:0!important;border-top:1px solid var(--rule-l);padding-top:10px!important;}
  .dp-grid{grid-template-columns:1fr;}
  .nav-date{display:none;}
  .dp-pitchers{flex-direction:column!important;gap:4px!important;}
}
`;

export default function App(){
  const[games,setGames]=useState([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState(null);
  const[sortBy,setSortBy]=useState("nrfi");
  const[filter,setFilter]=useState("all");
  const[sel,setSel]=useState(null);

  const fetchData=useCallback(async()=>{
    try{
      setLoading(true);setError(null);
      const today=new Date().toISOString().split("T")[0];
      const sched=await(await fetch(`${API_BASE}/schedule?date=${today}&sportId=1&hydrate=probablePitcher(note),linescore,venue`)).json();
      const tg=sched.dates?.[0]?.games||[];
      const ago=new Date(Date.now()-30*864e5).toISOString().split("T")[0];
      const hist=await(await fetch(`${API_BASE}/schedule?startDate=${ago}&endDate=${today}&sportId=1&hydrate=linescore&gameType=R`)).json();
      const ts={};let sc=0;
      for(const d of hist.dates||[])for(const g of d.games||[]){
        if(g.status?.detailedState!=="Final")continue;
        const inn=g.linescore?.innings;if(!inn?.length)continue;
        const ar=inn[0]?.away?.runs??null,hr=inn[0]?.home?.runs??null;
        if(ar===null||hr===null)continue;sc++;
        const aa=ga(g.teams?.away?.team?.name),ha=ga(g.teams?.home?.team?.name);
        for(const[a,r]of[[aa,ar],[ha,hr]]){if(!ts[a])ts[a]={bg:0,bn:0,pg:0,pn:0};ts[a].bg++;if(r===0)ts[a].bn++;}
        if(!ts[ha])ts[ha]={bg:0,bn:0,pg:0,pn:0};ts[ha].pg++;if(ar===0)ts[ha].pn++;
        if(!ts[aa])ts[aa]={bg:0,bn:0,pg:0,pn:0};ts[aa].pg++;if(hr===0)ts[aa].pn++;
      }
      const pids=new Set();
      for(const g of tg){if(g.teams?.away?.probablePitcher?.id)pids.add(g.teams.away.probablePitcher.id);if(g.teams?.home?.probablePitcher?.id)pids.add(g.teams.home.probablePitcher.id);}
      const pm={};
      await Promise.all([...pids].map(async id=>{
        try{
          const d=await(await fetch(`${API_BASE}/people/${id}/stats?stats=gameLog&group=pitching&season=2026&gameType=R`)).json();
          const sp=d.stats?.[0]?.splits||[];let er=0,ip=0,k=0,bw=0,h=0,st=0;
          for(const s of sp){er+=s.stat?.earnedRuns||0;ip+=parseFloat(s.stat?.inningsPitched||0);k+=s.stat?.strikeOuts||0;bw+=s.stat?.baseOnBalls||0;h+=s.stat?.hits||0;st++;}
          pm[id]={era:ip>0?(er*9)/ip:4.5,whip:ip>0?(bw+h)/ip:1.3,k9:ip>0?(k*9)/ip:7,bb9:ip>0?(bw*9)/ip:3,starts:st,ip};
        }catch{pm[id]=null;}
      }));
      const proc=tg.map(g=>{
        const aa=ga(g.teams?.away?.team?.name||"TBD"),ha=ga(g.teams?.home?.team?.name||"TBD");
        const ap=g.teams?.away?.probablePitcher,hp=g.teams?.home?.probablePitcher;
        const v=g.venue?.name||"",pf=gp(v),st=g.status?.detailedState||"Scheduled";
        let fir=null;if(g.linescore?.innings?.length>0){const f=g.linescore.innings[0];fir={a:f.away?.runs??"?",h:f.home?.runs??"?"};}
        const aps=ap?.id?pm[ap.id]:null,hps=hp?.id?pm[hp.id]:null;
        const atd=ts[aa]||{bg:0,bn:0,pg:0,pn:0},htd=ts[ha]||{bg:0,bn:0,pg:0,pn:0};
        const abn=atd.bg>0?atd.bn/atd.bg:.7,hbn=htd.bg>0?htd.bn/htd.bg:.7;
        const apn=p2n(aps),hpn=p2n(hps);
        const nrfi=computeNRFI({ap:apn,hp:hpn,ab:abn,hb:hbn,pf,sa:aps?.starts||0,sh:hps?.starts||0});
        return{pk:g.gamePk,aa,ha,ap:ap?{name:ap.fullName,hand:ap.pitchHand?.code||"?",...aps}:null,hp:hp?{name:hp.fullName,hand:hp.pitchHand?.code||"?",...hps}:null,v,pf,time:new Date(g.gameDate).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/New_York"}),st,fir,nrfi,abn,hbn,apn,hpn,atd,htd};
      });
      setGames(proc);setLoading(false);
    }catch(e){setError(e.message);setLoading(false);}
  },[]);

  useEffect(()=>{fetchData();},[fetchData]);

  const sorted=(()=>{
    let a=[...games];
    if(filter==="strong")a=a.filter(g=>g.nrfi>=.60);
    if(filter==="upcoming")a=a.filter(g=>g.st==="Scheduled"||g.st==="Pre-Game");
    if(filter==="live")a=a.filter(g=>g.st.includes("Progress"));
    if(sortBy==="nrfi")a.sort((x,y)=>y.nrfi-x.nrfi);
    else a.sort((x,y)=>new Date(x.time)-new Date(y.time));
    return a;
  })();

  const avg=games.length?(games.reduce((s,g)=>s+g.nrfi,0)/games.length*100).toFixed(1):"—";
  const best=games.length?games.reduce((a,b)=>a.nrfi>b.nrfi?a:b):null;
  const strong=games.filter(g=>g.nrfi>=.60).length;
  const day=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
  const selGame=games.find(g=>g.pk===sel);

  const S={page:{minHeight:"100vh",fontFamily:"var(--sans)",color:"var(--ink)",background:"var(--paper)",WebkitFontSmoothing:"antialiased"}};

  if(loading)return(<><style>{CSS}</style><div style={{...S.page,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center"}}><div style={{width:28,height:28,border:"2px solid var(--rule)",borderTopColor:"var(--ink3)",borderRadius:"50%",animation:"spin .7s linear infinite",margin:"0 auto 16px"}}/><div style={{fontSize:14,color:"var(--ink2)"}}>Loading today's slate…</div></div></div></>);
  if(error)return(<><style>{CSS}</style><div style={{...S.page,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center",maxWidth:320}}><div style={{fontSize:14,color:"var(--ink)",marginBottom:8}}>Unable to load data</div><div style={{fontSize:13,color:"var(--ink3)",marginBottom:20}}>{error}</div><button onClick={fetchData} style={{background:"var(--ink)",border:"none",color:"var(--paper)",padding:"10px 28px",fontSize:13,cursor:"pointer",fontFamily:"var(--sans)"}}>Retry</button></div></div></>);

  return(<><style>{CSS}</style><div style={S.page}>
    {/* Nav */}
    <div style={{maxWidth:900,margin:"0 auto",padding:"0 20px"}}>
      <nav style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 0",borderBottom:"1px solid var(--rule)"}}>
        <div style={{fontFamily:"var(--serif)",fontSize:22,color:"var(--ink)"}}>InningEdge</div>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <span className="nav-date" style={{fontSize:12,color:"var(--ink4)"}}>{day}</span>
          <button onClick={fetchData} style={{background:"none",border:"1px solid var(--rule)",color:"var(--ink3)",padding:"6px 16px",fontSize:12,cursor:"pointer",fontFamily:"var(--sans)"}}>Refresh</button>
        </div>
      </nav>
    </div>

    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 20px 80px"}}>
      {/* KPIs */}
      <div className="kpi-row" style={{display:"flex",gap:0,marginBottom:24,borderBottom:"2px solid var(--ink)"}}>
        {[{l:"Average",v:`${avg}%`,s:`${games.length} games`},{l:"Best play",v:best?`${(best.nrfi*100).toFixed(1)}%`:"—",s:best?`${best.aa} at ${best.ha}`:""},{l:"Strong plays",v:String(strong),s:"60%+"}].map((k,i)=>(
          <div key={i} className="kpi" style={{flex:1,padding:"0 0 14px",...(i>0?{paddingLeft:20,borderLeft:"1px solid var(--rule-l)"}:{})}}>
            <div style={{fontSize:10,fontWeight:600,color:"var(--ink4)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>{k.l}</div>
            <div style={{fontSize:28,fontFamily:"var(--serif)",color:"var(--ink)",lineHeight:1}}>{k.v}</div>
            <div style={{fontSize:11,color:"var(--ink4)",marginTop:3}}>{k.s}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          {[["all","All games"],["strong","Strong"],["upcoming","Upcoming"],["live","Live"]].map(([k,l])=>(
            <button key={k} className={`ftab${filter===k?" on":""}`} onClick={()=>setFilter(k)}>{l}</button>
          ))}
        </div>
        <button onClick={()=>setSortBy(sortBy==="nrfi"?"time":"nrfi")} style={{fontSize:12,color:"var(--ink4)",background:"none",border:"none",cursor:"pointer",fontFamily:"var(--sans)"}}>
          Sort by {sortBy==="nrfi"?"probability":"time"} ↓
        </button>
      </div>

      {/* Detail panel */}
      {selGame&&(
        <div className="dp">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:"var(--ink)",marginBottom:2}}>{selGame.aa} at {selGame.ha}</div>
              <div style={{fontSize:12,color:"var(--ink4)"}}>{selGame.v} · PF {selGame.pf.toFixed(2)} · {selGame.time} ET</div>
            </div>
            <div style={{textAlign:"right",display:"flex",alignItems:"flex-start",gap:16}}>
              <div>
                <div style={{fontSize:32,fontFamily:"var(--serif)",color:conf(selGame.nrfi).c,lineHeight:1}}>{(selGame.nrfi*100).toFixed(1)}%</div>
                <div style={{fontSize:11,fontWeight:600,color:conf(selGame.nrfi).c,marginTop:2}}>{conf(selGame.nrfi).t}</div>
              </div>
              <button onClick={(e)=>{e.stopPropagation();setSel(null);}} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"var(--ink4)",lineHeight:1}}>✕</button>
            </div>
          </div>
          <div className="dp-pitchers" style={{display:"flex",gap:20,fontSize:13,color:"var(--ink2)",marginBottom:4}}>
            <div><span style={{fontWeight:600,color:"var(--ink)"}}>{selGame.ap?.name||"TBD"}</span>{selGame.ap&&<span> · {selGame.ap.hand}HP · {selGame.ap.era?.toFixed(2)} ERA · {selGame.ap.whip?.toFixed(2)} WHIP · {selGame.ap.k9?.toFixed(1)} K/9</span>}</div>
            <div style={{color:"var(--ink4)"}}>vs</div>
            <div><span style={{fontWeight:600,color:"var(--ink)"}}>{selGame.hp?.name||"TBD"}</span>{selGame.hp&&<span> · {selGame.hp.hand}HP · {selGame.hp.era?.toFixed(2)} ERA · {selGame.hp.whip?.toFixed(2)} WHIP · {selGame.hp.k9?.toFixed(1)} K/9</span>}</div>
          </div>
          <div className="dp-grid" style={{marginTop:16,paddingTop:16,borderTop:"1px solid var(--rule)"}}>
            {[{abbr:selGame.aa,side:"Away",pn:selGame.apn,bn:selGame.abn,td:selGame.atd,p:selGame.ap},{abbr:selGame.ha,side:"Home",pn:selGame.hpn,bn:selGame.hbn,td:selGame.htd,p:selGame.hp}].map(t=>(
              <div key={t.side}>
                <div style={{fontSize:10,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>{t.abbr} — {t.side}</div>
                {[["Hold rate",`${(t.pn*100).toFixed(1)}%`],["Bat NRFI",`${(t.bn*100).toFixed(1)}%`,`${t.td.bn}/${t.td.bg}`],...(t.p?[["Starts",t.p.starts||0],["IP",t.p.ip?.toFixed(1)||"—"],["K/9",t.p.k9?.toFixed(1)||"—"],["BB/9",t.p.bb9?.toFixed(1)||"—"]]:[])]
                .map(([label,val,extra],i)=>(
                  <div key={i} className="dp-stat">
                    <span style={{color:"var(--ink4)"}}>{label}</span>
                    <span style={{fontFamily:"var(--mono)",fontWeight:500,color:"var(--ink)"}}>{val}{extra&&<span style={{color:"var(--ink5)",fontSize:10,marginLeft:6}}>{extra}</span>}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:"var(--ink4)",marginTop:12,paddingTop:8,borderTop:"1px solid var(--rule)"}}>
            Park factor {selGame.pf.toFixed(2)} · {selGame.pf>1.03?"Hitter-friendly":selGame.pf<.97?"Pitcher-friendly":"Neutral"}
          </div>
        </div>
      )}

      {/* Tiles */}
      {sorted.length===0?(
        <div style={{textAlign:"center",padding:"48px 20px",color:"var(--ink4)",fontSize:13}}>No games match this filter.</div>
      ):(
        <div className="grid">
          {sorted.map(g=>{
            const c=conf(g.nrfi),ts2=tileStyle(g.nrfi);
            const isLive=g.st.includes("Progress"),isFinal=g.st==="Final";
            let res=null;
            if(isFinal&&g.fir){const hit=g.fir.a===0&&g.fir.h===0;res={t:hit?"NRFI":"YRFI",hit};}
            return(
              <div key={g.pk} className="tile" style={{background:ts2.bg,color:ts2.fg}} onClick={()=>setSel(sel===g.pk?null:g.pk)}>
                <div>
                  <div style={{fontSize:14,fontWeight:700,letterSpacing:"-0.01em",marginBottom:2}}>{g.aa} at {g.ha}</div>
                  <div style={{fontSize:11,opacity:.7,lineHeight:1.4}}>{g.ap?.name?.split(" ").pop()||"TBD"} vs {g.hp?.name?.split(" ").pop()||"TBD"}</div>
                </div>
                <div style={{marginTop:"auto",paddingTop:10}}>
                  <div className="tile-pct" style={{fontFamily:"var(--mono)",fontSize:22,fontWeight:500,lineHeight:1}}>{(g.nrfi*100).toFixed(1)}%</div>
                  <div style={{fontSize:10,fontWeight:600,letterSpacing:".04em",marginTop:2}}>{c.t}</div>
                  <div style={{fontFamily:"var(--mono)",fontSize:10,opacity:.5,marginTop:4}}>
                    {isLive?<><span style={{display:"inline-block",width:5,height:5,borderRadius:"50%",background:ts2.fg==="var(--ink)"?"#a63d3d":"#fff",marginRight:4,animation:"liveDot 2s infinite"}}/>Live</>:isFinal?<>Final{res&&` · ${res.t}`}</>:g.time+" ET"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div></>);
}
