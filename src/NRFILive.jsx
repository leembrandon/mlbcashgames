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
  if(n>=.68)return{t:"Strong",c:"#0f7b5f",cls:"strong"};
  if(n>=.58)return{t:"Lean",c:"#2d6a9f",cls:"lean"};
  if(n>=.50)return{t:"Toss-up",c:"#8a6d1b",cls:"tossup"};
  return{t:"Fade",c:"#a63d3d",cls:"fade"};
}

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
:root{--paper:#faf9f7;--white:#fff;--ink:#1a1a18;--ink2:#3d3b36;--ink3:#6b6760;--ink4:#9e9a92;--ink5:#c4c0b8;--rule:#e2ddd5;--rule-l:#eee9e2;--serif:'Instrument Serif',Georgia,serif;--sans:'Source Sans 3',-apple-system,sans-serif;--mono:'IBM Plex Mono',monospace;}
*{margin:0;padding:0;box-sizing:border-box;}
body{background:var(--paper);-webkit-font-smoothing:antialiased;}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes liveDot{0%,100%{opacity:1}50%{opacity:.3}}

.tl-game{display:flex;align-items:flex-start;gap:16px;padding:14px 0 14px 24px;border-left:2px solid var(--rule);margin-left:5px;position:relative;cursor:pointer;transition:background .1s;}
.tl-game:hover{background:var(--rule-l);margin-left:0;padding-left:29px;}
.tl-game.expanded{background:var(--rule-l);margin-left:0;padding-left:29px;}
.tl-game::before{content:'';position:absolute;left:-6px;top:20px;width:10px;height:10px;border-radius:50%;}
.tl-game.strong::before{background:#0f7b5f;}
.tl-game.lean::before{background:#2d6a9f;}
.tl-game.tossup::before{background:#8a6d1b;}
.tl-game.fade::before{background:#a63d3d;}

.di-box{background:var(--rule-l);padding:16px;margin:0 0 0 5px;border-left:2px solid var(--rule);padding-left:24px;}
.di-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
.di-stat{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;}

.ftab{background:none;border:none;cursor:pointer;font-family:var(--sans);font-size:13px;padding:6px 0;margin-right:18px;color:var(--ink4);border-bottom:2px solid transparent;font-weight:400;}
.ftab.on{color:var(--ink);border-bottom-color:var(--ink);font-weight:600;}

@media(max-width:600px){
  .kpi-row{flex-direction:column!important;}
  .kpi+.kpi{border-left:none!important;padding-left:0!important;border-top:1px solid var(--rule-l);padding-top:10px!important;}
  .di-grid{grid-template-columns:1fr;}
  .nav-date{display:none;}
  .tl-prob{min-width:auto!important;}
  .tl-pct{font-size:22px!important;}
  .tl-pitchers-stats{flex-direction:column!important;gap:2px!important;}
}
`;

export default function App(){
  const[games,setGames]=useState([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState(null);
  const[filter,setFilter]=useState("all");
  const[expanded,setExpanded]=useState(null);

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

  // Group by time
  const filtered=(()=>{
    let a=[...games];
    if(filter==="strong")a=a.filter(g=>g.nrfi>=.60);
    if(filter==="upcoming")a=a.filter(g=>g.st==="Scheduled"||g.st==="Pre-Game");
    if(filter==="live")a=a.filter(g=>g.st.includes("Progress"));
    return a;
  })();

  const groups={};
  for(const g of filtered){
    const key=g.st.includes("Progress")?"Live Now":g.st==="Final"?"Final":g.time+" ET";
    if(!groups[key])groups[key]=[];
    groups[key].push(g);
  }
  // Sort games within each group by nrfi desc
  for(const k of Object.keys(groups))groups[k].sort((a,b)=>b.nrfi-a.nrfi);
  // Order groups: Live Now first, then by time, Final last
  const groupOrder=Object.keys(groups).sort((a,b)=>{
    if(a==="Live Now")return -1;if(b==="Live Now")return 1;
    if(a==="Final")return 1;if(b==="Final")return -1;
    return a.localeCompare(b);
  });

  const avg=games.length?(games.reduce((s,g)=>s+g.nrfi,0)/games.length*100).toFixed(1):"—";
  const best=games.length?games.reduce((a,b)=>a.nrfi>b.nrfi?a:b):null;
  const strong=games.filter(g=>g.nrfi>=.60).length;
  const day=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});

  const S={page:{minHeight:"100vh",fontFamily:"var(--sans)",color:"var(--ink)",background:"var(--paper)",WebkitFontSmoothing:"antialiased"}};

  if(loading)return(<><style>{CSS}</style><div style={{...S.page,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center"}}><div style={{width:28,height:28,border:"2px solid var(--rule)",borderTopColor:"var(--ink3)",borderRadius:"50%",animation:"spin .7s linear infinite",margin:"0 auto 16px"}}/><div style={{fontSize:14,color:"var(--ink2)"}}>Loading today's slate…</div></div></div></>);
  if(error)return(<><style>{CSS}</style><div style={{...S.page,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center",maxWidth:320}}><div style={{fontSize:14,color:"var(--ink)",marginBottom:8}}>Unable to load data</div><div style={{fontSize:13,color:"var(--ink3)",marginBottom:20}}>{error}</div><button onClick={fetchData} style={{background:"var(--ink)",border:"none",color:"var(--paper)",padding:"10px 28px",fontSize:13,cursor:"pointer",fontFamily:"var(--sans)"}}>Retry</button></div></div></>);

  return(<><style>{CSS}</style><div style={S.page}>
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
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:8}}>
        <div>
          {[["all","All games"],["strong","Strong"],["upcoming","Upcoming"],["live","Live"]].map(([k,l])=>(
            <button key={k} className={`ftab${filter===k?" on":""}`} onClick={()=>setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"48px 20px",color:"var(--ink4)",fontSize:13}}>No games match this filter.</div>
      ):(
        groupOrder.map(timeKey=>(
          <div key={timeKey} style={{marginBottom:28}}>
            <div style={{fontFamily:"var(--mono)",fontSize:14,fontWeight:500,color:"var(--ink)",paddingBottom:8,borderBottom:"2px solid var(--ink)",display:"inline-block",marginBottom:2}}>
              {timeKey}
            </div>
            {groups[timeKey].map(g=>{
              const c=conf(g.nrfi);
              const exp=expanded===g.pk;
              const isLive=g.st.includes("Progress"),isFinal=g.st==="Final";
              let res=null;
              if(isFinal&&g.fir){const hit=g.fir.a===0&&g.fir.h===0;res={t:hit?"NRFI":"YRFI",hit,c:hit?"#0f7b5f":"#a63d3d"};}

              return(
                <div key={g.pk}>
                  <div className={`tl-game ${c.cls}${exp?" expanded":""}`} onClick={()=>setExpanded(exp?null:g.pk)}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:16,fontWeight:700,color:"var(--ink)",marginBottom:2,letterSpacing:"-0.01em"}}>{g.aa} at {g.ha}</div>
                      <div className="tl-pitchers-stats" style={{display:"flex",gap:16,fontSize:13,color:"var(--ink3)"}}>
                        <span>{g.ap?.name||"TBD"}</span>
                        <span style={{color:"var(--ink5)"}}>vs</span>
                        <span>{g.hp?.name||"TBD"}</span>
                      </div>
                      {g.ap&&g.hp&&(
                        <div style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--ink4)",marginTop:3}}>
                          {g.ap.era?.toFixed(2)}/{g.ap.whip?.toFixed(2)} — {g.hp.era?.toFixed(2)}/{g.hp.whip?.toFixed(2)} ERA/WHIP
                        </div>
                      )}
                      <div style={{fontSize:11,color:"var(--ink4)",marginTop:3}}>{g.v} · PF {g.pf.toFixed(2)}</div>
                      {res&&<div style={{fontSize:11,fontWeight:600,fontFamily:"var(--mono)",marginTop:3,color:res.c}}>{res.t} {g.fir.a}-{g.fir.h}</div>}
                    </div>
                    <div className="tl-prob" style={{textAlign:"right",flexShrink:0,minWidth:80}}>
                      <div className="tl-pct" style={{fontFamily:"var(--serif)",fontSize:28,lineHeight:1,letterSpacing:"-0.02em",color:c.c}}>{(g.nrfi*100).toFixed(1)}%</div>
                      <div style={{fontSize:10,fontWeight:600,color:c.c,letterSpacing:".04em",marginTop:2}}>{c.t}</div>
                    </div>
                  </div>
                  {exp&&(
                    <div className="di-box">
                      <div className="di-grid">
                        {[{abbr:g.aa,side:"Away",pn:g.apn,bn:g.abn,td:g.atd,p:g.ap},{abbr:g.ha,side:"Home",pn:g.hpn,bn:g.hbn,td:g.htd,p:g.hp}].map(t=>(
                          <div key={t.side}>
                            <div style={{fontSize:10,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>{t.abbr} — {t.side}</div>
                            {[["Hold rate",`${(t.pn*100).toFixed(1)}%`],["Bat NRFI",`${(t.bn*100).toFixed(1)}%`,`${t.td.bn}/${t.td.bg}`],...(t.p?[["Starts",t.p.starts||0],["IP",t.p.ip?.toFixed(1)||"—"],["K/9",t.p.k9?.toFixed(1)||"—"],["BB/9",t.p.bb9?.toFixed(1)||"—"]]:[])]
                            .map(([label,val,extra],i)=>(
                              <div key={i} className="di-stat">
                                <span style={{color:"var(--ink4)"}}>{label}</span>
                                <span style={{fontFamily:"var(--mono)",fontWeight:500,color:"var(--ink)"}}>{val}{extra&&<span style={{color:"var(--ink5)",fontSize:10,marginLeft:6}}>{extra}</span>}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div style={{fontSize:11,color:"var(--ink4)",marginTop:10,paddingTop:8,borderTop:"1px solid var(--rule)"}}>
                        Park factor {g.pf.toFixed(2)} · {g.pf>1.03?"Hitter-friendly":g.pf<.97?"Pitcher-friendly":"Neutral"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  </div></>);
}
