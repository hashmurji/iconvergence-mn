import React, { useState, useMemo, useEffect, useCallback } from "react";

// --- AUTH0 CONFIG ------------------------------------------------------------
const AUTH0_DOMAIN = "iconvergence.uk.auth0.com";
const AUTH0_CLIENT_ID = "jWc8OqcK0Vw77Z1sIYQOr7BNviukmrbp";
const AUTH0_REDIRECT_URI = typeof window !== "undefined" ? window.location.origin : "";

const generateCodeVerifier = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).split("+").join("-").split("/").join("_").split("=").join("");
};
const generateCodeChallenge = async (verifier) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).split("+").join("-").split("/").join("_").split("=").join("");
};

const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getStoredAuth = () => {
    try { const s = sessionStorage.getItem("mn_auth"); return s ? JSON.parse(s) : null; } catch(e) { return null; }
  };
  const decodeJWT = (token) => {
    try { const b = token.split(".")[1].split("-").join("+").split("_").join("/"); return JSON.parse(atob(b)); } catch(e) { return null; }
  };
  const getUserFromToken = (idToken, accessToken) => {
    const d = decodeJWT(idToken);
    if (!d) return null;
    const roles = d["https://iconvergence.co.uk/roles"] || d["https://iconvergence.uk.auth0.com/roles"] || [];
    const clientId = d["https://iconvergence.co.uk/client_id"] || d["https://iconvergence.uk.auth0.com/client_id"] || null;
    return { sub: d.sub, email: d.email, name: d.name || d.email, roles, clientId, isAdviser: roles.includes("adviser") || roles.length === 0, isClient: roles.includes("client"), idToken, accessToken };
  };
  const handleCallback = async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const storedState = sessionStorage.getItem("auth0_state");
    const verifier = sessionStorage.getItem("auth0_verifier");
    if (!code || !verifier) return false;
    if (state !== storedState) { setError("Invalid state"); return false; }
    try {
      const response = await fetch("https://"+AUTH0_DOMAIN+"/oauth/token", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "authorization_code", client_id: AUTH0_CLIENT_ID, code_verifier: verifier, code, redirect_uri: AUTH0_REDIRECT_URI }),
      });
      const tokens = await response.json();
      if (tokens.error) { setError(tokens.error_description); return false; }
      const authData = { idToken: tokens.id_token, accessToken: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in * 1000) };
      sessionStorage.setItem("mn_auth", JSON.stringify(authData));
      sessionStorage.removeItem("auth0_state"); sessionStorage.removeItem("auth0_verifier");
      window.history.replaceState({}, document.title, window.location.pathname);
      return authData;
    } catch(e) { setError("Login failed: "+e.message); return false; }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      if (window.location.search.includes("code=")) {
        const authData = await handleCallback();
        if (authData) setUser(getUserFromToken(authData.idToken, authData.accessToken));
      } else {
        const stored = getStoredAuth();
        if (stored && stored.expiresAt > Date.now()) setUser(getUserFromToken(stored.idToken, stored.accessToken));
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateCodeVerifier();
    sessionStorage.setItem("auth0_verifier", verifier);
    sessionStorage.setItem("auth0_state", state);
    const params = new URLSearchParams({ response_type: "code", client_id: AUTH0_CLIENT_ID, redirect_uri: AUTH0_REDIRECT_URI, scope: "openid profile email", audience: "https://api.ubiquiti.co.uk", state, code_challenge: challenge, code_challenge_method: "S256" });
    window.location.href = "https://"+AUTH0_DOMAIN+"/authorize?"+params.toString();
  };
  const logout = () => {
    sessionStorage.removeItem("mn_auth");
    setUser(null);
    window.location.href = "https://"+AUTH0_DOMAIN+"/v2/logout?client_id="+AUTH0_CLIENT_ID+"&returnTo="+encodeURIComponent(AUTH0_REDIRECT_URI);
  };
  return { user, loading, error, login, logout };
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return isMobile;
};


// --- LIVE DATA HOOK (AWS-backed) ---------------------------------------------
const getStoredAccessToken = () => {
  try {
    const s = sessionStorage.getItem("mn_auth");
    const parsed = s ? JSON.parse(s) : null;
    return parsed ? parsed.accessToken : null;
  } catch (e) { return null; }
};

const useDashboardStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchStats = (bust=false) => {
    setLoading(true);
    try {
      const stored = sessionStorage.getItem("mn_auth");
      const token = stored ? JSON.parse(stored).accessToken : null;
      const headers = token ? { Authorization: "Bearer " + token } : {};
      fetch("/api/dashboardstats"+(bust?"?t="+Date.now():""), { headers })
        .then(r=>r.json())
        .then(d=>{ if(!d.error) setStats(d); })
        .catch(()=>{})
        .finally(()=>setLoading(false));
    } catch(e) { setLoading(false); }
  };
  useEffect(()=>{ fetchStats(); }, []);
  return { stats, loading, refresh: ()=>fetchStats(true) };
};

const useOneDriveData = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = async (forceRefresh=false) => {
    setLoading(true);
    setError(null);
    try {
      const bust = forceRefresh ? '?t='+Date.now() : '';
      const authHeader = { Authorization: "Bearer " + (getStoredAccessToken() || "") };
      const [cr, vr, hr, wr, dr, tr, docr] = await Promise.all([
        fetch("/api/clients"+bust, { headers: authHeader }),
        fetch("/api/valuations"+bust, { headers: authHeader }),
        fetch("/api/holdings"+bust, { headers: authHeader }),
        fetch("/api/withdrawals"+bust, { headers: authHeader }),
        fetch("/api/distributions"+bust, { headers: authHeader }),
        fetch("/api/transactions"+bust, { headers: authHeader }),
        fetch("/api/documents"+bust, { headers: authHeader }),
      ]);
      const [cj, vj, hj, wj, dj, tj, docj] = await Promise.all([
        cr.json(), vr.json(), hr.json(), wr.json(), dr.json(), tr.json(), docr.json()
      ]);
      if (cj.error) throw new Error(cj.error);
      const json = {
        clients: cj.clients,
        valuations: vj.valuations || {},
        holdings: hj.holdings || {},
        withdrawals: wj.withdrawals || {},
        distributions: dj.distributions || {},
        txns: tj.txns || [],
        documents: docj.documents || {},
        lastUpdated: cj.lastUpdated,
      };
      setData(json);
      setLastUpdated(cj.lastUpdated);
    } catch (err) {
      console.error("Data fetch error:", err);
      setError(err.message);
      // Fall back to static data if API fails
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return { data, loading, error, lastUpdated, refresh: (force=false) => fetchData(force) };
};

// --- BRAND -------------------------------------------------------------------
const C = {
  navy: "#061B33", navyMid: "#092D4A", navyLight: "#0D3D5E",
  teal: "#10C6C1", tealLight: "#DDFBFA",
  silver: "#EFF7FB", silverMid: "#AAB6C5",
  white: "#FFFFFF", text: "#061B33", faint: "#5B6B84",
  green: "#22C58B", greenBg: "#D1FAE5",
  red: "#FF5A5F", redBg: "#FFE4E4",
  amber: "#F5A623", amberBg: "#FEF3C7",
  blue: "#1D7DFF", blueLight: "#EFF7FB",
  gold: "#F5A623", goldLight: "#FEF5E7",
};

// --- FX (static for now - will be updated manually) -------------------------
const FX = { USDAUD: 1.501186, AUDUSD: 0.6661, USDEUR: 0.91954, EURUSD: 1.0875, USDGBP: 0.792519, GBPUSD: 1.2619, AUDEUR: 0.6128, EURAUD: 1.6318, AUDGBP: 0.5279, GBPAUD: 1.8944, EURGBP: 0.8620, GBPEUR: 1.1600, USDCHF: 0.871688, CHFUSD: 1.1472, GBPCHF: 1.1000, CHFGBP: 0.9091, EURCHF: 0.9480, CHFEUR: 1.0549, AUDCHF: 0.5806, CHFAUD: 1.7223 };
const CCY_SYMBOLS = { USD: "$", GBP: "£", EUR: "€", AUD: "A$", CHF: "CHF " };
const convertAmount = (amount, fromCcy, toCcy) => {
  const n = Number(amount);
  if (!n || isNaN(n)) return 0;
  if (fromCcy === toCcy) return n;
  const key = fromCcy.toUpperCase()+toCcy.toUpperCase();
  if (FX[key]) return n * FX[key];
  const key2 = toCcy.toUpperCase()+fromCcy.toUpperCase();
  if (FX[key2]) return n / FX[key2];
  return n;
};

// --- CLIENT DATA (from MN_Client_Data_for_PAS_test.xlsx) ---------------------
const CLIENTS = [];
const VALUATIONS = {};
const HOLDINGS = {};
const WITHDRAWALS = {};

const DISTRIBUTIONS = {};

// --- TRANSACTIONS (from MN_TX_For_PAS_test.csv) ------------------------------
const TXNS = [];


// --- DOCUMENTS --------------------------------------------------------------
const DOCUMENTS = {};

const DOC_CATEGORIES = ["All", "Valuation", "Distribution", "Statement", "Agreement", "Withdrawal"];


// --- HELPERS -----------------------------------------------------------------
const fmt = (n, dp=2) => { if (n == null) return "--"; return Math.abs(n).toLocaleString("en-GB",{minimumFractionDigits:dp,maximumFractionDigits:dp}); };
const pct = (n) => { if (n == null) return "--"; return (n >= 0 ? "+" : "") + fmt(n) + "%"; };
const posColor = (n) => n >= 0 ? C.green : C.red;
const posBg = (n) => n >= 0 ? C.greenBg : C.redBg;

// --- STYLED ATOMS ------------------------------------------------------------
const Badge = ({children, color="info"}) => {
  const cols = {
    info:{bg:"#E6F9F8",text:"#009990"}, success:{bg:"#D1FAE5",text:"#065F46"},
    warning:{bg:"#FEF3C7",text:"#92400E"}, error:{bg:"#FEE2E2",text:"#991B1B"},
    navy:{bg:"#1E3A5F",text:"#93C5FD"},
  };
  const col = cols[color] || cols.info;
  return <span style={{background:col.bg,color:col.text,fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:100,display:"inline-block",letterSpacing:0.3,whiteSpace:"nowrap"}}>{children}</span>;
};

const Btn = ({children, onClick, variant="primary", small}) => {
  const s = {
    primary:{background:C.teal,color:C.white,border:"none"},
    secondary:{background:"transparent",color:C.navy,border:"1.5px solid "+C.navy},
    ghost:{background:"transparent",color:C.teal,border:"1.5px solid "+C.teal},
  };
  return <button onClick={onClick} style={{...s[variant],fontFamily:"'Inter',sans-serif",fontSize:small?11:13,fontWeight:500,padding:small?"5px 11px":"8px 15px",borderRadius:6,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5}}>{children}</button>;
};

const Modal = ({title, onClose, children}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:C.white,borderRadius:12,padding:28,width:560,maxWidth:"97vw",maxHeight:"90vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontFamily:"Inter,sans-serif",fontSize:18,fontWeight:600,color:C.navy}}>{title}</div>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:C.faint,lineHeight:1}}>x</button>
      </div>
      {children}
    </div>
  </div>
);

// --- NAV ---------------------------------------------------------------------
const CCYSelector = ({selectedCcy, onChange}) => (
  <div style={{display:"flex",alignItems:"center",gap:2,background:"rgba(255,255,255,0.08)",borderRadius:7,padding:"2px 3px"}}>
    {["USD","GBP","EUR","AUD","CHF"].map(c=>(
      <button key={c} onClick={()=>onChange(c)} style={{background:selectedCcy===c?C.teal:"transparent",color:selectedCcy===c?C.white:"rgba(255,255,255,0.55)",border:"none",borderRadius:5,padding:"3px 8px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
        {c}
      </button>
    ))}
  </div>
);

const Nav = ({section, setSection, selectedCcy, setCcy, user, logout}) => {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = [
    {key:"dashboard", label:"Dashboard", icon:"◈"},
    {key:"clients", label:"Clients", icon:"◉"},
    {key:"withdrawals", label:"Withdrawals", icon:"◇"},
    {key:"connect", label:"Connect", icon:"◆"},
    {key:"users", label:"Users", icon:"◎"},
  ];
  const handleNav = (key) => { setSection(key); setMenuOpen(false); };
  return (
    <>
      <div style={{background:C.navy,display:"flex",alignItems:"center",padding:"0 16px",height:54,position:"sticky",top:0,zIndex:200,flexShrink:0,borderBottom:"1px solid rgba(0,184,176,0.15)"}}>
        <div onClick={()=>handleNav("dashboard")} style={{fontFamily:"Inter,sans-serif",fontSize:isMobile?16:20,fontWeight:700,color:C.white,marginRight:isMobile?10:24,flexShrink:0,cursor:"pointer",letterSpacing:-0.5,display:"flex",alignItems:"center",gap:8}}>
          <img src="/ubiquity-mark.png" alt="Ubiquity" style={{height:28,width:"auto"}}/>
          <span style={{color:C.white}}>Ubiquity</span>
        </div>
        {!isMobile && items.filter(i=>i.key!=="users" || (user&&user.isAdviser)).map(i=>(
          <button key={i.key} onClick={()=>handleNav(i.key)} style={{background:"none",border:"none",color:section===i.key?C.teal:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:section===i.key?600:400,cursor:"pointer",padding:"0 9px",height:"100%",borderBottom:section===i.key?"2px solid "+C.teal:"2px solid transparent",transition:"all 0.15s",whiteSpace:"nowrap",fontFamily:"'Inter',sans-serif"}}>
            {i.label}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:isMobile?8:12}}>
          <CCYSelector selectedCcy={selectedCcy} onChange={setCcy}/>
          {!isMobile && <div style={{width:32,height:32,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:12,fontWeight:600,cursor:"pointer"}} title={user&&user.email}>
            {user?user.name.split(" ").map(n=>n[0]).join("").slice(0,2):"?"}
          </div>}
          {!isMobile && user && <button onClick={logout} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.6)",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>Sign out</button>}
          {isMobile && <button onClick={()=>setMenuOpen(o=>!o)} style={{background:"none",border:"none",cursor:"pointer",padding:4,display:"flex",flexDirection:"column",gap:4,width:32,height:32,alignItems:"center",justifyContent:"center"}}>
            <div style={{width:20,height:2,background:C.white,transition:"transform 0.2s",transform:menuOpen?"rotate(45deg) translate(0,6px)":"none"}}/>
            <div style={{width:20,height:2,background:C.white,opacity:menuOpen?0:1}}/>
            <div style={{width:20,height:2,background:C.white,transition:"transform 0.2s",transform:menuOpen?"rotate(-45deg) translate(0,-6px)":"none"}}/>
          </button>}
        </div>
      </div>
      {isMobile && menuOpen && (
        <>
          <div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:190,top:54}}/>
          <div style={{position:"fixed",top:54,left:0,right:0,background:C.navy,zIndex:195,borderBottom:"2px solid "+C.teal}}>
            {items.filter(i=>i.key!=="users"||(user&&user.isAdviser)).map(i=>(
              <button key={i.key} onClick={()=>handleNav(i.key)} style={{display:"flex",alignItems:"center",gap:14,width:"100%",background:section===i.key?C.navyLight:"none",border:"none",borderBottom:"0.5px solid rgba(255,255,255,0.07)",color:section===i.key?C.teal:C.white,fontSize:15,fontWeight:section===i.key?600:400,cursor:"pointer",padding:"15px 20px",fontFamily:"'Inter',sans-serif",textAlign:"left",boxSizing:"border-box"}}>
                <span style={{fontSize:18,width:24,textAlign:"center"}}>{i.icon}</span>
                <span>{i.label}</span>
              </button>
            ))}
            <div style={{padding:"12px 20px",borderTop:"0.5px solid rgba(255,255,255,0.1)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>{user&&user.email}</span>
              <button onClick={logout} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.6)",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>Sign out</button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

// --- DASHBOARD ---------------------------------------------------------------
const Dashboard = ({setSection, setSelectedClient, selectedCcy, clients: propClients, valuations: propValuations, lastUpdated, dataError, onRefresh, dashboardStats}) => {
  const isMobile = useIsMobile();
  const sym = CCY_SYMBOLS[selectedCcy] || "$";
  const clients = propClients || [];
  const valuations = propValuations || {};
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // Compute FX-converted totals from dashboardStats
  const convertByCurrency = (byCurrency) => {
    if (!byCurrency) return 0;
    return Object.entries(byCurrency).reduce((sum, [ccy, amount]) => {
      return sum + convertAmount(amount, ccy, selectedCcy);
    }, 0);
  };
  const totalAUM = dashboardStats ? convertByCurrency(dashboardStats.aumByCurrency) : Object.values(valuations).reduce((s,v) => s + convertAmount(v.totalBriteAssets||0, v.currency||"USD", selectedCcy), 0);
  const totalCash = dashboardStats ? convertByCurrency(dashboardStats.cashByCurrency) : Object.values(valuations).reduce((s,v) => s + convertAmount(v.totalCashBalance||0, v.currency||"USD", selectedCcy), 0);
  const totalBeneficiaries = dashboardStats ? dashboardStats.totalBeneficiaries : clients.length;
  const activeClients = dashboardStats ? dashboardStats.activeClients : clients.length;
  const trustees = dashboardStats ? (dashboardStats.trustees || []).filter(t => t && t.trustee) : [];
  const trusteeAUM = (t) => (t.amounts||[]).reduce((s,a) => s + convertAmount(parseFloat(a.amount)||0, a.currency||"USD", selectedCcy), 0);
  const grandTrusteeAUM = trustees.reduce((s,t) => s + trusteeAUM(t), 0);
  const rawStockTypes = dashboardStats ? dashboardStats.aumByStockType || [] : [];
  const stockTypeAUM = (st) => (st.amounts||[]).reduce((s,a) => s + convertAmount(parseFloat(a.amount)||0, a.currency||"USD", selectedCcy), 0);
  // Add cash as a stock type entry
  const stockTypesWithCash = [...rawStockTypes, {type:"Cash", amounts: Object.entries(dashboardStats?.cashByCurrency||{}).map(([currency,amount])=>({currency,amount}))}];
  const grandStockAUM = stockTypesWithCash.reduce((s,st) => s + stockTypeAUM(st), 0);
  const CHART_COLORS = ["#10C6C1","#1D7DFF","#22C58B","#F5A623","#FF5A5F","#8B5CF6","#EC4899","#F97316","#06B6D4","#84CC16","#6366F1","#14B8A6"];

  const searchResults = useMemo(() => {
    if (!search || search.length < 2) return [];
    const q = search.toLowerCase();
    return clients.filter(cl =>
      (cl.name && String(cl.name).toLowerCase().includes(q)) ||
      (cl.id && String(cl.id).toLowerCase().includes(q)) ||
      (cl.email && String(cl.email).toLowerCase().includes(q)) ||
      (cl.primaryCode && String(cl.primaryCode).toLowerCase().includes(q))
    ).slice(0, 10);
  }, [search, clients]);
  const handleSelectClient = (id) => { setSearch(""); setSearchFocused(false); setSelectedClient(id); setSection("clients"); };
  const totalLiabilities = Object.values(valuations).reduce((s,v) => s + convertAmount(v.totalLiabilities, v.currency||"USD", selectedCcy), 0);

  return (
    <div style={{padding:isMobile?"14px 12px":24}}>
      <div style={{marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:3,textTransform:"uppercase",color:C.teal,marginBottom:3}}>Platform overview</div>
          <div style={{fontFamily:"Inter,sans-serif",fontSize:isMobile?20:26,fontWeight:700,color:C.navy}}>Aggregate Dashboard</div>
          {lastUpdated && <div style={{fontSize:11,color:C.faint,marginTop:3}}>Last synced: {new Date(lastUpdated).toLocaleString()}</div>}
          {dataError && <div style={{fontSize:11,color:C.red,marginTop:3}}>Data error: {dataError} — showing cached data</div>}
        </div>
        {onRefresh && <button onClick={()=>onRefresh(true)} style={{background:C.teal,color:C.white,border:"none",borderRadius:6,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",gap:6}}>↻ Refresh data</button>}
      </div>

      <div style={{position:"relative",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",background:C.white,border:"1.5px solid "+(searchFocused?C.teal:C.silverMid),borderRadius:8,padding:"10px 14px",gap:10}}>
          <span style={{color:C.faint}}>&#128269;</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} onFocus={()=>setSearchFocused(true)} onBlur={()=>setTimeout(()=>setSearchFocused(false),150)}
            placeholder="Search clients by name, ID, email..."
            style={{flex:1,border:"none",outline:"none",fontSize:14,fontFamily:"'Inter',sans-serif",color:C.navy,background:"transparent"}}/>
          {search && <button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:C.faint,fontSize:16,padding:0}}>x</button>}
        </div>
        {searchResults.length > 0 && (
          <div style={{position:"absolute",top:"100%",left:0,right:0,background:C.white,border:"1px solid "+C.silver,borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:100,marginTop:4,maxHeight:380,overflowY:"auto"}}>
            {searchResults.map(cl => {
              const val = valuations[cl.id];
              const aum = val ? convertAmount(val.totalAssetValuation,val.currency||"USD",selectedCcy) : null;
              return (
                <div key={cl.id} onMouseDown={()=>handleSelectClient(cl.id)}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",cursor:"pointer",borderBottom:"0.5px solid "+C.silver,background:C.white}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.tealLight}
                  onMouseLeave={e=>e.currentTarget.style.background=C.white}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:34,height:34,borderRadius:"50%",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:11,fontWeight:700,flexShrink:0}}>
                      {cl.name ? cl.name.trim().split(" ").filter(Boolean).map(n=>n[0]).join("").slice(0,2) : "?"}
                    </div>
                    <div>
                      <div style={{fontWeight:600,color:C.navy,fontSize:14}}>{cl.name || "Unknown"}</div>
                      <div style={{fontSize:11,color:C.faint}}>{cl.primaryCode||""} · {cl.jurisdiction||""}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                    {aum !== null && <div style={{fontSize:13,fontWeight:600,color:C.navy}}>{sym}{fmt(aum,0)}</div>}
                    <span style={{color:C.teal,fontSize:12,fontWeight:600}}>View &rarr;</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {search.length >= 2 && searchResults.length === 0 && (
          <div style={{position:"absolute",top:"100%",left:0,right:0,background:C.white,border:"1px solid "+C.silver,borderRadius:8,padding:16,textAlign:"center",color:C.faint,fontSize:13,zIndex:100,marginTop:4}}>No clients found</div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:12,marginBottom:14}}>
        {[
          {label:"Total AUM", value:sym+fmt(totalAUM,0), sub:selectedCcy, icon:"◈", iconBg:"rgba(16,198,193,0.12)", iconColor:C.teal},
          {label:"Total Beneficiaries", value:(dashboardStats?dashboardStats.totalBeneficiaries:clients.length).toLocaleString(), sub:"across all clients", icon:"◉", iconBg:"rgba(29,125,255,0.10)", iconColor:"#1D7DFF"},
          {label:"Active Clients", value:(dashboardStats?dashboardStats.activeClients:clients.length).toLocaleString(), sub:"status active", icon:"◎", iconBg:"rgba(34,197,139,0.12)", iconColor:C.green},
          {label:"Cash Balance", value:sym+fmt(totalCash,0), sub:selectedCcy, icon:"◇", iconBg:"rgba(6,27,51,0.08)", iconColor:C.navy},
        ].map(s=>(
          <div key={s.label} style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,padding:"16px 18px",boxShadow:"0 2px 8px rgba(6,27,51,0.06)",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.faint,marginBottom:8}}>{s.label}</div>
              <div style={{fontFamily:"Inter,sans-serif",fontSize:isMobile?18:24,fontWeight:700,color:C.navy,letterSpacing:-0.5,lineHeight:1}}>{s.value}</div>
              <div style={{fontSize:11,color:C.faint,marginTop:4}}>{s.sub}</div>
            </div>
            <div style={{width:42,height:42,borderRadius:10,background:s.iconBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{fontSize:20,color:s.iconColor}}>{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14,marginBottom:14,alignItems:"start"}}>
      {trustees && trustees.length > 0 && (
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:"0.5px solid "+C.silver,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.navy}}>Top Trustees by AUM</div>
            <div style={{fontSize:11,color:C.faint}}>in {selectedCcy}</div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:C.silver}}>
                {["Trustee","Clients","AUM ("+selectedCcy+")","% of Total"].map(h=>(
                  <th key={h} style={{textAlign:"left",padding:"6px 12px",fontSize:9,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trustees.map((t,i) => {
                const aum = trusteeAUM(t);
                const pct = grandTrusteeAUM > 0 ? (aum/grandTrusteeAUM*100).toFixed(1) : "0.0";
                const colors = ["#10C6C1","#1D7DFF","#22C58B","#F5A623","#FF5A5F","#8B5CF6","#EC4899","#F97316","#06B6D4","#84CC16"];
                const bgColor = colors[i % colors.length];
                return (
                  <tr key={t.trustee} style={{borderBottom:"0.5px solid "+C.silver}}>
                    <td style={{padding:"8px 12px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:28,height:28,borderRadius:8,background:bgColor,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:9,fontWeight:700,flexShrink:0,letterSpacing:0.5}}>
                          {(t.trustee||"?").trim().split(" ").filter(Boolean).map(n=>n[0]).join("").slice(0,3).toUpperCase()}
                        </div>
                        <span style={{fontWeight:600,color:C.navy,fontSize:12}}>{t.trustee||"Unknown"}</span>
                      </div>
                    </td>
                    <td style={{padding:"8px 12px",color:C.text}}>{t.beneficiaries.toLocaleString()}</td>
                    <td style={{padding:"8px 12px",fontWeight:600,color:C.navy}}>{sym}{fmt(aum,0)}</td>
                    <td style={{padding:"8px 12px",minWidth:100}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{flex:1,height:3,background:C.silver,borderRadius:2}}>
                          <div style={{width:Math.min(parseFloat(pct),100)+"%",height:"100%",background:bgColor,borderRadius:2}}/>
                        </div>
                        <span style={{fontSize:11,color:C.faint,minWidth:30,textAlign:"right"}}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

        {/* RIGHT: AUM by Investment Type Donut Chart */}
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:"0.5px solid "+C.silver,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.navy}}>AUM by Investment Type</div>
            <div style={{fontSize:11,color:C.faint}}>{selectedCcy}</div>
          </div>
          <div style={{padding:"16px"}}>
            {stockTypesWithCash.length > 0 && (() => {
              const sorted = [...stockTypesWithCash].sort((a,b)=>stockTypeAUM(b)-stockTypeAUM(a)).slice(0,10);
              let cumulative = 0;
              const segments = sorted.map((st,i)=>{
                const val = stockTypeAUM(st);
                const pct = grandStockAUM>0?(val/grandStockAUM*100):0;
                const start = cumulative;
                cumulative += pct;
                return {...st,val,pct,start,color:CHART_COLORS[i%CHART_COLORS.length]};
              });
              const size=180,cx=90,cy=90,r=72,inner=40;
              const polarToXY=(deg,radius)=>{const rad=(deg-90)*Math.PI/180;return [cx+radius*Math.cos(rad),cy+radius*Math.sin(rad)];};
              const makeArc=(start,end,r)=>{if(end-start>=100)end=start+99.99;const[x1,y1]=polarToXY(start*3.6,r);const[x2,y2]=polarToXY(end*3.6,r);const large=(end-start)>50?1:0;return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;};
              return (
                <div style={{display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
                  <svg width={size} height={size} style={{flexShrink:0}}>
                    {segments.map((seg,i)=>(<path key={i} d={makeArc(seg.start,seg.start+seg.pct,r)} fill={seg.color} opacity={0.9}/>))}
                    <circle cx={cx} cy={cy} r={inner} fill="white"/>
                    <text x={cx} y={cy-7} textAnchor="middle" fontSize="12" fontWeight="700" fill="#061B33">{sym}{fmt(grandStockAUM/1000000,1)}M</text>
                    <text x={cx} y={cy+9} textAnchor="middle" fontSize="9" fill="#5B6B84">Total AUM</text>
                  </svg>
                  <div style={{flex:1,minWidth:120}}>
                    {segments.map((seg,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                        <div style={{width:10,height:10,borderRadius:3,background:seg.color,flexShrink:0}}/>
                        <div style={{flex:1,fontSize:11,color:C.navy,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{seg.type}</div>
                        <span style={{fontSize:11,fontWeight:600,color:C.navy,flexShrink:0}}>{seg.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

    </div>
  );
};

// --- CLIENT DETAIL -----------------------------------------------------------
const ClientDetail = ({clientId, onBack, selectedCcy, setPreviewClient, holdings: propHoldings, withdrawals: propWithdrawals, distributions: propDistributions, txns: propTxns, valuations: propValuations, clients: propClients, liveDocuments}) => {
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  useEffect(() => {
    if (!clientId) return;
    setDetailLoading(true); setDetailData(null);
    fetch("/api/clientdetail?clientId="+clientId).then(r=>r.json()).then(d=>{ if(!d.error) setDetailData(d); }).catch(()=>{}).finally(()=>setDetailLoading(false));
  }, [clientId]);
    const isMobile = useIsMobile();
  const [tab, setTab] = useState("valuation");
  const [search, setSearch] = useState("");
  const [txFilter, setTxFilter] = useState("all");
  const sym = CCY_SYMBOLS[selectedCcy] || "$";

  const clientsSource = propClients || CLIENTS;
  const client = clientsSource.find(c => c.id === clientId);
  const val = (propValuations || VALUATIONS)[clientId];
  const holdings = (detailData&&detailData.holdings) ? detailData.holdings[clientId]||[] : (propHoldings||HOLDINGS)[clientId]||[];
  const withdrawals = (detailData&&detailData.withdrawals) ? detailData.withdrawals[clientId]||[] : (propWithdrawals||WITHDRAWALS)[clientId]||[];
  const distributions = (detailData&&detailData.distributions) ? detailData.distributions[clientId]||[] : (propDistributions||DISTRIBUTIONS)[clientId]||[];
  const allTxns = (detailData&&detailData.txns&&detailData.txns.length>0) ? detailData.txns : (propTxns||TXNS);
  const txns = allTxns.filter(t => t.clientId === clientId);
  const resolvedDocuments = (detailData&&detailData.documents) ? detailData.documents : (liveDocuments||{});

  const filteredTxns = useMemo(() => {
    let d = txns;
    if (txFilter !== "all") d = d.filter(t => t.selector.toLowerCase() === txFilter || t.txtype.toLowerCase() === txFilter);
    if (search) d = d.filter(t => [t.description, t.ticker, t.txtype].some(v => v && v.toLowerCase().includes(search.toLowerCase())));
    return d;
  }, [txns, txFilter, search]);

  if (detailLoading) return (<div style={{padding:32,display:"flex",alignItems:"center",gap:12}}><div style={{width:24,height:24,border:"3px solid rgba(0,184,176,0.3)",borderTop:"3px solid #00B8B0",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/><span style={{color:C.faint,fontSize:14}}>Loading client data...</span></div>);
  if (!client) return <div style={{padding:24}}>Client not found</div>;

  const tabs = [["valuation","Valuation"],["holdings","Holdings"],["transactions","Transactions"],["withdrawals","Withdrawals"],["distribution","Distribution"],["documents","Documents"],["crm","CRM"]];

  return (
    <div style={{padding:isMobile?"10px 12px":24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.teal,fontSize:13,cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:4,fontFamily:"'Inter',sans-serif"}}>
          &larr; All clients
        </button>
        <button onClick={()=>setPreviewClient(clientId)} style={{background:C.teal,color:C.white,border:"none",borderRadius:6,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",gap:6}}>
          ◉ View as client
        </button>
      </div>

      <div style={{background:C.navy,borderRadius:12,padding:isMobile?"14px":20,marginBottom:18,display:"flex",flexWrap:"wrap",gap:16,justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:16,fontWeight:700,flexShrink:0}}>
            {client.name.split(" ").map(n=>n[0]).join("")}
          </div>
          <div>
            <div style={{fontFamily:"Inter,sans-serif",fontSize:isMobile?18:22,fontWeight:700,color:C.white}}>{client.name}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>{client.primaryCode} · {client.reportingCcy} · {client.jurisdiction}</div>
          </div>
        </div>
        {val && (
          <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)"}}>Asset Valuation</div>
              <div style={{fontFamily:"Inter,sans-serif",fontSize:20,fontWeight:700,color:C.white}}>{sym}{fmt(convertAmount(val.totalAssetValuation, client.reportingCcy||"USD", selectedCcy),0)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)"}}>Cash</div>
              <div style={{fontFamily:"Inter,sans-serif",fontSize:20,fontWeight:700,color:C.teal}}>{sym}{fmt(convertAmount(val.totalCashBalance, client.reportingCcy||"USD", selectedCcy),0)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)"}}>Liabilities</div>
              <div style={{fontFamily:"Inter,sans-serif",fontSize:20,fontWeight:700,color:C.red}}>{sym}{fmt(convertAmount(val.totalLiabilities, client.reportingCcy||"USD", selectedCcy),0)}</div>
            </div>
          </div>
        )}
      </div>

      <div style={{borderBottom:"1.5px solid "+C.silver,marginBottom:20,display:"flex",overflowX:"auto",gap:0}}>
        {tabs.map(([t,label])=>(
          <button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",borderBottom:tab===t?"2px solid "+C.teal:"2px solid transparent",color:tab===t?C.teal:C.faint,fontSize:13,fontWeight:tab===t?600:400,cursor:"pointer",padding:"9px 16px",marginBottom:-1,whiteSpace:"nowrap",fontFamily:"'Inter',sans-serif"}}>
            {label}
          </button>
        ))}
      </div>

      {tab==="valuation" && val && (
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(2,1fr)",gap:12}}>
          <div style={{gridColumn:"1 / -1",fontSize:12,color:C.faint,marginBottom:-4,display:"flex",alignItems:"center",gap:6}}>
            <span>Source values reported in</span>
            <Badge color="navy">{client.reportingCcy || "USD"}</Badge>
            <span>· Showing in</span>
            <Badge color="info">{selectedCcy}</Badge>
          </div>
          {[
            {label:"Total Valuation Notice", value:sym+fmt(convertAmount(val.totalValuationNotice, client.reportingCcy||"USD", selectedCcy),2)},
            {label:"Total Brite Assets", value:sym+fmt(convertAmount(val.totalBriteAssets, client.reportingCcy||"USD", selectedCcy),2)},
            {label:"Total Asset Valuation", value:sym+fmt(convertAmount(val.totalAssetValuation, client.reportingCcy||"USD", selectedCcy),2)},
            {label:"Total Cash Balance", value:sym+fmt(convertAmount(val.totalCashBalance, client.reportingCcy||"USD", selectedCcy),2)},
            {label:"Pension Valuation", value:sym+fmt(convertAmount(val.pensionValuation, client.reportingCcy||"USD", selectedCcy),2)},
            {label:"Pension Cash Balance", value:sym+fmt(convertAmount(val.pensionCash, client.reportingCcy||"USD", selectedCcy),2)},
            {label:"Direct Investment Cash", value:sym+fmt(convertAmount(val.directInvestmentCash, client.reportingCcy||"USD", selectedCcy),2)},
            {label:"Direct Investment Assets", value:sym+fmt(convertAmount(val.directInvestmentAssets, client.reportingCcy||"USD", selectedCcy),2)},
            {label:"Total Liabilities", value:sym+fmt(convertAmount(val.totalLiabilities, client.reportingCcy||"USD", selectedCcy),2), red:true},
            {label:"Surrender Rebate Payable", value:sym+fmt(convertAmount(val.surrenderRebatePayable, client.reportingCcy||"USD", selectedCcy),2), red:true},
          ].map(row=>(
            <div key={row.label} style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,color:C.faint}}>{row.label}</div>
              <div style={{fontFamily:"Inter,sans-serif",fontSize:16,fontWeight:600,color:row.red?C.red:C.navy}}>{row.value}</div>
            </div>
          ))}
        </div>
      )}

      {tab==="holdings" && (
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:820}}>
            <thead>
              <tr style={{borderBottom:"1.5px solid "+C.silver,background:C.silver}}>
                {["Holding","Account","Shares","Purchase Price","CCY","Market Value","CCY","Gain / Loss","CCY","% Change"].map(h=>(
                  <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h,i)=>(
                <tr key={i} style={{borderBottom:"0.5px solid "+C.silver,background:i%2===0?C.white:"#FAFBFC"}}>
                  <td style={{padding:"10px 12px",fontWeight:600,color:C.navy}}>{h.name}</td>
                  <td style={{padding:"10px 12px",color:C.faint,fontSize:11}}>{h.account}</td>
                  <td style={{padding:"10px 12px",color:C.text}}>{h.shares.toLocaleString()}</td>
                  <td style={{padding:"10px 12px",color:C.text}}>{h.purchasePrice}</td>
                  <td style={{padding:"10px 12px",color:C.faint,fontSize:11}}>{h.purchasePriceCcy||""}</td>
                  <td style={{padding:"10px 12px",fontWeight:600,color:C.navy}}>{h.marketValue}</td>
                  <td style={{padding:"10px 12px",color:C.faint,fontSize:11}}>{h.marketValueCcy||""}</td>
                  <td style={{padding:"10px 12px",color:posColor(h.pctChange)}}>{h.gainLoss}</td>
                  <td style={{padding:"10px 12px",color:C.faint,fontSize:11}}>{h.gainLossCcy||""}</td>
                  <td style={{padding:"10px 12px"}}>
                    <span style={{background:posBg(h.pctChange),color:posColor(h.pctChange),fontSize:11,fontWeight:600,padding:"2px 7px",borderRadius:100}}>{pct(h.pctChange)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==="transactions" && (
        <div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search transactions..." style={{padding:"7px 12px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",flex:1,minWidth:160,color:C.navy}}/>
            <select value={txFilter} onChange={e=>setTxFilter(e.target.value)} style={{padding:"7px 12px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",color:C.navy,background:C.white}}>
              <option value="all">All types</option>
              <option value="trade">Trades</option>
              <option value="cashflow">Cashflows</option>
              <option value="dividend">Dividends</option>
            </select>
            <div style={{fontSize:12,color:C.faint}}>{filteredTxns.length} records</div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:800}}>
              <thead>
                <tr style={{borderBottom:"1.5px solid "+C.silver,background:C.silver}}>
                  {["Date","Type","Ticker","Description","Account","CCY","Consideration","Net Amount"].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTxns.map(t=>(
                  <tr key={t.id} style={{borderBottom:"0.5px solid "+C.silver}}>
                    <td style={{padding:"8px 12px",color:C.faint,whiteSpace:"nowrap"}}>{t.tradedate}</td>
                    <td style={{padding:"8px 12px"}}><Badge color={t.txtype==="BUY"?"success":t.txtype==="SELL"?"error":t.txtype==="Dividend"?"navy":"info"}>{t.txtype}</Badge></td>
                    <td style={{padding:"8px 12px",fontWeight:600,color:C.navy}}>{t.ticker}</td>
                    <td style={{padding:"8px 12px",color:C.text,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td>
                    <td style={{padding:"8px 12px",color:C.faint,fontSize:11}}>{t.accountId}</td>
                    <td style={{padding:"8px 12px",color:C.faint}}>{t.ccy}</td>
                    <td style={{padding:"8px 12px",color:C.navy,fontFamily:"monospace"}}>{t.consideration.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    <td style={{padding:"8px 12px",color:posColor(t.clientnetamt),fontFamily:"monospace"}}>{t.clientnetamt >= 0 ? "+" : ""}{t.clientnetamt.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="withdrawals" && (
        <div>
          <div style={{marginBottom:16,fontSize:13,color:C.faint}}>Processed withdrawal payments for this client.</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{borderBottom:"1.5px solid "+C.silver,background:C.silver}}>
                {["Date Requested","Type","Currency","Requested Amount","Actual Paid","Payment Date"].map(h=>(
                  <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 ? (
                <tr><td colSpan={6} style={{padding:24,textAlign:"center",color:C.faint}}>No withdrawals recorded</td></tr>
              ) : withdrawals.map((w,i)=>(
                <tr key={i} style={{borderBottom:"0.5px solid "+C.silver}}>
                  <td style={{padding:"10px 12px",color:C.text}}>{w.dateRequested}</td>
                  <td style={{padding:"10px 12px"}}><Badge color="info">{w.type}</Badge></td>
                  <td style={{padding:"10px 12px",color:C.faint}}>{w.currency}</td>
                  <td style={{padding:"10px 12px",fontWeight:600,color:C.navy}}>${fmt(w.requestedAmount,2)}</td>
                  <td style={{padding:"10px 12px",fontWeight:600,color:C.green}}>${fmt(w.actualPaid,2)}</td>
                  <td style={{padding:"10px 12px",color:C.text}}>{w.paymentDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{marginTop:16,background:C.silver,borderRadius:8,padding:"12px 16px",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:13,fontWeight:600,color:C.navy}}>Total paid</span>
            <span style={{fontFamily:"Inter,sans-serif",fontSize:16,fontWeight:700,color:C.navy}}>${fmt(withdrawals.reduce((s,w)=>s+w.actualPaid,0),2)}</span>
          </div>
        </div>
      )}

      {tab==="distribution" && (
        <div>
          {distributions.length === 0 ? (
            <div style={{padding:32,textAlign:"center",color:C.faint}}>
              <div style={{fontSize:32,marginBottom:12}}>◇</div>
              <div style={{fontSize:14,fontWeight:600,color:C.navy,marginBottom:6}}>No distributions</div>
            </div>
          ) : distributions.map((dist,di)=>(
            <div key={di} style={{marginBottom:24}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontFamily:"Inter,sans-serif",fontSize:16,fontWeight:700,color:C.navy}}>{dist.name}</div>
                  <div style={{fontSize:12,color:C.faint}}>Date: {dist.date} · {dist.payments.length} payment{dist.payments.length!==1?"s":""}</div>
                </div>
                <div style={{fontFamily:"Inter,sans-serif",fontSize:20,fontWeight:700,color:C.navy}}>
                  ${fmt(dist.payments.reduce((s,p)=>s+p.amount,0),2)}
                </div>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{borderBottom:"1.5px solid "+C.silver,background:C.silver}}>
                    {["Account","Recipient","Date","Amount"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dist.payments.map((p,i)=>(
                    <tr key={i} style={{borderBottom:"0.5px solid "+C.silver}}>
                      <td style={{padding:"10px 12px",fontFamily:"monospace",fontSize:12,color:C.faint}}>{p.accountNumber}</td>
                      <td style={{padding:"10px 12px",color:C.text}}>{p.recipient}</td>
                      <td style={{padding:"10px 12px",color:C.text}}>{p.date}</td>
                      <td style={{padding:"10px 12px",fontWeight:600,color:C.navy,fontFamily:"Inter,sans-serif"}}>${fmt(p.amount,2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {tab==="documents" && (
        <DocumentsTab clientId={clientId} isAdviser={true} liveDocuments={resolvedDocuments}/>
      )}

      {tab==="crm" && (
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(2,1fr)",gap:20}}>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:20}}>
            <div style={{fontFamily:"Inter,sans-serif",fontSize:14,fontWeight:600,color:C.navy,marginBottom:14}}>Client Details</div>
            {[
              {label:"Full Name", value:client.name},
              {label:"Client ID", value:client.id},
              {label:"Primary Code", value:client.primaryCode},
              {label:"Client Reference", value:client.clientId},
              {label:"Account Number", value:client.accountNumber},
              {label:"Email", value:client.email},
              {label:"Address", value:client.address},
              {label:"Jurisdiction", value:client.jurisdiction},
              {label:"Reporting CCY", value:client.reportingCcy},
              {label:"Verified", value:client.verified?"Yes":"No"},
            ].map(row=>(
              <div key={row.label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"0.5px solid "+C.silver}}>
                <span style={{fontSize:12,color:C.faint}}>{row.label}</span>
                <span style={{fontSize:13,fontWeight:500,color:C.navy,textAlign:"right"}}>{row.value}</span>
              </div>
            ))}
          </div>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:20}}>
            <div style={{fontFamily:"Inter,sans-serif",fontSize:14,fontWeight:600,color:C.navy,marginBottom:14}}>Bank Details</div>
            {[
              {label:"Bank Name", value:client.bankName},
              {label:"Account Number", value:client.bankAccount},
              {label:"Sort Code", value:client.bankSort},
            ].map(row=>(
              <div key={row.label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"0.5px solid "+C.silver}}>
                <span style={{fontSize:12,color:C.faint}}>{row.label}</span>
                <span style={{fontSize:13,fontWeight:500,color:C.navy}}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- CLIENTS LIST ------------------------------------------------------------
const ClientsList = ({selectedClient, setSelectedClient, selectedCcy, setPreviewClient, clients: propClients, valuations: propValuations, holdings: propHoldings, withdrawals: propWithdrawals, distributions: propDistributions, txns: propTxns, liveDocuments}) => {
  const [search, setSearch] = useState("");
  const isMobile = useIsMobile();
  const sym = CCY_SYMBOLS[selectedCcy] || "$";
  const clients = propClients || [];
  const valuations = propValuations || {};

  if (selectedClient) {
    return <ClientDetail clientId={selectedClient} onBack={()=>setSelectedClient(null)} selectedCcy={selectedCcy} setPreviewClient={setPreviewClient} holdings={propHoldings} withdrawals={propWithdrawals} distributions={propDistributions} txns={propTxns} valuations={valuations} clients={clients} liveDocuments={liveDocuments}/>;
  }

  const filtered = clients.filter(c =>
    !search || [c.name, c.id, c.primaryCode, c.email].some(v => v && v.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{padding:isMobile?"12px":24}}>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:3,textTransform:"uppercase",color:C.teal,marginBottom:3}}>Client Management</div>
        <div style={{fontFamily:"Inter,sans-serif",fontSize:isMobile?20:24,fontWeight:600,color:C.navy}}>All Clients</div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:16}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, ID or email..." style={{padding:"8px 12px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",flex:1,color:C.navy}}/>
      </div>
      <div style={{fontSize:12,color:C.faint,marginBottom:12}}>{filtered.length} client{filtered.length!==1?"s":""} {clients.length > 1 ? "("+clients.length+" total)" : ""}</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr style={{borderBottom:"1.5px solid "+C.silver,background:C.silver}}>
              {["Client","ID","Jurisdiction","Reporting CCY","Asset Valuation","Cash","Liabilities","Status"].map(h=>(
                <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c=>{
              const val = valuations[c.id];
              return (
                <tr key={c.id} onClick={()=>setSelectedClient(c.id)} style={{borderBottom:"0.5px solid "+C.silver,cursor:"pointer",transition:"background 0.1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#F8FAFB"}
                  onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <td style={{padding:"12px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:32,height:32,borderRadius:"50%",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:11,fontWeight:700,flexShrink:0}}>
                        {c.name.split(" ").map(n=>n[0]).join("")}
                      </div>
                      <div>
                        <div style={{fontWeight:600,color:C.navy}}>{c.name}</div>
                        <div style={{fontSize:11,color:C.faint}}>{c.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{padding:"12px 12px",color:C.faint,fontSize:11,fontFamily:"monospace"}}>{c.primaryCode}</td>
                  <td style={{padding:"12px 12px",color:C.text}}>{c.jurisdiction}</td>
                  <td style={{padding:"12px 12px",color:C.text}}>{c.reportingCcy}</td>
                  <td style={{padding:"12px 12px",fontWeight:600,color:C.navy,fontFamily:"Inter,sans-serif"}}>{val?sym+fmt(convertAmount(val.totalAssetValuation,val.currency||"USD",selectedCcy),0):"--"}</td>
                  <td style={{padding:"12px 12px",color:C.green,fontWeight:600}}>{val?sym+fmt(convertAmount(val.totalCashBalance,val.currency||"USD",selectedCcy),0):"--"}</td>
                  <td style={{padding:"12px 12px",color:C.red,fontWeight:600}}>{val?sym+fmt(convertAmount(val.totalLiabilities,val.currency||"USD",selectedCcy),0):"--"}</td>
                  <td style={{padding:"12px 12px"}}><Badge color={c.verified?"success":"warning"}>{c.verified?"Verified":"Pending"}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- WITHDRAWALS PAGE --------------------------------------------------------
const WithdrawalsPage = ({selectedCcy, withdrawals: propWithdrawals, clients: propClients}) => {
  const sym = CCY_SYMBOLS[selectedCcy] || "$";
  const withdrawalsData = propWithdrawals || WITHDRAWALS;
  const clientsData = propClients || CLIENTS;
  const allWithdrawals = Object.entries(withdrawalsData).flatMap(([clientId, wds]) =>
    wds.map(w => ({ ...w, clientId, clientName: clientsData.find(c=>c.id===clientId)?.name || clientId }))
  );
  const total = allWithdrawals.reduce((s,w)=>s+convertAmount(w.actualPaid,w.currency||"USD",selectedCcy),0);

  return (
    <div style={{padding:24}}>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:3,textTransform:"uppercase",color:C.teal,marginBottom:3}}>Processed Withdrawals</div>
        <div style={{fontFamily:"Inter,sans-serif",fontSize:24,fontWeight:600,color:C.navy}}>Withdrawal History</div>
      </div>
      <div style={{background:C.navy,borderRadius:10,padding:"16px 20px",marginBottom:20,display:"inline-block"}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:4}}>Total Paid Out</div>
        <div style={{fontFamily:"Inter,sans-serif",fontSize:28,fontWeight:700,color:C.white}}>{sym}{fmt(total,2)}</div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr style={{borderBottom:"1.5px solid "+C.silver,background:C.silver}}>
              {["Client","Date Requested","Type","Currency","Requested","Actual Paid","Payment Date"].map(h=>(
                <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allWithdrawals.map((w,i)=>(
              <tr key={i} style={{borderBottom:"0.5px solid "+C.silver}}>
                <td style={{padding:"10px 12px",fontWeight:600,color:C.navy}}>{w.clientName}</td>
                <td style={{padding:"10px 12px",color:C.text}}>{w.dateRequested}</td>
                <td style={{padding:"10px 12px"}}><Badge color="info">{w.type}</Badge></td>
                <td style={{padding:"10px 12px",color:C.faint}}>{w.currency}</td>
                <td style={{padding:"10px 12px",color:C.navy}}>${fmt(w.requestedAmount,2)}</td>
                <td style={{padding:"10px 12px",fontWeight:600,color:C.green}}>${fmt(w.actualPaid,2)}</td>
                <td style={{padding:"10px 12px",color:C.text}}>{w.paymentDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- CONNECT PAGE ------------------------------------------------------------
const Connect = () => {
  const [connected, setConnected] = useState(["onedrive"]);
  const apps = [
    {id:"onedrive", name:"OneDrive / Excel", category:"Data Sources", desc:"Client data, holdings, valuations and distributions from Excel files on OneDrive.", icon:"X"},
    {id:"sharepoint", name:"SharePoint", category:"Data Sources", desc:"Import and sync data from SharePoint lists and libraries.", icon:"S"},
    {id:"bloomberg", name:"Bloomberg", category:"Market Data", desc:"Real-time prices, news and FX rates.", icon:"B"},
    {id:"refinitiv", name:"Refinitiv Eikon", category:"Market Data", desc:"Financial data, news and analytics.", icon:"R"},
    {id:"docusign", name:"DocuSign", category:"Documents", desc:"Electronic signatures and document workflow.", icon:"D"},
    {id:"sendgrid", name:"SendGrid", category:"Email", desc:"Bulk and transactional email for client communications.", icon:"@"},
  ];
  const cats = [...new Set(apps.map(a=>a.category))];
  return (
    <div style={{padding:24}}>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>Integrations</div>
        <div style={{fontFamily:"Inter,sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>Connect external apps</div>
      </div>
      {connected.includes("onedrive") && (
        <div style={{background:C.tealLight,borderRadius:10,padding:"12px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:C.teal,flexShrink:0}}/>
          <span style={{fontSize:13,color:C.teal,fontWeight:600}}>OneDrive connected</span>
          <span style={{fontSize:13,color:C.text}}> — client data synced from Excel files.</span>
        </div>
      )}
      {cats.map(cat=>(
        <div key={cat} style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>{cat}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
            {apps.filter(a=>a.category===cat).map(app=>{
              const isConn = connected.includes(app.id);
              return (
                <div key={app.id} style={{background:C.white,border:"0.5px solid "+(isConn?C.teal:C.silver),borderRadius:10,padding:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9}}>
                    <div style={{display:"flex",gap:9,alignItems:"center"}}>
                      <div style={{width:32,height:32,borderRadius:8,background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:13,fontWeight:700}}>{app.icon}</div>
                      <div style={{fontFamily:"Inter,sans-serif",fontSize:13,fontWeight:600,color:C.navy}}>{app.name}</div>
                    </div>
                    {isConn && <Badge color="success">Live</Badge>}
                  </div>
                  <div style={{fontSize:12,color:C.faint,marginBottom:12}}>{app.desc}</div>
                  <Btn variant={isConn?"secondary":"primary"} small onClick={()=>setConnected(p=>isConn?p.filter(x=>x!==app.id):[...p,app.id])}>
                    {isConn?"Disconnect":"Connect"}
                  </Btn>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// --- LOGIN -------------------------------------------------------------------
const LoginScreen = ({onLogin, loading, error}) => (
  <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{background:C.navyMid,borderRadius:16,padding:40,width:380,maxWidth:"100%",textAlign:"center",border:"0.5px solid rgba(0,184,176,0.2)"}}>
      <img src="/ubiquity-mark.png" alt="Ubiquity" style={{height:72,width:"auto",marginBottom:16,filter:"brightness(0) invert(1)"}}/>
      <div style={{fontFamily:"Inter,sans-serif",fontSize:24,fontWeight:700,color:C.white,marginBottom:8,letterSpacing:-0.5}}>Ubiquity</div>
      <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:32}}>Connected insight. Unified oversight.</div>
      {error && <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#FCA5A5"}}>{error}</div>}
      <button onClick={onLogin} disabled={loading} style={{width:"100%",background:C.teal,color:C.white,border:"none",borderRadius:8,padding:"13px 20px",fontSize:15,fontWeight:600,cursor:loading?"not-allowed":"pointer",fontFamily:"Inter,sans-serif",opacity:loading?0.7:1}}>
        {loading?"Signing in...":"Sign in"}
      </button>
      <div style={{marginTop:16,fontSize:11,color:"rgba(255,255,255,0.25)"}}>Ubiquity · A product by i-Convergence · Secured by Auth0</div>
    </div>
  </div>
);



// --- DOCUMENTS TAB ----------------------------------------------------------
const DocumentsTab = ({clientId, isAdviser, liveDocuments}) => {
  const [catFilter, setCatFilter] = useState("All");
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadCat, setUploadCat] = useState("Statement");
  const [extraDocs, setExtraDocs] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const fileRef = React.useRef(null);

  // Combine live zip with any static/uploaded docs
  const liveZip = liveDocuments && liveDocuments[clientId];
  const baseDocs = DOCUMENTS[clientId] || [];
  const allDocs = [
    ...(liveZip ? [{ id:"live-zip", name: liveZip.name, category:"Documents", date: liveZip.modified, size: liveZip.size, uploadedBy:"OneDrive", downloadUrl: liveZip.downloadUrl, isLive: true }] : []),
    ...baseDocs,
    ...extraDocs,
  ];
  const filtered = catFilter === "All" ? allDocs : allDocs.filter(d => d.category === catFilter);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadName(file.name);
  };

  const handleSubmit = () => {
    if (!uploadName) return;
    const newDoc = {
      id: "d" + Date.now(),
      name: uploadName,
      category: uploadCat,
      date: new Date().toISOString().slice(0,10),
      size: "—",
      uploadedBy: "Adviser",
    };
    setExtraDocs(prev => [newDoc, ...prev]);
    setUploadName("");
    setShowUpload(false);
    setUploading(false);
  };

  const catColor = (cat) => {
    const map = { Valuation:"info", Distribution:"success", Statement:"navy", Agreement:"warning", Withdrawal:"error" };
    return map[cat] || "info";
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {DOC_CATEGORIES.map(cat=>(
            <button key={cat} onClick={()=>setCatFilter(cat)}
              style={{background:catFilter===cat?C.navy:C.white,color:catFilter===cat?C.white:C.faint,border:"0.5px solid "+(catFilter===cat?C.navy:C.silver),borderRadius:100,padding:"4px 12px",fontSize:12,fontWeight:catFilter===cat?600:400,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
              {cat}
            </button>
          ))}
        </div>
        {isAdviser && (
          <button onClick={()=>setShowUpload(true)}
            style={{background:C.teal,color:C.white,border:"none",borderRadius:6,padding:"7px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",gap:6}}>
            + Upload Document
          </button>
        )}
      </div>

      {showUpload && isAdviser && (
        <div style={{background:C.tealLight,border:"1px solid "+C.teal,borderRadius:10,padding:18,marginBottom:16}}>
          <div style={{fontFamily:"Inter,sans-serif",fontSize:14,fontWeight:600,color:C.navy,marginBottom:12}}>Upload Document</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:11,fontWeight:600,color:C.faint,marginBottom:4}}>FILE</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={handleUpload} style={{display:"none"}}/>
                <button onClick={()=>fileRef.current.click()} style={{background:C.white,border:"1.5px solid "+C.silverMid,borderRadius:6,padding:"7px 14px",fontSize:12,cursor:"pointer",fontFamily:"'Inter',sans-serif",color:C.navy}}>
                  Choose file
                </button>
                <span style={{fontSize:12,color:C.text}}>{uploadName || "No file chosen"}</span>
              </div>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:C.faint,marginBottom:4}}>CATEGORY</div>
              <select value={uploadCat} onChange={e=>setUploadCat(e.target.value)}
                style={{padding:"7px 12px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",color:C.navy,background:C.white}}>
                {DOC_CATEGORIES.filter(c=>c!=="All").map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleSubmit} disabled={!uploadName}
                style={{background:uploadName?C.teal:"#ccc",color:C.white,border:"none",borderRadius:6,padding:"7px 16px",fontSize:12,fontWeight:600,cursor:uploadName?"pointer":"not-allowed",fontFamily:"'Inter',sans-serif"}}>
                Upload
              </button>
              <button onClick={()=>{setShowUpload(false);setUploadName("");}}
                style={{background:"transparent",color:C.faint,border:"1px solid "+C.silver,borderRadius:6,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{fontSize:12,color:C.faint,marginBottom:10}}>{filtered.length} document{filtered.length!==1?"s":""}</div>

      {filtered.length === 0 ? (
        <div style={{padding:32,textAlign:"center",color:C.faint}}>
          <div style={{fontSize:32,marginBottom:12}}>◇</div>
          <div style={{fontSize:14,fontWeight:600,color:C.navy}}>No documents in this category</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(doc=>(
            <div key={doc.id} style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0}}>
                <div style={{width:36,height:36,borderRadius:8,background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{color:C.teal,fontSize:12,fontWeight:700}}>PDF</span>
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.navy,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.name}</div>
                  <div style={{fontSize:11,color:C.faint,marginTop:2}}>{doc.date} · {doc.size} · {doc.uploadedBy}</div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                <Badge color={catColor(doc.category)}>{doc.category}</Badge>
                <button
                  onClick={()=>{
                    if (doc.downloadUrl) {
                      const a = document.createElement("a");
                      a.href=doc.downloadUrl; a.download=doc.name; a.click();
                    } else {
                      const blob = new Blob(["Document: "+doc.name], {type:"application/octet-stream"});
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href=url; a.download=doc.name; a.click();
                      URL.revokeObjectURL(url);
                    }
                  }}
                  style={{background:C.teal,color:C.white,border:"none",borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Inter',sans-serif",whiteSpace:"nowrap"}}>
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdviser && allDocs.length > 0 && (
        <div style={{marginTop:16,padding:"12px 16px",background:C.silver,borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:C.faint}}>{allDocs.length} document{allDocs.length!==1?"s":""} in vault</span>
          <button
            onClick={()=>{
              const content = allDocs.map(d=>d.name).join("\n");
              const blob = new Blob([content], {type:"text/plain"});
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href=url; a.download="documents_"+clientId+".zip"; a.click();
              URL.revokeObjectURL(url);
            }}
            style={{background:C.navy,color:C.white,border:"none",borderRadius:6,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
            Download all as ZIP
          </button>
        </div>
      )}
    </div>
  );
};

// --- CLIENT PORTAL ----------------------------------------------------------
const ClientPortal = ({user, logout, selectedCcy, setCcy, isPreview, holdings: propHoldings, valuations: propValuations, withdrawals: propWithdrawals, distributions: propDistributions, txns: propTxns, liveDocuments, clients: propClients}) => {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("valuation");
  const [search, setSearch] = useState("");
  const [txFilter, setTxFilter] = useState("all");
  const sym = CCY_SYMBOLS[selectedCcy] || "$";

  // Find client by Auth0 clientId claim or default to first client for demo
  const clientsSourceP0 = propClients || CLIENTS;
  const clientId0 = (clientsSourceP0.find(c => c.id === user?.clientId) || clientsSourceP0[0])?.id;
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  useEffect(() => {
    if (!clientId0) return;
    setDetailLoading(true); setDetailData(null);
    fetch("/api/clientdetail?clientId="+clientId0).then(r=>r.json()).then(d=>{ if(!d.error) setDetailData(d); }).catch(()=>{}).finally(()=>setDetailLoading(false));
  }, [clientId0]);
  const clientsSourceP = propClients || CLIENTS;
  const client = clientsSourceP.find(c => c.id === user?.clientId) || clientsSourceP[0];
  const clientId = client?.id;
  const val = (propValuations || VALUATIONS)[clientId];
  const holdings = (detailData&&detailData.holdings) ? detailData.holdings[clientId]||[] : (propHoldings||HOLDINGS)[clientId]||[];
  const withdrawals = (detailData&&detailData.withdrawals) ? detailData.withdrawals[clientId]||[] : (propWithdrawals||WITHDRAWALS)[clientId]||[];
  const distributions = (detailData&&detailData.distributions) ? detailData.distributions[clientId]||[] : (propDistributions||DISTRIBUTIONS)[clientId]||[];
  const allTxns = (detailData&&detailData.txns&&detailData.txns.length>0) ? detailData.txns : (propTxns||TXNS);
  const txns = allTxns.filter(t => t.clientId === clientId);
  const resolvedDocuments = (detailData&&detailData.documents) ? detailData.documents : (liveDocuments||{});

  const filteredTxns = useMemo(() => {
    let d = txns;
    if (txFilter !== "all") d = d.filter(t => t.selector.toLowerCase() === txFilter || t.txtype.toLowerCase() === txFilter);
    if (search) d = d.filter(t => [t.description, t.ticker, t.txtype].some(v => v && v.toLowerCase().includes(search.toLowerCase())));
    return d;
  }, [txns, txFilter, search]);

  if (!client) return <div style={{padding:24,color:C.faint}}>No client account found.</div>;

  const tabs = [["valuation","Valuation"],["holdings","Holdings"],["transactions","Transactions"],["withdrawals","Withdrawals"],["distribution","Distribution"],["documents","Documents"]];

  return (
    <div style={{fontFamily:"'Inter',sans-serif",background:"#EFF7FB",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      {/* Client Nav */}
      <div style={{background:C.navy,display:"flex",alignItems:"center",padding:"0 16px",height:54,position:"sticky",top:0,zIndex:200,borderBottom:"1px solid rgba(0,184,176,0.15)"}}>
        <div onClick={()=>setTab("valuation")} style={{fontFamily:"Inter,sans-serif",fontSize:isMobile?16:20,fontWeight:700,color:C.white,marginRight:"auto",cursor:"pointer",letterSpacing:-0.5,display:"flex",alignItems:"center",gap:8}}>
          <img src="/ubiquity-mark.png" alt="Ubiquity" style={{height:26,width:"auto"}}/>
          <span>Ubiquity</span>
        </div>
        <CCYSelector selectedCcy={selectedCcy} onChange={setCcy}/>
        <div style={{width:32,height:32,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:12,fontWeight:600,marginLeft:12,cursor:"pointer"}} title={user?.email}>
          {client.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
        </div>
        <button onClick={logout} style={{background:isPreview?"rgba(0,184,176,0.2)":"rgba(255,255,255,0.08)",border:"1px solid "+(isPreview?"rgba(0,184,176,0.5)":"rgba(255,255,255,0.15)"),color:isPreview?C.teal:"rgba(255,255,255,0.6)",borderRadius:6,padding:"4px 10px",fontSize:isMobile?10:11,cursor:"pointer",fontFamily:"'Inter',sans-serif",marginLeft:isMobile?6:10}}>{isPreview?"Exit client view":"Sign out"}</button>
      </div>

      <div style={{flex:1,padding:isMobile?"12px":24}}>
        {/* Client Header */}
        <div style={{background:C.navy,borderRadius:12,padding:isMobile?"14px":20,marginBottom:18,display:"flex",flexWrap:"wrap",gap:16,justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:48,height:48,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:16,fontWeight:700,flexShrink:0}}>
              {client.name.split(" ").map(n=>n[0]).join("")}
            </div>
            <div>
              <div style={{fontFamily:"Inter,sans-serif",fontSize:isMobile?18:22,fontWeight:700,color:C.white}}>{client.name}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>{client.primaryCode} · {client.reportingCcy} · {client.jurisdiction}</div>
            </div>
          </div>
          {val && (
            <div style={{display:"flex",gap:isMobile?12:20,flexWrap:"wrap"}}>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)"}}>Portfolio Value</div>
                <div style={{fontFamily:"Inter,sans-serif",fontSize:isMobile?18:22,fontWeight:700,color:C.white}}>{sym}{fmt(convertAmount(val.totalAssetValuation, client.reportingCcy||"USD", selectedCcy),0)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)"}}>Cash</div>
                <div style={{fontFamily:"Inter,sans-serif",fontSize:isMobile?18:22,fontWeight:700,color:C.teal}}>{sym}{fmt(convertAmount(val.totalCashBalance, client.reportingCcy||"USD", selectedCcy),0)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Summary cards */}
        {val && (
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:18}}>
            {[
              {label:"Total Valuation", value:sym+fmt(convertAmount(val.totalValuationNotice,client.reportingCcy||"USD",selectedCcy),0), color:C.navy},
              {label:"Asset Value", value:sym+fmt(convertAmount(val.totalAssetValuation, client.reportingCcy||"USD", selectedCcy),0), color:C.navy},
              {label:"Cash Balance", value:sym+fmt(convertAmount(val.totalCashBalance, client.reportingCcy||"USD", selectedCcy),0), color:C.green},
              {label:"Liabilities", value:sym+fmt(convertAmount(val.totalLiabilities,client.reportingCcy||"USD",selectedCcy),0), color:C.red},
            ].map(card=>(
              <div key={card.label} style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.faint,marginBottom:6}}>{card.label}</div>
                <div style={{fontFamily:"Inter,sans-serif",fontSize:18,fontWeight:700,color:card.color}}>{card.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{borderBottom:"1.5px solid "+C.silver,marginBottom:20,display:"flex",overflowX:"auto",gap:0}}>
          {tabs.map(([t,label])=>(
            <button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",borderBottom:tab===t?"2px solid "+C.teal:"2px solid transparent",color:tab===t?C.teal:C.faint,fontSize:13,fontWeight:tab===t?600:400,cursor:"pointer",padding:"9px 16px",marginBottom:-1,whiteSpace:"nowrap",fontFamily:"'Inter',sans-serif"}}>
              {label}
            </button>
          ))}
        </div>

        {/* Valuation Tab */}
        {tab==="valuation" && val && (
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(2,1fr)",gap:12}}>
            {[
              {label:"Total Valuation Notice", value:sym+fmt(convertAmount(val.totalValuationNotice,client.reportingCcy||"USD",selectedCcy),2)},
              {label:"Total Brite Assets", value:sym+fmt(convertAmount(val.totalBriteAssets,client.reportingCcy||"USD",selectedCcy),2)},
              {label:"Total Asset Valuation", value:sym+fmt(convertAmount(val.totalAssetValuation, client.reportingCcy||"USD", selectedCcy),2)},
              {label:"Total Cash Balance", value:sym+fmt(convertAmount(val.totalCashBalance, client.reportingCcy||"USD", selectedCcy),2)},
              {label:"Pension Valuation", value:sym+fmt(convertAmount(val.pensionValuation,client.reportingCcy||"USD",selectedCcy),2)},
              {label:"Pension Cash Balance", value:sym+fmt(convertAmount(val.pensionCash,client.reportingCcy||"USD",selectedCcy),2)},
              {label:"Direct Investment Cash", value:sym+fmt(convertAmount(val.directInvestmentCash,client.reportingCcy||"USD",selectedCcy),2)},
              {label:"Direct Investment Assets", value:sym+fmt(convertAmount(val.directInvestmentAssets,client.reportingCcy||"USD",selectedCcy),2)},
              {label:"Total Liabilities", value:sym+fmt(convertAmount(val.totalLiabilities,client.reportingCcy||"USD",selectedCcy),2), red:true},
              {label:"Surrender Rebate Payable", value:sym+fmt(convertAmount(val.surrenderRebatePayable,client.reportingCcy||"USD",selectedCcy),2), red:true},
            ].map(row=>(
              <div key={row.label} style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:13,color:C.faint}}>{row.label}</div>
                <div style={{fontFamily:"Inter,sans-serif",fontSize:16,fontWeight:600,color:row.red?C.red:C.navy}}>{row.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Holdings Tab */}
        {tab==="holdings" && (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:isMobile?700:820}}>
              <thead>
                <tr style={{borderBottom:"1.5px solid "+C.silver,background:C.silver}}>
                  {["Holding","Account","Shares","Purchase Price","CCY","Market Value","CCY","Gain / Loss","CCY","% Change"].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdings.map((h,i)=>(
                  <tr key={i} style={{borderBottom:"0.5px solid "+C.silver,background:i%2===0?C.white:"#FAFBFC"}}>
                    <td style={{padding:"10px 12px",fontWeight:600,color:C.navy}}>{h.name}</td>
                    <td style={{padding:"10px 12px",color:C.faint,fontSize:11}}>{h.account}</td>
                    <td style={{padding:"10px 12px",color:C.text}}>{h.shares.toLocaleString()}</td>
                    <td style={{padding:"10px 12px",color:C.text}}>{h.purchasePrice}</td>
                    <td style={{padding:"10px 12px",color:C.faint,fontSize:11}}>{h.purchasePriceCcy||""}</td>
                    <td style={{padding:"10px 12px",fontWeight:600,color:C.navy}}>{h.marketValue}</td>
                    <td style={{padding:"10px 12px",color:C.faint,fontSize:11}}>{h.marketValueCcy||""}</td>
                    <td style={{padding:"10px 12px",color:posColor(h.pctChange)}}>{h.gainLoss}</td>
                    <td style={{padding:"10px 12px",color:C.faint,fontSize:11}}>{h.gainLossCcy||""}</td>
                    <td style={{padding:"10px 12px"}}>
                      <span style={{background:posBg(h.pctChange),color:posColor(h.pctChange),fontSize:11,fontWeight:600,padding:"2px 7px",borderRadius:100}}>{pct(h.pctChange)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Transactions Tab */}
        {tab==="transactions" && (
          <div>
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search transactions..." style={{padding:"7px 12px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",flex:1,minWidth:160,color:C.navy}}/>
              <select value={txFilter} onChange={e=>setTxFilter(e.target.value)} style={{padding:"7px 12px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",color:C.navy,background:C.white}}>
                <option value="all">All types</option>
                <option value="trade">Trades</option>
                <option value="cashflow">Cashflows</option>
                <option value="dividend">Dividends</option>
              </select>
              <div style={{fontSize:12,color:C.faint}}>{filteredTxns.length} records</div>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:700}}>
                <thead>
                  <tr style={{borderBottom:"1.5px solid "+C.silver,background:C.silver}}>
                    {["Date","Type","Ticker","Description","CCY","Consideration","Net Amount"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.map(t=>(
                    <tr key={t.id} style={{borderBottom:"0.5px solid "+C.silver}}>
                      <td style={{padding:"8px 12px",color:C.faint,whiteSpace:"nowrap"}}>{t.tradedate}</td>
                      <td style={{padding:"8px 12px"}}><Badge color={t.txtype==="BUY"?"success":t.txtype==="SELL"?"error":t.txtype==="Dividend"?"navy":"info"}>{t.txtype}</Badge></td>
                      <td style={{padding:"8px 12px",fontWeight:600,color:C.navy}}>{t.ticker}</td>
                      <td style={{padding:"8px 12px",color:C.text,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td>
                      <td style={{padding:"8px 12px",color:C.faint}}>{t.ccy}</td>
                      <td style={{padding:"8px 12px",color:C.navy,fontFamily:"monospace"}}>{t.consideration.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                      <td style={{padding:"8px 12px",color:posColor(t.clientnetamt),fontFamily:"monospace"}}>{t.clientnetamt>=0?"+":""}{t.clientnetamt.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Withdrawals Tab */}
        {tab==="withdrawals" && (
          <div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{borderBottom:"1.5px solid "+C.silver,background:C.silver}}>
                  {["Date Requested","Type","Currency","Requested Amount","Actual Paid","Payment Date"].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {withdrawals.length===0?(
                  <tr><td colSpan={6} style={{padding:24,textAlign:"center",color:C.faint}}>No withdrawals recorded</td></tr>
                ):withdrawals.map((w,i)=>(
                  <tr key={i} style={{borderBottom:"0.5px solid "+C.silver}}>
                    <td style={{padding:"10px 12px",color:C.text}}>{w.dateRequested}</td>
                    <td style={{padding:"10px 12px"}}><Badge color="info">{w.type}</Badge></td>
                    <td style={{padding:"10px 12px",color:C.faint}}>{w.currency}</td>
                    <td style={{padding:"10px 12px",fontWeight:600,color:C.navy}}>${fmt(w.requestedAmount,2)}</td>
                    <td style={{padding:"10px 12px",fontWeight:600,color:C.green}}>${fmt(w.actualPaid,2)}</td>
                    <td style={{padding:"10px 12px",color:C.text}}>{w.paymentDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {withdrawals.length>0&&(
              <div style={{marginTop:14,background:C.silver,borderRadius:8,padding:"12px 16px",display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:13,fontWeight:600,color:C.navy}}>Total paid</span>
                <span style={{fontFamily:"Inter,sans-serif",fontSize:16,fontWeight:700,color:C.navy}}>${fmt(withdrawals.reduce((s,w)=>s+w.actualPaid,0),2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Distribution Tab */}
        {tab==="distribution" && (
          <div>
            {distributions.length===0?(
              <div style={{padding:32,textAlign:"center",color:C.faint}}>
                <div style={{fontSize:32,marginBottom:12}}>◇</div>
                <div style={{fontSize:14,fontWeight:600,color:C.navy}}>No distributions</div>
              </div>
            ):distributions.map((dist,di)=>(
              <div key={di} style={{marginBottom:24,background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,padding:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontFamily:"Inter,sans-serif",fontSize:16,fontWeight:700,color:C.navy}}>{dist.name}</div>
                    <div style={{fontSize:12,color:C.faint}}>Date: {dist.date} · {dist.payments.length} payment{dist.payments.length!==1?"s":""}</div>
                  </div>
                  <div style={{fontFamily:"Inter,sans-serif",fontSize:22,fontWeight:700,color:C.navy}}>
                    ${fmt(dist.payments.reduce((s,p)=>s+p.amount,0),2)}
                  </div>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{borderBottom:"1.5px solid "+C.silver}}>
                      {["Account","Recipient","Date","Amount"].map(h=>(
                        <th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dist.payments.map((p,i)=>(
                      <tr key={i} style={{borderBottom:"0.5px solid "+C.silver}}>
                        <td style={{padding:"10px 10px",fontFamily:"monospace",fontSize:12,color:C.faint}}>{p.accountNumber}</td>
                        <td style={{padding:"10px 10px",color:C.text}}>{p.recipient}</td>
                        <td style={{padding:"10px 10px",color:C.text}}>{p.date}</td>
                        <td style={{padding:"10px 10px",fontWeight:600,color:C.navy,fontFamily:"Inter,sans-serif"}}>${fmt(p.amount,2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- APP ---------------------------------------------------------------------
export default function App() {
  const {user, loading: authLoading, error: authError, login, logout} = useAuth();
  const {data: liveData, loading: dataLoading, error: dataError, lastUpdated, refresh} = useOneDriveData();
  const {stats: dashboardStats, refresh: refreshStats} = useDashboardStats();
  const [section, setSection] = useState("dashboard");
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedCcy, setSelectedCcy] = useState("USD");
  const [previewClient, setPreviewClient] = useState(null);
  const isMobile = useIsMobile();

  // Use live data if available, fall back to static
  const clients = (liveData && liveData.clients && liveData.clients.length > 0) ? liveData.clients : CLIENTS;
  const valuations = (liveData && liveData.valuations) ? liveData.valuations : VALUATIONS;
  const holdings = (liveData && liveData.holdings) ? liveData.holdings : HOLDINGS;
  const withdrawals = (liveData && liveData.withdrawals) ? liveData.withdrawals : WITHDRAWALS;
  const distributions = (liveData && liveData.distributions) ? liveData.distributions : DISTRIBUTIONS;
  const txns = (liveData && liveData.txns && liveData.txns.length > 0) ? liveData.txns : TXNS;
  const liveDocuments = (liveData && liveData.documents) ? liveData.documents : {};
  const loading = authLoading;
  const error = authError;

  useEffect(()=>{
    const style = document.createElement("style");
    style.innerHTML = `*{box-sizing:border-box;}body{overflow-x:hidden;margin:0;padding:0;}@keyframes spin{to{transform:rotate(360deg)}}`;
    style.id = "mn-global";
    if (!document.getElementById("mn-global")) document.head.appendChild(style);
    return () => { const el = document.getElementById("mn-global"); if(el) el.remove(); };
  }, []);

  const handleSection = (s) => { setSection(s); if(s !== "clients") setSelectedClient(null); };

  if (loading || dataLoading) return (
    <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,justifyContent:"center",marginBottom:20}}>
          <img src="/ubiquity-mark.png" alt="Ubiquity" style={{height:48,width:"auto",opacity:0.9}}/>
          <span style={{fontFamily:"Inter,sans-serif",fontSize:28,fontWeight:700,color:C.white,letterSpacing:-0.5}}>Ubiquity</span>
        </div>
        <div style={{width:32,height:32,border:"3px solid rgba(0,184,176,0.3)",borderTop:"3px solid "+C.teal,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto"}}/>
      </div>
    </div>
  );

  if (!user) return <LoginScreen onLogin={login} loading={loading} error={error}/>;

  // Adviser previewing client view
  if (previewClient) return <ClientPortal user={{...user, clientId: previewClient}} logout={()=>setPreviewClient(null)} selectedCcy={selectedCcy} setCcy={setSelectedCcy} isPreview={true} holdings={holdings} valuations={valuations} withdrawals={withdrawals} distributions={distributions} txns={txns} liveDocuments={liveDocuments} clients={clients}/>;

  // Client role - show client portal only
  if (user.isClient && !user.isAdviser) return <ClientPortal user={user} logout={logout} selectedCcy={selectedCcy} setCcy={setSelectedCcy} holdings={holdings} valuations={valuations} withdrawals={withdrawals} distributions={distributions} txns={txns} liveDocuments={liveDocuments} clients={clients}/>;

  return (
    <div style={{fontFamily:"'Inter',sans-serif",background:"#EFF7FB",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <Nav section={section} setSection={handleSection} selectedCcy={selectedCcy} setCcy={setSelectedCcy} user={user} logout={logout}/>
      <div style={{flex:1,overflowY:"auto",paddingBottom:isMobile?68:0}}>
        {section==="dashboard" && <Dashboard setSection={handleSection} setSelectedClient={setSelectedClient} selectedCcy={selectedCcy} clients={clients} valuations={valuations} lastUpdated={lastUpdated} dataError={dataError} onRefresh={()=>{refresh();refreshStats();}} dashboardStats={dashboardStats}/>}
        {section==="clients" && <ClientsList selectedClient={selectedClient} setSelectedClient={setSelectedClient} selectedCcy={selectedCcy} setPreviewClient={setPreviewClient} clients={clients} valuations={valuations} holdings={holdings} withdrawals={withdrawals} distributions={distributions} txns={txns} liveDocuments={liveDocuments}/>}
        {section==="withdrawals" && <WithdrawalsPage selectedCcy={selectedCcy} withdrawals={withdrawals} clients={clients}/>}
        {section==="connect" && <Connect/>}
      </div>
    </div>
  );
}
