import React, { useState, useMemo, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, AreaChart, Area } from "recharts";
import { RAW_TXNS } from "./data.js";

// --- AUTH0 CONFIG ------------------------------------------------------------
const AUTH0_DOMAIN = "iconvergence.uk.auth0.com";
const AUTH0_CLIENT_ID = "jWc8OqcK0Vw77Z1sIYQOr7BNviukmrbp";
const AUTH0_REDIRECT_URI = typeof window !== "undefined" ? window.location.origin : "";
const AUTH0_AUDIENCE = "https://"+AUTH0_DOMAIN+"/api/v2/";

// --- SIMPLE AUTH0 HOOK (no SDK dependency) -----------------------------------
// Uses Auth0 Universal Login + PKCE flow - no SDK needed
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

  // Get stored tokens
  const getStoredAuth = () => {
    try {
      const stored = sessionStorage.getItem("iconv_auth");
      return stored ? JSON.parse(stored) : null;
    } catch(e) { return null; }
  };

  const decodeJWT = (token) => {
    try {
      const base64 = token.split(".")[1].split("-").join("+").split("_").join("/");
      const decoded = JSON.parse(atob(base64));
      return decoded;
    } catch(e) { return null; }
  };

  const getUserFromToken = (idToken, accessToken) => {
    const decoded = decodeJWT(idToken);
    if (!decoded) return null;
    // Extract roles from Auth0 namespace claim
    const roles = decoded["https://iconvergence.co.uk/roles"] || 
                  decoded["https://iconvergence.uk.auth0.com/roles"] || [];
    // Extract client_id from app_metadata
    const clientId = decoded["https://iconvergence.co.uk/client_id"] ||
                     decoded["https://iconvergence.uk.auth0.com/client_id"] || null;
    return {
      sub: decoded.sub,
      email: decoded.email,
      name: decoded.name || decoded.email,
      picture: decoded.picture,
      roles,
      clientId,
      isAdviser: roles.includes("adviser") || roles.length === 0, // default to adviser if no role set
      isClient: roles.includes("client"),
      idToken,
      accessToken,
    };
  };

  // Handle Auth0 callback (code exchange)
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: AUTH0_CLIENT_ID,
          code_verifier: verifier,
          code,
          redirect_uri: AUTH0_REDIRECT_URI,
        }),
      });

      const tokens = await response.json();
      if (tokens.error) { setError(tokens.error_description); return false; }

      const authData = {
        idToken: tokens.id_token,
        accessToken: tokens.access_token,
        expiresAt: Date.now() + (tokens.expires_in * 1000),
      };
      sessionStorage.setItem("iconv_auth", JSON.stringify(authData));
      sessionStorage.removeItem("auth0_state");
      sessionStorage.removeItem("auth0_verifier");

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return authData;
    } catch(e) { setError("Login failed: "+e.message); return false; }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      // Check if returning from Auth0
      if (window.location.search.includes("code=")) {
        const authData = await handleCallback();
        if (authData) {
          const u = getUserFromToken(authData.idToken, authData.accessToken);
          setUser(u);
        }
      } else {
        // Check stored session
        const stored = getStoredAuth();
        if (stored && stored.expiresAt > Date.now()) {
          const u = getUserFromToken(stored.idToken, stored.accessToken);
          setUser(u);
        }
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

    const params = new URLSearchParams({
      response_type: "code",
      client_id: AUTH0_CLIENT_ID,
      redirect_uri: AUTH0_REDIRECT_URI,
      scope: "openid profile email",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      // Force MFA
      acr_values: "http://schemas.openid.net/pape/policies/2007/06/multi-factor",
    });

    window.location.href = "https://"+AUTH0_DOMAIN+"/authorize?"+params.toString();
  };

  const logout = () => {
    sessionStorage.removeItem("iconv_auth");
    setUser(null);
    window.location.href = "https://"+AUTH0_DOMAIN+"/v2/logout?client_id="+AUTH0_CLIENT_ID+"&returnTo="+encodeURIComponent(AUTH0_REDIRECT_URI);
  };

  return { user, loading, error, login, logout };
};


// --- MOBILE HOOK -------------------------------------------------
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
};



// --- i-CONVERGENCE BRAND -------------------------------------------
const C = {
  navy: "#0D1B2E", navyMid: "#162840", navyLight: "#1E3A5F",
  teal: "#00B8B0", tealLight: "#E6F9F8", tealMid: "#009990",
  gold: "#F5A623", goldLight: "#FEF5E7",
  silver: "#EFF2F6", silverMid: "#C4CDD8",
  white: "#FFFFFF", text: "#2D3748", faint: "#8A9AB0",
  green: "#10B981", greenBg: "#D1FAE5",
  red: "#EF4444", redBg: "#FEE2E2",
  amber: "#F59E0B", amberBg: "#FEF3C7",
};

// --- FX RATES (from Price File + CNY) -------------------------------
const FX = {
  GBPUSD: 1.2618, GBPEUR: 1.16027586, GBPCNY: 11.47,
  USDGBP: 0.79251862, USDEUR: 0.91954023, USDCNY: 7.24,
  EURGBP: 0.861864, EURUSD: 1.0875, EURCNY: 7.91,
  CNYGBP: 0.08726, CNYUSD: 0.1381, CNYEUR: 0.1264,
};

const convertAmount = (amount, fromCcy, toCcy) => {
  if (!amount || fromCcy === toCcy) return amount || 0;
  const key = fromCcy.toUpperCase()+toCcy.toUpperCase();
  if (FX[key]) return amount * FX[key];
  const key2 = toCcy.toUpperCase()+fromCcy.toUpperCase();
  if (FX[key2]) return amount / FX[key2];
  // Via USD
  const toUSD = FX[fromCcy.toUpperCase()+"USD"] || 1;
  const fromUSD = FX["USD"+toCcy.toUpperCase()] || 1;
  return amount * toUSD * fromUSD;
};

const CCY_SYMBOLS = { USD: "$", GBP: "GBP", EUR: "EUR", CNY: "CNY" };

// --- ALL TRANSACTIONS (1283 rows from Excel) -------------------------
// Fields: [sel, tradedate, settdate, clientId, txtype, ticker, desc, ccy, qty, consideration, netamt, costprice, costvalue]


const TXNS = RAW_TXNS.map((r, i) => ({
  id: i,
  selector: r[0] === 'T' ? 'Trade' : r[0] === 'C' ? 'Cashflow' : r[0] === 'D' ? 'Dividend' : 'CorpAct',
  tradedate: r[1], settdate: r[2], clientId: r[3],
  txtype: r[4], ticker: r[5], description: r[6],
  ccy: r[7], qty: r[8], consideration: r[9],
  netamt: r[10], costprice: r[11], costvalue: r[12],
}));

// --- CLIENT DATA -----------------------------------------------------
const CLIENTS = [
  { id:"C00355633",code:"355633-Lightfoot",name:"Michael Lightfoot",email:"Michael@i-FSC.com",address:"1 New Lane",jurisdiction:"US",verified:true,phone:"+1 212 555 0147",joined:"2020-10-01" },
  { id:"C00356735",code:"356735-Starkie",name:"Lyndsey Starkie",email:"Lyndsey@i-FSC.com",address:"25 Gary Close",jurisdiction:"US",verified:true,phone:"+1 646 555 0293",joined:"2021-02-15" },
  { id:"C00355634",code:"355634-Pauls",name:"Chris Pauls",email:"Chris@i-FSC.com",address:"23 High Street",jurisdiction:"US",verified:true,phone:"+1 212 555 0381",joined:"2020-10-01" },
  { id:"C00347223",code:"347223-Murji",name:"Hash Murji",email:"Hash@i-FSC.com",address:"8 Elm Gardens",jurisdiction:"US",verified:true,phone:"+1 917 555 0562",joined:"2020-09-01" },
];

const HOLDINGS = {
  C00355634:[
    {ticker:"CASH-USD",name:"US Dollar Cash",ccy:"USD",qty:0,cost:0,value:259941.71,isCash:true},
    {ticker:"VTI",name:"Vanguard Total Stock Market",ccy:"USD",qty:296,cost:62573.45,value:56488.05},
    {ticker:"BNDX",name:"Vanguard Total Intl Bond",ccy:"USD",qty:412,cost:22009.04,value:22397.90},
    {ticker:"VPL",name:"Vanguard FTSE Pacific",ccy:"USD",qty:302,cost:22712.64,value:21881.02},
    {ticker:"DBEU",name:"Xtrackers MSCI Europe Hedged",ccy:"USD",qty:605,cost:19503.65,value:16528.03},
    {ticker:"ARKK",name:"ARK Innovation ETF",ccy:"USD",qty:139,cost:16402.47,value:16819.46},
    {ticker:"IAU",name:"iShares Gold Trust",ccy:"USD",qty:325,cost:10981.46,value:11449.10},
    {ticker:"VYM",name:"Vanguard High Dividend Yield",ccy:"USD",qty:106,cost:10022.71,value:10182.16},
    {ticker:"SGOV",name:"iShares 0-3M Treasury Bond",ccy:"USD",qty:100,cost:9512.22,value:9434.20},
    {ticker:"VCSH",name:"Vanguard S-T Corp Bond",ccy:"USD",qty:220,cost:17197.99,value:17156.99},
    {ticker:"SCHP",name:"Schwab US TIPS ETF",ccy:"USD",qty:315,cost:17050.95,value:16866.51},
    {ticker:"SCHO",name:"Schwab S-T US Treasury",ccy:"USD",qty:344,cost:16859.26,value:16915.94},
    {ticker:"LGLV",name:"SPDR US Large Cap Low Vol",ccy:"USD",qty:125,cost:15610.98,value:13857.91},
    {ticker:"VWO",name:"Vanguard FTSE Emerging Markets",ccy:"USD",qty:423,cost:20329.55,value:19260.91},
  ],
  C00355633:[
    {ticker:"Cash-USD",name:"US Dollar Cash",ccy:"USD",qty:0,cost:0,value:360802.77,isCash:true},
    {ticker:"VTI",name:"Vanguard Total Stock Market",ccy:"USD",qty:676,cost:138422.35,value:138548.47},
    {ticker:"VPL",name:"Vanguard FTSE Pacific",ccy:"USD",qty:690,cost:53297.83,value:53298.61},
    {ticker:"VWO",name:"Vanguard FTSE Emerging Markets",ccy:"USD",qty:966,cost:46128.70,value:46128.55},
    {ticker:"DBEU",name:"Xtrackers MSCI Europe Hedged",ccy:"USD",qty:1384,cost:41766.26,value:39360.01},
    {ticker:"BNDX",name:"Vanguard Total Intl Bond",ccy:"USD",qty:354,cost:18312.78,value:18260.96},
    {ticker:"VCSH",name:"Vanguard S-T Corp Bond",ccy:"USD",qty:226,cost:17568.81,value:17484.06},
    {ticker:"SCHP",name:"Schwab US TIPS ETF",ccy:"USD",qty:324,cost:17553.52,value:17460.87},
    {ticker:"SCHO",name:"Schwab S-T US Treasury",ccy:"USD",qty:354,cost:17339.56,value:17234.64},
    {ticker:"CASH-GBP",name:"Sterling Cash",ccy:"GBP",qty:0,cost:0,value:6582.16,isCash:true},
  ],
  C00347223:[
    {ticker:"Cash-GBP",name:"Sterling Cash",ccy:"GBP",qty:0,cost:0,value:823723.83,isCash:true},
    {ticker:"GSPX",name:"iShares Core S&P 500 GBP-H",ccy:"GBP",qty:36113,cost:272743.37,value:222739.76},
    {ticker:"IS15",name:"iShares GBP Corp Bond 0-5Yr",ccy:"GBP",qty:726,cost:72741.75,value:71679.59},
    {ticker:"GILS",name:"Lyxor Core UK Govt Bond",ccy:"GBP",qty:681,cost:70777.59,value:70777.59},
    {ticker:"EMIM",name:"iShares Core EM IMI",ccy:"GBP",qty:3012,cost:80423.01,value:72737.56},
    {ticker:"EUXS",name:"iShares MSCI Europe Ex-UK",ccy:"GBP",qty:11958,cost:74838.31,value:59742.93},
    {ticker:"ERNS",name:"iShares GBP Ultrashort Bond",ccy:"GBP",qty:695,cost:67797.60,value:67208.56},
    {ticker:"XGIG",name:"Invesco Global HY Corp Bond",ccy:"GBP",qty:1757,cost:49703.32,value:47130.84},
    {ticker:"AGBP",name:"iShares Core Glb Agg GBP-H",ccy:"GBP",qty:9389,cost:47056.35,value:47193.89},
    {ticker:"IJPH",name:"iShares MSCI Japan GBP-H",ccy:"GBP",qty:533,cost:40163.70,value:31910.85},
    {ticker:"VAPX",name:"Vanguard FTSE Asia Pacific",ccy:"USD",qty:2237,cost:44262.79,value:38968.78},
    {ticker:"VGOV",name:"Vanguard UK Gilt",ccy:"GBP",qty:0,cost:174.75,value:27261.04},
    {ticker:"CSH2",name:"Lyxor Smart Cash",ccy:"GBP",qty:40,cost:41364.90,value:41241.16},
    {ticker:"CUKX",name:"iShares Core FTSE 100",ccy:"GBP",qty:122,cost:14998.89,value:12361.07},
  ],
  C00356735:[
    {ticker:"CASH-GBP",name:"Sterling Cash",ccy:"GBP",qty:0,cost:0,value:646744.47,isCash:true},
    {ticker:"GSPX",name:"iShares Core S&P 500 GBP-H",ccy:"GBP",qty:37468,cost:245565.28,value:243819.56},
    {ticker:"EMIM",name:"iShares Core EM IMI",ccy:"GBP",qty:3125,cost:84549.12,value:84659.55},
    {ticker:"GILS",name:"Lyxor Core UK Govt Bond",ccy:"GBP",qty:318,cost:33050.33,value:33050.33},
    {ticker:"EUXS",name:"iShares MSCI Europe Ex-UK",ccy:"GBP",qty:12407,cost:66498.40,value:63725.10},
    {ticker:"ERNS",name:"iShares GBP Ultrashort Bond",ccy:"GBP",qty:324,cost:31551.91,value:31575.39},
    {ticker:"VAPX",name:"Vanguard FTSE Asia Pacific",ccy:"USD",qty:2321,cost:45430.21,value:45356.01},
    {ticker:"IS15",name:"iShares GBP Corp Bond 0-5Yr",ccy:"GBP",qty:339,cost:34075.88,value:34079.36},
    {ticker:"IJPH",name:"iShares MSCI Japan GBP-H",ccy:"GBP",qty:553,cost:38533.04,value:38123.90},
    {ticker:"XGIG",name:"Invesco Global HY Corp Bond",ccy:"GBP",qty:684,cost:18026.89,value:17964.64},
    {ticker:"AGBP",name:"iShares Core Glb Agg GBP-H",ccy:"GBP",qty:3653,cost:17988.94,value:17995.92},
    {ticker:"CUKX",name:"iShares Core FTSE 100",ccy:"GBP",qty:126,cost:13996.08,value:13128.49},
    {ticker:"Cash-USD",name:"US Dollar Cash",ccy:"USD",qty:0,cost:0,value:3575.23,isCash:true},
    {ticker:"VGOV",name:"Vanguard UK Gilt",ccy:"GBP",qty:0,cost:65.20,value:9158.18},
  ],
};

const COMMS = {
  C00355633:[
    {id:1,date:"2024-03-15",type:"email",subject:"Q1 Portfolio Review",summary:"Discussed Q1 performance. Client satisfied with VTI allocation. Agreed to maintain strategy.",user:"Sarah Johnson"},
    {id:2,date:"2024-01-10",type:"call",subject:"January Check-in",summary:"Client queried DBEU underperformance. Explained currency hedging. Client comfortable holding.",user:"James White"},
    {id:3,date:"2023-12-01",type:"email",subject:"Year-End Statement",summary:"Sent annual portfolio summary and tax documents.",user:"Sarah Johnson"},
  ],
  C00356735:[
    {id:1,date:"2024-02-20",type:"meeting",subject:"Rebalance Discussion",summary:"Agreed to reduce GSPX concentration to 40% of equity portfolio.",user:"James White"},
    {id:2,date:"2023-11-15",type:"email",subject:"Trustee Fee Invoice",summary:"Sent invoice for annual trustee fee of GBP1,160.",user:"Admin"},
  ],
  C00355634:[
    {id:1,date:"2024-03-20",type:"email",subject:"New Investment Options",summary:"Sent research note on ARKK recovery. Client interested in increasing position.",user:"Sarah Johnson"},
    {id:2,date:"2024-01-05",type:"call",subject:"New Year Review",summary:"Discussed 2024 outlook. Client wants to reduce DBEU exposure.",user:"James White"},
  ],
  C00347223:[
    {id:1,date:"2024-04-01",type:"meeting",subject:"Quarterly Review",summary:"GSPX remains largest holding. Client flagged interest in increasing fixed income allocation.",user:"James White"},
    {id:2,date:"2023-07-20",type:"email",subject:"Rebalance Notification",summary:"Notified of rebalance -- sold ERNS and CUKX, bought IS15 and GSPX.",user:"Sarah Johnson"},
  ],
};

const BLOOMBERG_NEWS = [
  {id:1,time:"09:32",category:"Markets",headline:"FTSE 100 rises 0.4% as energy stocks lead gains amid oil price rally",source:"Bloomberg",tag:"FTSE"},
  {id:2,time:"09:18",category:"Fixed Income",headline:"UK gilt yields fall to 3-month low following softer CPI data",source:"Bloomberg",tag:"GILTS"},
  {id:3,time:"08:55",category:"US Markets",headline:"S&P 500 futures point higher ahead of Fed minutes release",source:"Bloomberg",tag:"SPX"},
  {id:4,time:"08:41",category:"FX",headline:"Sterling climbs to 1.2650 vs dollar on strong retail sales data",source:"Bloomberg",tag:"GBP"},
  {id:5,time:"08:22",category:"Asia",headline:"Nikkei 225 closes up 1.1% as yen weakens; BOJ signals policy pause",source:"Bloomberg",tag:"NKY"},
  {id:6,time:"07:58",category:"Commodities",headline:"Gold holds above $2,300/oz as dollar softens on rate cut expectations",source:"Bloomberg",tag:"XAU"},
  {id:7,time:"07:33",category:"ETFs",headline:"GSPX: iShares S&P 500 GBP-hedged sees record inflows of GBP420M in May",source:"Bloomberg",tag:"GSPX"},
  {id:8,time:"07:15",category:"Emerging Markets",headline:"EM equities rally 1.8% as China stimulus measures exceed expectations",source:"Bloomberg",tag:"EMIM"},
];

const MARKET_DATA = {
  indices:[
    {name:"S&P 500",ticker:"SPX",value:5312.8,change:+18.4,pct:+0.35,direction:"up"},
    {name:"FTSE 100",ticker:"UKX",value:8247.3,change:-12.1,pct:-0.15,direction:"down"},
    {name:"Euro Stoxx 50",ticker:"SX5E",value:4921.6,change:+31.2,pct:+0.64,direction:"up"},
    {name:"Nikkei 225",ticker:"NKY",value:38842.0,change:+418.5,pct:+1.09,direction:"up"},
    {name:"Hang Seng",ticker:"HSI",value:18452.1,change:-88.3,pct:-0.48,direction:"down"},
  ],
  risers:[
    {ticker:"ARKK",name:"ARK Innovation ETF",change:+4.21,pct:+8.4},
    {ticker:"EMIM",name:"iShares Core EM IMI",change:+0.52,pct:+2.1},
    {ticker:"VAPX",name:"Vanguard Asia Pacific",change:+0.38,pct:+1.9},
    {ticker:"IAU",name:"iShares Gold Trust",change:+0.61,pct:+1.6},
    {ticker:"GSPX",name:"iShares S&P 500 GBP-H",change:+0.12,pct:+1.5},
  ],
  fallers:[
    {ticker:"DBEU",name:"Xtrackers MSCI Europe Hedged",change:-0.84,pct:-2.2},
    {ticker:"LGLV",name:"SPDR US Large Cap Low Vol",change:-2.18,pct:-1.5},
    {ticker:"CUKX",name:"iShares FTSE 100",change:-1.92,pct:-1.4},
    {ticker:"VYM",name:"Vanguard High Dividend",change:-1.41,pct:-1.3},
    {ticker:"IJPH",name:"iShares Japan GBP-H",change:-1.02,pct:-1.1},
  ],
  trends:[
    {title:"Fed Rate Path",body:"Markets pricing 2 cuts in H2 2024. Bond ETFs outperforming as yield curve flattens. VCSH and SCHO positioned well."},
    {title:"GBP Strength",body:"Sterling at 14-month high vs EUR. GBP-hedged products (GSPX, IJPH) benefiting. Watch GBPUSD at 1.27 resistance."},
    {title:"EM Revival",body:"China stimulus driving EM rally. EMIM and VAPX seeing strong momentum. Risk-on sentiment building in Asia."},
    {title:"Gold Breakout",body:"IAU above $38 on Fed pivot hopes and geopolitical demand. Technical breakout with $40 target in view."},
  ],
};

// --- HELPERS -------------------------------------------------------
const sign = (n) => { if (n >= 0) { return "+"; } return "-"; };
const posColor = (n) => { if (n >= 0) { return C.green; } return C.red; };
const posBg = (n) => { if (n >= 0) { return C.greenBg; } return C.redBg; };
const dirColor = (dir) => { if (dir === "up") { return C.green; } return C.red; };
const fmt = (n, dp=2) => { if (n == null) { return "--"; } return Math.abs(n).toLocaleString("en-GB",{minimumFractionDigits:dp,maximumFractionDigits:dp}); };
const fmtC = (n, ccy, selectedCcy) => {
  if (n == null) { return "--"; }
  const sym = CCY_SYMBOLS[selectedCcy] || "$";
  const converted = convertAmount(n, ccy, selectedCcy);
  return sym+fmt(converted);
};
const pct = (n) => { if (n == null) { return "--"; } if (n >= 0) { return "+"+fmt(n)+"%"; } return fmt(n)+"%"; };
const calcPL = (cost, val) => val - cost;
const calcPct = (cost, val) => { if (cost === 0) { return 0; } return ((val-cost)/Math.abs(cost))*100; };

const clientTotals = (id, selectedCcy) => {
  const hs = HOLDINGS[id]||[];
  const totalValue = hs.reduce((s,h)=>s+convertAmount(h.value,h.ccy,selectedCcy),0);
  const totalCost = hs.reduce((s,h)=>s+convertAmount(h.cost,h.ccy,selectedCcy),0);
  return {totalValue,totalCost,pl:totalValue-totalCost,pctReturn:calcPct(totalCost,totalValue)};
};

const buildChart = (id, selectedCcy) => {
  const base = {
    "C00355633":[285000,340000,410000,490000,430000,510000,590000,null],
    "C00356735":[620000,695000,780000,890000,810000,870000,980000,null],
    "C00355634":[180000,220000,260000,320000,290000,330000,380000,null],
    "C00347223":[950000,1050000,1150000,1280000,1180000,1250000,1350000,null],
  };
  const labels=["Nov '20","Mar '21","Jun '21","Dec '21","Jun '22","Dec '22","Jun '23","Now"];
  const vals = base[id]||[];
  const final = clientTotals(id,selectedCcy).totalValue;
  return labels.map((d,i)=>({
    date:d,
    value: i===7 ? Math.round(final) : Math.round(convertAmount(vals[i]||0,"USD",selectedCcy)),
  }));
};

// --- STYLED ATOMS -------------------------------------------------
const Badge=({children,color="info"})=>{
  const cols={
    info:{bg:"#E6F9F8",text:"#009990"},success:{bg:"#D1FAE5",text:"#065F46"},
    warning:{bg:"#FEF3C7",text:"#92400E"},error:{bg:"#FEE2E2",text:"#991B1B"},
    navy:{bg:"#1E3A5F",text:"#93C5FD"},gold:{bg:"#FEF5E7",text:"#B45309"},
    up:{bg:"#D1FAE5",text:"#065F46"},down:{bg:"#FEE2E2",text:"#991B1B"},
  };
  const col=cols[color]||cols.info;
  return <span style={{background:col.bg,color:col.text,fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:100,display:"inline-block",letterSpacing:0.3,whiteSpace:"nowrap"}}>{children}</span>;
};

const Btn=({children,onClick,variant="primary",small})=>{
  const s={
    primary:{background:C.teal,color:C.white,border:"none"},
    secondary:{background:"transparent",color:C.navy,border:"1.5px solid "+C.navy},
    ghost:{background:"transparent",color:C.teal,border:"1.5px solid "+C.teal},
    danger:{background:C.red,color:C.white,border:"none"},
    dark:{background:C.navy,color:C.white,border:"none"},
  };
  return <button onClick={onClick} style={{...s[variant],fontFamily:"'Inter',sans-serif",fontSize:small?11:13,fontWeight:500,padding:small?"5px 11px":"8px 15px",borderRadius:6,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5}}>{children}</button>;
};

const Modal=({title,onClose,children,wide})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:C.white,borderRadius:12,padding:28,width:wide?700:520,maxWidth:"97vw",maxHeight:"90vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:18,fontWeight:600,color:C.navy}}>{title}</div>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:C.faint,lineHeight:1}}>x</button>
      </div>
      {children}
    </div>
  </div>
);

const FldInput=({label,value,onChange,placeholder,type="text"})=>(
  <div style={{marginBottom:13}}>
    <label style={{fontSize:11,fontWeight:600,color:C.text,display:"block",marginBottom:4}}>{label}</label>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"8px 11px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",outline:"none",boxSizing:"border-box",color:C.navy}}/>
  </div>
);

const FldSelect=({label,value,onChange,options})=>(
  <div style={{marginBottom:13}}>
    <label style={{fontSize:11,fontWeight:600,color:C.text,display:"block",marginBottom:4}}>{label}</label>
    <select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"8px 11px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",outline:"none",color:C.navy,background:C.white}}>
      {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const StatCard=({label,value,sub,trend,dark})=>(
  <div style={{background:dark?C.navyMid:C.white,border:"0.5px solid "+(dark?"rgba(255,255,255,0.08)":C.silver),borderRadius:10,padding:"15px 17px"}}>
    <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:dark?"rgba(255,255,255,0.38)":C.faint,marginBottom:5}}>{label}</div>
    <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:21,fontWeight:600,color:dark?C.white:C.navy,letterSpacing:-0.4,lineHeight:1.2}}>{value}</div>
    {sub&&<div style={{fontSize:12,color:trend==="up"?C.green:trend==="down"?C.red:(dark?"rgba(255,255,255,0.38)":C.faint),marginTop:3}}>{sub}</div>}
  </div>
);

// --- SORTABLE TABLE -----------------------------------------------
const SortIcon=({dir})=><span style={{fontSize:9,marginLeft:4,opacity:0.6}}>{dir==="asc"?"^":dir==="desc"?"v":"^v"}</span>;

const useSortFilter=(data,defaultSort)=>{
  const [sort,setSort]=useState(defaultSort||{col:null,dir:"asc"});
  const [filters,setFilters]=useState({});
  const [search,setSearch]=useState("");

  const toggleSort=(col)=>setSort(s=>s.col===col?{col,dir:s.dir==="asc"?"desc":"asc"}:{col,dir:"asc"});
  const setFilter=(col,val)=>setFilters(f=>({...f,[col]:val}));

  const result=useMemo(()=>{
    let d=[...data];
    if(search){const q=search.toLowerCase();d=d.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(q)));}
    Object.entries(filters).forEach(([col,val])=>{if(val&&val!=="all")d=d.filter(r=>String(r[col]).toLowerCase().includes(val.toLowerCase()));});
    if(sort.col){
      d.sort((a,b)=>{
        const av=a[sort.col],bv=b[sort.col];
        if(av==null)return 1;if(bv==null)return -1;
        const cmp=typeof av==="number"?av-bv:String(av).localeCompare(String(bv));
        return sort.dir==="asc"?cmp:-cmp;
      });
    }
    return d;
  },[data,search,filters,sort]);

  return{result,sort,toggleSort,filters,setFilter,search,setSearch};
};

// --- LOGO SVG (i-Convergence wordmark) --------------------------
const Logo=({size=28})=>(
  <svg width={size*5.2} height={size} viewBox="0 0 156 30" fill="none" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="22" fontFamily="Space Grotesk, sans-serif" fontWeight="700" fontSize="20" letterSpacing="-0.5">
      <tspan fill="#00B8B0">i-</tspan><tspan fill="#FFFFFF">Convergence</tspan>
    </text>
  </svg>
);

// --- NAVIGATION --------------------------------------------------
const CCYSelector=({selectedCcy,onChange,compact})=>(
  <div style={{display:"flex",alignItems:"center",gap:compact?2:6,background:"rgba(255,255,255,0.08)",borderRadius:7,padding:"2px 3px"}}>
    {["USD","GBP","EUR","CNY"].map(c=>(
      <button key={c} onClick={()=>onChange(c)} style={{background:selectedCcy===c?C.teal:"transparent",color:selectedCcy===c?C.white:"rgba(255,255,255,0.55)",border:"none",borderRadius:5,padding:compact?"3px 6px":"4px 9px",fontSize:compact?11:12,fontWeight:600,cursor:"pointer",fontFamily:"'Inter',sans-serif",transition:"all 0.15s"}}>
        {c}
      </button>
    ))}
  </div>
);

const Nav=({section,setSection,selectedCcy,setCcy,user,logout})=>{
  const isMobile=useIsMobile();
  const [menuOpen,setMenuOpen]=useState(false);
  const items=[
    {key:"dashboard",label:"Dashboard",icon:"#"},
    {key:"clients",label:"Clients",icon:"CC"},
    {key:"alerts",label:"Alerts",icon:"!"},
    {key:"pricing",label:"Pricing",icon:"*"},
    {key:"ai",label:"AI Insights",icon:"*"},
    {key:"news",label:"News",icon:"~"},
    {key:"connect",label:"Connect",icon:"!"},
    {key:"trustee",label:"Trustee",icon:"T"},
    {key:"users",label:"Users",icon:"U"},
  ];
  const handleNav=(key)=>{setSection(key);setMenuOpen(false);};
  return(
    <>
      <div style={{background:C.navy,display:"flex",alignItems:"center",padding:"0 16px",height:54,position:"sticky",top:0,zIndex:200,flexShrink:0,borderBottom:"1px solid rgba(0,184,176,0.15)"}}>
        <div style={{marginRight:isMobile?10:20,flexShrink:0}}>
          <Logo size={isMobile?19:24}/>
        </div>
        {!isMobile&&items.filter(i=>{
          if(i.key==="trustee") return user && (user.roles||[]).includes("trustee");
          if(i.key==="users")   return user && user.isAdviser;
          return true;
        }).map(i=>(
          <button key={i.key} onClick={()=>handleNav(i.key)} style={{background:"none",border:"none",color:section===i.key?C.teal:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:section===i.key?600:400,cursor:"pointer",padding:"0 9px",height:"100%",borderBottom:section===i.key?"2px solid "+C.teal:"2px solid transparent",transition:"all 0.15s",whiteSpace:"nowrap",fontFamily:"'Inter',sans-serif"}}>
            {i.label}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:isMobile?8:12}}>
          <CCYSelector selectedCcy={selectedCcy} onChange={setCcy} compact={isMobile}/>
          {!isMobile&&<>
            <div style={{width:1,height:24,background:"rgba(255,255,255,0.1)"}}/>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:C.teal}}/>
              <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>Bloomberg</span>
            </div>
          </>}
          <div style={{position:"relative"}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:12,fontWeight:600,flexShrink:0,cursor:"pointer"}} title={user&&user.email}>
              {user?user.name.split(" ").map(n=>n[0]).join("").slice(0,2):"?"}
            </div>
          </div>
          {!isMobile&&user&&<button onClick={logout} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.6)",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>Sign out</button>}
          {isMobile&&(
            <button onClick={()=>setMenuOpen(o=>!o)} style={{background:"none",border:"none",cursor:"pointer",padding:6,display:"flex",flexDirection:"column",gap:5,width:36,height:36,alignItems:"center",justifyContent:"center"}}>
              <div style={{width:22,height:2,background:C.white,transition:"transform 0.2s",transform:menuOpen?"rotate(45deg) translate(0,7px)":"none"}}/>
              <div style={{width:22,height:2,background:C.white,opacity:menuOpen?0:1,transition:"opacity 0.15s"}}/>
              <div style={{width:22,height:2,background:C.white,transition:"transform 0.2s",transform:menuOpen?"rotate(-45deg) translate(0,-7px)":"none"}}/>
            </button>
          )}
        </div>
      </div>
      {isMobile&&menuOpen&&(
        <>
          <div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:190,top:54}}/>
          <div style={{position:"fixed",top:54,left:0,right:0,background:C.navy,zIndex:195,borderBottom:"2px solid "+C.teal,boxShadow:"0 8px 32px rgba(0,0,0,0.4)"}}>
            {items.filter(i=>{
              if(i.key==="trustee") return user && (user.roles||[]).includes("trustee");
              if(i.key==="users")   return user && user.isAdviser;
              return true;
            }).map(i=>(
              <button key={i.key} onClick={()=>handleNav(i.key)} style={{display:"flex",alignItems:"center",gap:14,width:"100%",background:section===i.key?C.navyLight:"none",border:"none",borderBottom:"0.5px solid rgba(255,255,255,0.07)",color:section===i.key?C.teal:C.white,fontSize:15,fontWeight:section===i.key?600:400,cursor:"pointer",padding:"15px 20px",fontFamily:"'Inter',sans-serif",textAlign:"left",boxSizing:"border-box"}}>
                <span style={{fontSize:20,width:28,textAlign:"center"}}>{i.icon}</span>
                <span>{i.label}</span>
                {section===i.key&&<div style={{marginLeft:"auto",width:6,height:6,borderRadius:"50%",background:C.teal}}/>}
              </button>
            ))}
            <div style={{padding:"12px 20px",borderTop:"0.5px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:C.teal}}/>
              <span style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>Bloomberg connected</span>
            </div>
          </div>
        </>
      )}
      {isMobile&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.navy,borderTop:"1px solid rgba(0,184,176,0.2)",display:"flex",zIndex:150,height:60}}>
          {items.slice(0,4).map(i=>(
            <button key={i.key} onClick={()=>handleNav(i.key)} style={{flex:1,background:section===i.key?"rgba(0,184,176,0.1)":"none",border:"none",borderTop:section===i.key?"2px solid "+C.teal:"2px solid transparent",color:section===i.key?C.teal:"rgba(255,255,255,0.45)",fontSize:9,fontWeight:section===i.key?600:400,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,fontFamily:"'Inter',sans-serif",padding:"4px 0"}}>
              <span style={{fontSize:19,lineHeight:1}}>{i.icon}</span>
              <span>{i.label}</span>
            </button>
          ))}
          <button onClick={()=>setMenuOpen(o=>!o)} style={{flex:1,background:menuOpen?"rgba(0,184,176,0.1)":"none",border:"none",borderTop:menuOpen?"2px solid "+C.teal:"2px solid transparent",color:menuOpen?C.teal:"rgba(255,255,255,0.45)",fontSize:9,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,fontFamily:"'Inter',sans-serif",padding:"4px 0"}}>
            <span style={{fontSize:19,lineHeight:1}}>=</span>
            <span>More</span>
          </button>
        </div>
      )}
    </>
  );
};


const Dashboard=({setSection,setSelectedClient,selectedCcy})=>{
  const sym=CCY_SYMBOLS[selectedCcy]||"$";
  const totalAUM=CLIENTS.reduce((s,c)=>s+clientTotals(c.id,selectedCcy).totalValue,0);
  const totalCost=CLIENTS.reduce((s,c)=>s+clientTotals(c.id,selectedCcy).totalCost,0);
  const totalPL=totalAUM-totalCost;
  const totalTxns=TXNS.length;
  const totalDivs=TXNS.filter(t=>t.txtype==="Dividend").reduce((s,t)=>s+convertAmount(t.consideration,t.ccy,selectedCcy),0);

  return(
    <div style={{padding:24}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:3,textTransform:"uppercase",color:C.teal,marginBottom:3}}>Platform overview</div>
        <div style={{display:"flex",alignItems:"baseline",gap:12}}>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:24,fontWeight:700,color:C.navy,letterSpacing:-0.5}}>Aggregate dashboard</div>
          <div style={{fontSize:12,color:C.faint}}>Reporting in <strong style={{color:C.navy}}>{selectedCcy}</strong>{" . "}{sym}{fmt(FX["GBPUSD"]||1.2618,4)}{" = GBP1.00"}</div>
        </div>
      </div>

      <div style={{background:C.navy,borderRadius:12,padding:"22px 26px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:18}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:5}}>Total AUM ({selectedCcy})</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:34,fontWeight:700,color:C.white,letterSpacing:-1}}>{sym}{fmt(totalAUM,0)}</div>
          <div style={{fontSize:13,color:totalPL>= 0 ?"#34D399":"#F87171",marginTop:3}}>
            {totalPL>= 0 ?"^":"v"}{" "}{sym}{fmt(Math.abs(totalPL),0)}{" - "}{pct(calcPct(totalCost,totalAUM))}{" overall return"}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <StatCard label="Active clients" value="4" dark/>
          <StatCard label="Total transactions" value={totalTxns.toLocaleString()} dark/>
          <StatCard label="Lifetime dividends" value={sym+fmt(totalDivs,0)} dark/>
          <StatCard label="Compliance" value="100%" sub="4 of 4 verified" trend="up" dark/>
        </div>
      </div>

      {isMobile ? (
        <div style={{marginBottom:14,marginLeft:-16,marginRight:-16}}>
          <div
            id="client-scroll"
            onScroll={e=>{
              const el=e.target;
              const cardW=el.scrollWidth/CLIENTS.length;
              const active=Math.round(el.scrollLeft/cardW);
              document.querySelectorAll(".client-dot").forEach((d,i)=>{
                d.style.width=i===active?"18px":"5px";
                d.style.background=i===active?"#00B8B0":"#C4CDD8";
              });
            }}
            style={{overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",msOverflowStyle:"none",paddingLeft:16,paddingRight:16,paddingBottom:8,scrollSnapType:"x mandatory",display:"flex",gap:12}}>
            {CLIENTS.map(c=>{
              const t=clientTotals(c.id,selectedCcy);
              return(
                <div key={c.id} onClick={()=>{setSelectedClient(c.id);setSection("clients");}}
                  style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:14,padding:"16px 18px",cursor:"pointer",minWidth:"calc(80vw)",maxWidth:320,flexShrink:0,boxShadow:"0 2px 12px rgba(0,0,0,0.08)",scrollSnapAlign:"start"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:38,height:38,borderRadius:"50%",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:13,fontWeight:700,flexShrink:0}}>
                        {c.name.split(" ").map(n=>n[0]).join("")}
                      </div>
                      <div>
                        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:14,fontWeight:600,color:C.navy}}>{c.name}</div>
                        <div style={{fontSize:10,color:C.faint}}>{c.code}</div>
                      </div>
                    </div>
                    <Badge color={c.verified?"success":"warning"}>{c.verified?"OK":"?"}</Badge>
                  </div>
                  <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:26,fontWeight:700,color:C.navy,letterSpacing:-0.5,marginBottom:6}}>{sym}{fmt(t.totalValue,0)}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
                    <span style={{fontSize:13,fontWeight:600,color:posColor(t.pl)}}>{sign(t.pl)}{sym}{fmt(Math.abs(t.pl),0)}</span>
                    <span style={{fontSize:12,color:posColor(t.pctReturn),background:posBg(t.pctReturn),padding:"2px 7px",borderRadius:4,fontWeight:600}}>{pct(t.pctReturn)}</span>
                  </div>
                  <div style={{borderTop:"0.5px solid "+C.silver,paddingTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:11,color:C.faint}}>Tap to view portfolio</span>
                    <span style={{fontSize:12,color:C.teal,fontWeight:600}}>View &rarr;</span>
                  </div>
                </div>
              );
            })}
            <div style={{minWidth:4,flexShrink:0}}/>
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:5,marginTop:8}}>
            {CLIENTS.map((_,i)=>(
              <div key={i} className="client-dot" style={{width:i===0?18:5,height:3,borderRadius:2,background:i===0?C.teal:C.silverMid,transition:"all 0.2s"}}/>
            ))}
          </div>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
          {CLIENTS.map(c=>{
            const t=clientTotals(c.id,selectedCcy);
            return(
              <div key={c.id} onClick={()=>{setSelectedClient(c.id);setSection("clients");}} style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:16,cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.teal}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.silver}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                  <div>
                    <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:14,fontWeight:600,color:C.navy}}>{c.name}</div>
                    <div style={{fontSize:10,color:C.faint}}>{c.code}</div>
                  </div>
                  <Badge color={c.verified?"success":"warning"}>{c.verified?"OK":"Pending"}</Badge>
                </div>
                <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:20,fontWeight:700,color:C.navy}}>{sym}{fmt(t.totalValue,0)}</div>
                <div style={{display:"flex",gap:10,marginTop:6}}>
                  <span style={{fontSize:12,color:posColor(t.pl),fontWeight:600}}>{t.pl>= 0 ?"+":""}{sym}{fmt(Math.abs(t.pl),0)}</span>
                  <span style={{fontSize:12,color:posColor(t.pctReturn)}}>{pct(t.pctReturn)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:18}}>
          <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",marginBottom:14}}>AUM by client ({selectedCcy})</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={CLIENTS.map(c=>({name:c.name.split(" ")[0],val:Math.round(clientTotals(c.id,selectedCcy).totalValue*0.001)}))}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.silver}/>
              <XAxis dataKey="name" tick={{fontSize:11,fill:C.faint}}/>
              <YAxis tick={{fontSize:10,fill:C.faint}}/>
              <Tooltip formatter={v=>[sym+v+"k","AUM"]}/>
              <Bar dataKey="val" fill={C.teal} radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:18}}>
          <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Market snapshot</div>
          {MARKET_DATA.indices.map(i=>(
            <div key={i.ticker} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"0.5px solid "+C.silver}}>
              <span style={{fontSize:12,fontWeight:600,color:C.navy}}>{i.name}</span>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontFamily:"Space Grotesk,sans-serif",fontSize:13,fontWeight:600,color:C.navy}}>{i.value.toLocaleString()}</span>
                <span style={{fontSize:12,color:dirColor(i.direction),fontWeight:600}}>{i.direction==="up"?"^":"v"} {Math.abs(i.pct).toFixed(2)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- GOOGLE SHEETS CONFIG ----------------------------------------
const SHEETS_CONFIG = { SPREADSHEET_ID: "", API_KEY: "", SHEET_NAME: "Withdrawals" };
const sheetsConfigured = () => SHEETS_CONFIG.SPREADSHEET_ID && SHEETS_CONFIG.API_KEY;

const appendToSheet = async (row) => {
  if (!sheetsConfigured()) return { ok: false, error: "not_configured" };
  try {
    const url = "https://sheets.googleapis.com/v4/spreadsheets/"+SHEETS_CONFIG.SPREADSHEET_ID+"/values/"+SHEETS_CONFIG.SHEET_NAME+"!A:J:append?valueInputOption=USER_ENTERED&key="+SHEETS_CONFIG.API_KEY;
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: [row] }) });
    return res.ok ? { ok: true } : { ok: false, error: await res.text() };
  } catch(e) { return { ok: false, error: e.message }; }
};

const readSheetStatuses = async () => {
  if (!sheetsConfigured()) return {};
  try {
    const url = "https://sheets.googleapis.com/v4/spreadsheets/"+SHEETS_CONFIG.SPREADSHEET_ID+"/values/"+SHEETS_CONFIG.SHEET_NAME+"!A:J?key="+SHEETS_CONFIG.API_KEY;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = await res.json();
    const rows = (data.values || []).slice(1);
    const map = {};
    rows.forEach(r => { if (r[0]) map[r[0]] = r[9] || "Pending"; });
    return map;
  } catch(e) { return {}; }
};

// --- MARKET DATA CONFIG -------------------------------------------
// Configure your preferred data source. Priority: Yahoo Finance -> Alpha Vantage -> Bloomberg -> Static
const MARKET_CONFIG = {
  // Yahoo Finance via RapidAPI (free tier: 500 req/month)
  // Get key at: rapidapi.com/apidojo/api/yahoo-finance1
  YAHOO_RAPIDAPI_KEY: "",   // paste your RapidAPI key here
  YAHOO_HOST: "apidojo-yahoo-finance-v1.p.rapidapi.com",

  // Alpha Vantage (free tier: 25 req/day)
  // Get key at: alphavantage.co/support/#api-key
  ALPHA_VANTAGE_KEY: "",    // paste your Alpha Vantage key here

  // Bloomberg (paid - only if you have a Bloomberg API subscription)
  BLOOMBERG_KEY: "",        // paste your Bloomberg API key here

  // Which source to use: "yahoo" | "alphavantage" | "bloomberg" | "static"
  PRIMARY_SOURCE: "static", // change to "yahoo" once you add your RapidAPI key

  // Cache duration in minutes (avoids burning free tier quota)
  CACHE_MINUTES: 15,
};

// Your portfolio tickers mapped to Yahoo Finance symbols
const TICKER_MAP = {
  // GBP-listed ETFs (London Stock Exchange)
  "GSPX":  "GSPX.L",  "IS15":  "IS15.L",  "GILS":  "GILS.L",
  "EMIM":  "EMIM.L",  "EUXS":  "EUXS.L",  "ERNS":  "ERNS.L",
  "XGIG":  "XGIG.L",  "AGBP":  "AGBP.L",  "IJPH":  "IJPH.L",
  "CSH2":  "CSH2.L",  "CUKX":  "CUKX.L",  "VGOV":  "VGOV.L",
  // USD-listed ETFs (NYSE/NASDAQ)
  "VTI":   "VTI",     "VWO":   "VWO",     "VPL":   "VPL",
  "VCSH":  "VCSH",    "SCHP":  "SCHP",    "SCHO":  "SCHO",
  "DBEU":  "DBEU",    "BNDX":  "BNDX",    "VAPX":  "VAPX",
  "ARKK":  "ARKK",    "SGOV":  "SGOV",    "LGLV":  "LGLV",
  "VYM":   "VYM",     "IAU":   "IAU",
  // FX pairs
  "GBPUSD": "GBPUSD=X", "GBPEUR": "GBPEUR=X",
  "EURUSD": "EURUSD=X", "USDGBP": "USDGBP=X",
  "USDCNY": "USDCNY=X",
};

// Index symbols for market snapshot
const INDEX_MAP = {
  "S&P 500":     "^GSPC",
  "FTSE 100":    "^FTSE",
  "Euro Stoxx":  "^STOXX50E",
  "Nikkei 225":  "^N225",
  "Hang Seng":   "^HSI",
};

// --- MARKET DATA CACHE --------------------------------------------
const _priceCache = {};
const _cacheTime = {};

const isCacheValid = (key) => {
  if (!_cacheTime[key]) return false;
  return (Date.now() - _cacheTime[key]) < MARKET_CONFIG.CACHE_MINUTES * 60 * 1000;
};

const setCacheEntry = (key, value) => {
  _priceCache[key] = value;
  _cacheTime[key] = Date.now();
};

// --- YAHOO FINANCE FETCHER ----------------------------------------
const fetchYahooQuotes = async (symbols) => {
  if (!MARKET_CONFIG.YAHOO_RAPIDAPI_KEY) return null;
  try {
    // apidojo Yahoo Finance v1 - batch quotes endpoint
    const joined = symbols.slice(0, 20).join(",");
    const url = "https://"+MARKET_CONFIG.YAHOO_HOST+"/market/v2/get-quotes?region=US&lang=en&symbols="+encodeURIComponent(joined);
    const res = await fetch(url, {
      headers: {
        "x-rapidapi-key": MARKET_CONFIG.YAHOO_RAPIDAPI_KEY,
        "x-rapidapi-host": MARKET_CONFIG.YAHOO_HOST,
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const quotes = (data.quoteResponse && data.quoteResponse.result) || [];
    const prices = {};
    quotes.forEach(q => {
      prices[q.symbol] = {
        price: q.regularMarketPrice,
        change: q.regularMarketChange,
        changePct: q.regularMarketChangePercent,
        name: q.shortName || q.longName || q.symbol,
        currency: q.currency || "USD",
      };
    });
    return Object.keys(prices).length > 0 ? prices : null;
  } catch(e) { return null; }
};

const fetchYahooNews = async () => {
  if (!MARKET_CONFIG.YAHOO_RAPIDAPI_KEY) return null;
  try {
    // apidojo get-summaries endpoint for market news
    const url = "https://"+MARKET_CONFIG.YAHOO_HOST+"/market/get-summary?region=US&lang=en";
    const res = await fetch(url, {
      headers: {
        "x-rapidapi-key": MARKET_CONFIG.YAHOO_RAPIDAPI_KEY,
        "x-rapidapi-host": MARKET_CONFIG.YAHOO_HOST,
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Try news from marketSummaryAndSparkResponse or fall back to get-trending news
    const newsUrl = "https://"+MARKET_CONFIG.YAHOO_HOST+"/news/list?region=US&snippetCount=10";
    const newsRes = await fetch(newsUrl, {
      headers: {
        "x-rapidapi-key": MARKET_CONFIG.YAHOO_RAPIDAPI_KEY,
        "x-rapidapi-host": MARKET_CONFIG.YAHOO_HOST,
      }
    });
    if (!newsRes.ok) return null;
    const newsData = await newsRes.json();
    const items = (newsData.items && newsData.items.result) || [];
    return items.slice(0,10).map((item,i) => ({
      id: i+1,
      time: item.published_at ? new Date(item.published_at*1000).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "--",
      category: (item.main_category) || "Markets",
      headline: item.title,
      source: item.publisher && item.publisher.name || "Yahoo Finance",
      tag: "LIVE",
      url: item.link,
    })).filter(n => n.headline);
  } catch(e) { return null; }
};

// --- ALPHA VANTAGE FETCHER ----------------------------------------
const fetchAlphaQuote = async (symbol) => {
  if (!MARKET_CONFIG.ALPHA_VANTAGE_KEY) return null;
  const cacheKey = "av_"+symbol;
  if (isCacheValid(cacheKey)) return _priceCache[cacheKey];
  try {
    const url = "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol="+symbol+"&apikey="+MARKET_CONFIG.ALPHA_VANTAGE_KEY;
    const res = await fetch(url);
    const data = await res.json();
    const q = data["Global Quote"];
    if (!q || !q["05. price"]) return null;
    const result = {
      price: parseFloat(q["05. price"]),
      change: parseFloat(q["09. change"]),
      changePct: parseFloat(q["10. change percent"]),
    };
    setCacheEntry(cacheKey, result);
    return result;
  } catch(e) { return null; }
};

const fetchAlphaFX = async (fromCcy, toCcy) => {
  if (!MARKET_CONFIG.ALPHA_VANTAGE_KEY) return null;
  const cacheKey = "avfx_"+fromCcy+toCcy;
  if (isCacheValid(cacheKey)) return _priceCache[cacheKey];
  try {
    const url = "https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency="+fromCcy+"&to_currency="+toCcy+"&apikey="+MARKET_CONFIG.ALPHA_VANTAGE_KEY;
    const res = await fetch(url);
    const data = await res.json();
    const rate = data["Realtime Currency Exchange Rate"];
    if (!rate) return null;
    const result = { price: parseFloat(rate["5. Exchange Rate"]) };
    setCacheEntry(cacheKey, result);
    return result;
  } catch(e) { return null; }
};

// --- UNIFIED PRICE FETCHER ----------------------------------------
const fetchLivePrices = async (tickers) => {
  const source = MARKET_CONFIG.PRIMARY_SOURCE;

  if (source === "yahoo" && MARKET_CONFIG.YAHOO_RAPIDAPI_KEY) {
    const yahooSymbols = tickers.map(t => TICKER_MAP[t] || t).filter(Boolean);
    const cacheKey = "yahoo_batch";
    if (isCacheValid(cacheKey)) return _priceCache[cacheKey];
    const prices = await fetchYahooQuotes(yahooSymbols);
    if (prices) { setCacheEntry(cacheKey, prices); return prices; }
  }

  if (source === "alphavantage" && MARKET_CONFIG.ALPHA_VANTAGE_KEY) {
    const prices = {};
    // Alpha Vantage is one-at-a-time - fetch key tickers only to preserve quota
    const keyTickers = tickers.slice(0, 5);
    for (const ticker of keyTickers) {
      const result = await fetchAlphaQuote(TICKER_MAP[ticker] || ticker);
      if (result) prices[TICKER_MAP[ticker] || ticker] = result;
    }
    return Object.keys(prices).length > 0 ? prices : null;
  }

  return null; // falls back to static PRICES array
};

// --- MARKET DATA HOOK ---------------------------------------------
const useMarketData = () => {
  const [livePrices, setLivePrices] = useState(null);
  const [liveNews, setLiveNews] = useState(null);
  const [marketStatus, setMarketStatus] = useState("static");
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = async () => {
    setMarketStatus("loading");
    const tickers = Object.keys(TICKER_MAP);

    // Try Yahoo Finance first
    if (MARKET_CONFIG.YAHOO_RAPIDAPI_KEY) {
      const yahooSymbols = [...new Set(tickers.map(t => TICKER_MAP[t]))];
      const prices = await fetchYahooQuotes(yahooSymbols);
      if (prices) {
        setLivePrices(prices);
        setMarketStatus("yahoo");
        setLastUpdated(new Date());
        // Also fetch news
        const news = await fetchYahooNews();
        if (news && news.length > 0) setLiveNews(news);
        return;
      }
    }

    // Fallback to Alpha Vantage
    if (MARKET_CONFIG.ALPHA_VANTAGE_KEY) {
      setMarketStatus("alphavantage");
      // Fetch FX rates at minimum
      const gbpusd = await fetchAlphaFX("GBP","USD");
      const gbpeur = await fetchAlphaFX("GBP","EUR");
      if (gbpusd || gbpeur) {
        const prices = {};
        if (gbpusd) prices["GBPUSD=X"] = gbpusd;
        if (gbpeur) prices["GBPEUR=X"] = gbpeur;
        setLivePrices(prices);
        setLastUpdated(new Date());
        return;
      }
    }

    setMarketStatus("static");
  };

  useEffect(() => {
    refresh();
    // Auto-refresh every CACHE_MINUTES
    const interval = setInterval(refresh, MARKET_CONFIG.CACHE_MINUTES * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Get price for a ticker (live or static fallback)
  const getPrice = (ticker) => {
    if (livePrices) {
      const yahooSym = TICKER_MAP[ticker];
      const liveData = livePrices[yahooSym] || livePrices[ticker];
      if (liveData) return liveData.price;
    }
    // Static fallback from PRICES array
    const staticEntry = PRICES.find(p => p.ticker === ticker);
    return staticEntry ? staticEntry.price : null;
  };

  return { livePrices, liveNews, marketStatus, lastUpdated, refresh, getPrice };
};


// --- SESSION STORAGE FOR WITHDRAWAL REQUESTS ---------------------
const WD_KEY = "iconv_wd_requests";
const loadRequests = async () => {
  try {
    const val = sessionStorage.getItem(WD_KEY);
    return val ? JSON.parse(val) : [];
  } catch(e) { return []; }
};
const saveRequests = async (reqs) => {
  try { sessionStorage.setItem(WD_KEY, JSON.stringify(reqs)); } catch(e) {}
};

// --- RISK & SUITABILITY DATA --------------------------------------
const ASSET_CLASS = {
  "GSPX":"Equity","VTI":"Equity","VWO":"Equity","VPL":"Equity","DBEU":"Equity",
  "EMIM":"Equity","EUXS":"Equity","CUKX":"Equity","VAPX":"Equity","IJPH":"Equity",
  "ARKK":"Equity","VYM":"Equity","LGLV":"Equity","BNDX":"Fixed Income",
  "VCSH":"Fixed Income","SCHP":"Fixed Income","SCHO":"Fixed Income","IS15":"Fixed Income",
  "GILS":"Fixed Income","ERNS":"Fixed Income","XGIG":"Fixed Income","AGBP":"Fixed Income",
  "VGOV":"Fixed Income","SGOV":"Fixed Income","CSH2":"Cash","IAU":"Commodity",
};
const RISK_MANDATES = {
  1:{label:"Very Cautious",equity:[0,20],fi:[60,100],cash:[0,40],commodity:[0,5]},
  2:{label:"Cautious",equity:[0,30],fi:[55,85],cash:[0,35],commodity:[0,5]},
  3:{label:"Cautious Balanced",equity:[10,40],fi:[45,75],cash:[0,30],commodity:[0,10]},
  4:{label:"Balanced",equity:[20,50],fi:[35,65],cash:[0,25],commodity:[0,10]},
  5:{label:"Moderate",equity:[30,60],fi:[25,55],cash:[0,25],commodity:[0,10]},
  6:{label:"Moderate Growth",equity:[40,70],fi:[15,45],cash:[0,20],commodity:[0,15]},
  7:{label:"Growth",equity:[50,80],fi:[10,35],cash:[0,15],commodity:[0,15]},
  8:{label:"Aggressive Growth",equity:[60,90],fi:[0,25],cash:[0,10],commodity:[0,20]},
  9:{label:"Aggressive",equity:[70,100],fi:[0,15],cash:[0,10],commodity:[0,20]},
  10:{label:"Speculative",equity:[80,100],fi:[0,10],cash:[0,10],commodity:[0,25]},
};
const RISK_COLOURS = {1:"#1d4ed8",2:"#2563eb",3:"#0891b2",4:"#0d9488",5:"#059669",6:"#65a30d",7:"#ca8a04",8:"#d97706",9:"#dc2626",10:"#9f1239"};
const RISK_LABELS = {1:"Very Cautious",2:"Cautious",3:"Cautious Balanced",4:"Balanced",5:"Moderate",6:"Moderate Growth",7:"Growth",8:"Aggressive Growth",9:"Aggressive",10:"Speculative"};

const DEFAULT_RISK_PROFILES = {
  "C00355633":{score:5,notes:"Moderate risk tolerance. Prefers global equity diversification. Review due Q3 2024.",reviewed:"2024-01-10"},
  "C00356735":{score:4,notes:"Balanced mandate. Concerned about EM volatility. Reviewed post-rebalance Feb 2024.",reviewed:"2024-02-20"},
  "C00355634":{score:6,notes:"Moderate growth. Comfortable with tactical positions (ARKK). Annual review due Oct 2024.",reviewed:"2024-01-05"},
  "C00347223":{score:4,notes:"Balanced. Large cash position reflects near-term liquidity need. Review pending.",reviewed:"2024-04-01"},
};

const computeCompliance = (clientId, profiles) => {
  const profile = profiles[clientId] || DEFAULT_RISK_PROFILES[clientId];
  if (!profile) return null;
  const mandate = RISK_MANDATES[profile.score];
  const hs = HOLDINGS[clientId] || [];
  const total = hs.reduce((s,h)=>s+h.value, 0);
  if (!total) return null;
  const byClass = {};
  hs.forEach(h => { const ac = ASSET_CLASS[h.ticker]||"Other"; byClass[ac]=(byClass[ac]||0)+h.value; });
  const getPct = ac => Math.round((byClass[ac]||0)/total*100);
  const eqPct=getPct("Equity"), fiPct=getPct("Fixed Income"), cashPct=getPct("Cash"), comPct=getPct("Commodity");
  const flags = [];
  if (eqPct<mandate.equity[0]) flags.push({type:"warning",msg:"Equity "+eqPct+"% below mandate minimum of "+mandate.equity[0]+"%"});
  if (eqPct>mandate.equity[1]) flags.push({type:"error",msg:"Equity "+eqPct+"% exceeds mandate maximum of "+mandate.equity[1]+"%"});
  if (fiPct<mandate.fi[0]) flags.push({type:"warning",msg:"Fixed income "+fiPct+"% below mandate minimum of "+mandate.fi[0]+"%"});
  if (fiPct>mandate.fi[1]) flags.push({type:"error",msg:"Fixed income "+fiPct+"% exceeds mandate maximum of "+mandate.fi[1]+"%"});
  if (cashPct>mandate.cash[1]) flags.push({type:"warning",msg:"Cash "+cashPct+"% above mandate maximum of "+mandate.cash[1]+"%"});
  if (comPct>mandate.commodity[1]) flags.push({type:"warning",msg:"Commodity "+comPct+"% exceeds mandate limit of "+mandate.commodity[1]+"%"});
  return { eqPct, fiPct, cashPct, comPct, flags, mandate, byClass, total };
};

// --- DEFAULT DOCS ------------------------------------------------
const DEFAULT_DOCS = {
  "C00355633":[
    {id:1,name:"KYC Verification -- Lightfoot.pdf",type:"KYC",date:"2020-10-01",size:"1.2 MB",uploader:"Admin"},
    {id:2,name:"Suitability Letter 2024.pdf",type:"Suitability",date:"2024-01-10",size:"320 KB",uploader:"James White"},
    {id:3,name:"Investment Mandate -- Moderate.pdf",type:"Mandate",date:"2020-10-01",size:"245 KB",uploader:"Admin"},
  ],
  "C00356735":[
    {id:1,name:"KYC -- Starkie Verified.pdf",type:"KYC",date:"2021-02-15",size:"980 KB",uploader:"Admin"},
    {id:2,name:"Suitability Assessment 2024.pdf",type:"Suitability",date:"2024-02-20",size:"410 KB",uploader:"James White"},
    {id:3,name:"Risk Disclosure Statement.pdf",type:"Risk Disclosure",date:"2021-02-15",size:"190 KB",uploader:"Admin"},
  ],
  "C00355634":[
    {id:1,name:"KYC -- Chris Pauls.pdf",type:"KYC",date:"2020-10-01",size:"1.1 MB",uploader:"Admin"},
    {id:2,name:"Moderate Growth Mandate.pdf",type:"Mandate",date:"2020-10-01",size:"260 KB",uploader:"Admin"},
    {id:3,name:"Authorisation Letter 2024.pdf",type:"Authorisation",date:"2024-01-05",size:"155 KB",uploader:"James White"},
  ],
  "C00347223":[
    {id:1,name:"KYC -- Hash Murji.pdf",type:"KYC",date:"2020-09-01",size:"1.4 MB",uploader:"Admin"},
    {id:2,name:"Balanced Mandate Agreement.pdf",type:"Mandate",date:"2020-09-01",size:"290 KB",uploader:"Admin"},
    {id:3,name:"Suitability Review Q1 2024.pdf",type:"Suitability",date:"2024-04-01",size:"375 KB",uploader:"James White"},
    {id:4,name:"Risk Disclosure -- Signed.pdf",type:"Risk Disclosure",date:"2020-09-01",size:"185 KB",uploader:"Admin"},
  ],
};

// --- DEFAULT ALERTS ----------------------------------------------
const buildDefaultAlerts = () => [
  {id:1,clientId:"C00347223",client:"Hash Murji",type:"Concentration",severity:"warning",msg:"GSPX represents 14.3% of total portfolio -- above 10% single-position threshold",triggered:"2024-06-01",status:"open"},
  {id:2,clientId:"C00347223",client:"Hash Murji",type:"Mandate",severity:"error",msg:"Equity allocation 23% below balanced mandate minimum of 20%",triggered:"2024-05-28",status:"open"},
  {id:3,clientId:"C00356735",client:"Lyndsey Starkie",type:"Cash",severity:"warning",msg:"Cash position 47.5% of portfolio -- exceeds balanced mandate cash limit of 25%",triggered:"2024-06-01",status:"open"},
  {id:4,clientId:"C00355634",client:"Chris Pauls",type:"Performance",severity:"info",msg:"DBEU down 15.3% from cost -- consider reviewing European hedged position",triggered:"2024-05-20",status:"open"},
  {id:5,clientId:"C00355633",client:"Michael Lightfoot",type:"Review",severity:"info",msg:"Annual suitability review due -- last reviewed 10 Jan 2024",triggered:"2024-06-01",status:"open"},
];

// --- CLIENT DETAIL -------------------------------------------------
const ClientDetail=({clientId,onBack,selectedCcy,setPreviewClientId})=>{
  const isMobile=useIsMobile();
  const [tab,setTab]=useState("valuation");
  // Email/Log state
  const [showEmail,setShowEmail]=useState(false);
  const [showLog,setShowLog]=useState(false);
  const [showWD,setShowWD]=useState(false);
  const [showDocs,setShowDocs]=useState(false);
  const [emailSubject,setEmailSubject]=useState("");
  const [emailBody,setEmailBody]=useState("");
  const [logNote,setLogNote]=useState("");
  const [logType,setLogType]=useState("call");
  const [comms,setComms]=useState(COMMS[clientId]||[]);
  // Withdrawal state
  const [wdType,setWdType]=useState("PCLS");
  const [wdAmount,setWdAmount]=useState("");
  const [wdCcy,setWdCcy]=useState("GBP");
  const [wdNotes,setWdNotes]=useState("");
  const [wdSubmitting,setWdSubmitting]=useState(false);
  const [wdError,setWdError]=useState("");
  const [wdRequests,setWdRequests]=useState([]);
  // Risk profile editing
  const [riskProfiles,setRiskProfiles]=useState(DEFAULT_RISK_PROFILES);
  const [editingRisk,setEditingRisk]=useState(false);
  const [editScore,setEditScore]=useState((DEFAULT_RISK_PROFILES[clientId]||{score:5}).score);
  const [editNotes,setEditNotes]=useState((DEFAULT_RISK_PROFILES[clientId]||{notes:""}).notes||"");

  const sym=CCY_SYMBOLS[selectedCcy]||"$";
  const client=CLIENTS.find(c=>c.id===clientId);
  const holdings=HOLDINGS[clientId]||[];
  const totals=clientTotals(clientId,selectedCcy);
  const chartData=buildChart(clientId,selectedCcy);
  const clientTxns=TXNS.filter(t=>t.clientId===clientId);
  const {result:txSorted,sort:txSort,toggleSort:txToggle,setFilter:txSetFilter,search:txSearch,setSearch:txSetSearch}=useSortFilter(clientTxns,{col:"tradedate",dir:"desc"});
  const equityH=holdings.filter(h=>!h.isCash);
  const initials=client.name.split(" ").map(n=>n[0]).join("");
  const profile=riskProfiles[clientId]||DEFAULT_RISK_PROFILES[clientId];
  const score=(profile&&profile.score)||5;
  const comp=computeCompliance(clientId,riskProfiles);
  const clientDocs=DEFAULT_DOCS[clientId]||[];

  useEffect(()=>{
    loadRequests().then(all=>setWdRequests(all.filter(r=>r.clientId===clientId)));
  },[clientId]);

  const sendEmail=()=>{
    setComms([{id:Date.now(),date:new Date().toISOString().slice(0,10),type:"email",subject:emailSubject,summary:"Sent: "+emailBody.slice(0,80),user:"JW"},...comms]);
    setShowEmail(false);setEmailSubject("");setEmailBody("");
  };
  const logComm=()=>{
    setComms([{id:Date.now(),date:new Date().toISOString().slice(0,10),type:logType,subject:"Manual log",summary:logNote,user:"JW"},...comms]);
    setShowLog(false);setLogNote("");
  };
  const submitWithdrawal=async()=>{
    if(!wdAmount||isNaN(parseFloat(wdAmount))){setWdError("Please enter a valid amount.");return;}
    setWdSubmitting(true);setWdError("");
    const reqId="WD-"+clientId.slice(-6)+"-"+Date.now().toString().slice(-6);
    const dateStr=new Date().toISOString().slice(0,10);
    const newReq={id:reqId,clientId,clientName:client.name,date:dateStr,type:wdType,amount:parseFloat(wdAmount),ccy:wdCcy,notes:wdNotes,status:"Pending"};
    const row=[reqId,dateStr,clientId,client.name,wdType,parseFloat(wdAmount).toFixed(2),wdCcy,wdNotes||"--","JW","Pending"];
    await appendToSheet(row);
    const all=await loadRequests();
    await saveRequests([newReq,...all]);
    setWdRequests([newReq,...wdRequests]);
    setWdSubmitting(false);
    setShowWD(false);setWdAmount("");setWdNotes("");setWdType("PCLS");setWdCcy("GBP");
  };
  const txTypes=[...new Set(clientTxns.map(t=>t.txtype))].sort();
  const tickers=[...new Set(clientTxns.map(t=>t.ticker))].sort();
  const typeColour={KYC:"navy","Suitability":"success","Mandate":"info","Risk Disclosure":"warning","Authorisation":"gold"};
  const typeIcon={KYC:"ID","Suitability":"OK","Mandate":"D","Risk Disclosure":"!","Authorisation":"S"};

  return(
    <div style={{padding:isMobile?"12px 10px":24}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:C.teal,fontSize:13,cursor:"pointer",marginBottom:14,padding:0,display:"flex",alignItems:"center",gap:4}}>&larr; All clients</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:isMobile?14:20,flexWrap:"wrap",gap:14}}>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:50,height:50,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:17,fontWeight:700,flexShrink:0}}>{initials}</div>
          <div>
            <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:21,fontWeight:600,color:C.navy}}>{client.name}</div>
            <div style={{fontSize:12,color:C.faint,marginTop:2}}>{client.code} . {client.email}</div>
            <div style={{marginTop:5,display:"flex",gap:5,flexWrap:"wrap"}}><Badge color="success">Verified</Badge><Badge color="navy">{client.jurisdiction}</Badge></div>
          </div>
        </div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          <Btn onClick={()=>setShowEmail(true)} variant="ghost" small={isMobile}>@ Email</Btn>
          <Btn onClick={()=>setShowLog(true)} variant="secondary" small={isMobile}>+ Log</Btn>
          <Btn onClick={()=>setShowWD(true)} variant="dark" small={isMobile}>v Withdrawal</Btn>
          {setPreviewClientId&&<Btn onClick={()=>setPreviewClientId(clientId)} variant="secondary" small={isMobile}>View Client view</Btn>}
          <Btn onClick={()=>setShowDocs(true)} variant="secondary" small={isMobile}>D Docs</Btn>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMobile?8:10,marginBottom:isMobile?14:18}}>
        <div style={{background:C.navy,border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"15px 17px"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:5}}>Inception value</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:21,fontWeight:600,color:C.white,letterSpacing:-0.4}}>{sym}{fmt(totals.totalCost,0)}</div>
        </div>
        <div style={{background:C.navy,border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"15px 17px"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:5}}>Current value</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:21,fontWeight:600,color:C.white,letterSpacing:-0.4}}>{sym}{fmt(totals.totalValue,0)}</div>
        </div>
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"15px 17px"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.faint,marginBottom:5}}>Unrealised P&L</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:21,fontWeight:600,color:posColor(totals.pl),letterSpacing:-0.4}}>{sign(totals.pl)}{sym}{fmt(Math.abs(totals.pl),0)}</div>
          <div style={{fontSize:12,color:posColor(totals.pctReturn),marginTop:3}}>{pct(totals.pctReturn)}</div>
        </div>
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"15px 17px"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.faint,marginBottom:5}}>Risk profile</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:21,fontWeight:600,color:RISK_COLOURS[score]||C.teal,letterSpacing:-0.4}}>{score}{"/10"}</div>
          <div style={{fontSize:12,color:C.faint,marginTop:3}}>{RISK_LABELS[score]}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:0,borderBottom:"1px solid "+C.silver,marginBottom:18,overflowX:"auto"}}>
        {[["valuation","Valuation"],["transactions","Transactions"],["risk","Risk & Rebalance"],["crm","CRM"]].map(([t,label])=>(
          <button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",borderBottom:tab===t?"2px solid "+C.teal:"2px solid transparent",color:tab===t?C.teal:C.faint,fontSize:13,fontWeight:tab===t?600:400,cursor:"pointer",padding:"9px 16px",marginBottom:-1,whiteSpace:"nowrap",fontFamily:"'Inter',sans-serif"}}>
            {label}
          </button>
        ))}
      </div>
      {tab==="valuation"&&(
        <div>
          <div style={{background:C.navy,borderRadius:10,padding:"18px 22px",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:3}}>Portfolio value . {selectedCcy}</div>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={chartData}>
                <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.teal} stopOpacity={0.3}/><stop offset="95%" stopColor={C.teal} stopOpacity={0}/></linearGradient></defs>
                <XAxis dataKey="date" tick={{fontSize:10,fill:"rgba(255,255,255,0.35)"}}/>
                <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,0.35)"}} tickFormatter={v=>sym+Math.round(v*0.001)+"k"}/>
                <Tooltip formatter={v=>[sym+fmt(v,0),"Value"]} contentStyle={{background:C.navyMid,border:"none",borderRadius:6,fontSize:12}} labelStyle={{color:C.white}}/>
                <Area type="monotone" dataKey="value" stroke={C.teal} strokeWidth={2} fill="url(#grad)" dot={{fill:C.teal,r:3}}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:"0.5px solid "+C.silver,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,fontWeight:600,color:C.navy}}>Holdings</div>
              <Badge color="info">{holdings.length} positions</Badge>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:C.silver}}>{["Ticker","Description","CCY","Qty","Cost Value","Market Value","P&L","Return"].map(h=><th key={h} style={{padding:"8px 13px",textAlign:"left",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                <tbody>
                  {holdings.map((h,i)=>{
                    const cv=convertAmount(h.value,h.ccy,selectedCcy);
                    const cc=convertAmount(h.cost,h.ccy,selectedCcy);
                    const pl=cv-cc;const ret=calcPct(cc,cv);
                    return(
                      <tr key={i} style={{borderBottom:"0.5px solid "+C.silver,background:i%2=== 0 ?C.white:"#FAFBFC"}}>
                        <td style={{padding:"9px 13px",fontFamily:"Space Grotesk,sans-serif",fontWeight:600,color:C.navy}}>{h.ticker}</td>
                        <td style={{padding:"9px 13px",color:C.text,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</td>
                        <td style={{padding:"9px 13px"}}><Badge color={h.ccy==="GBP"?"navy":"info"}>{h.ccy}</Badge></td>
                        <td style={{padding:"9px 13px",textAlign:"right",color:C.text}}>{h.isCash?"--":fmt(h.qty,0)}</td>
                        <td style={{padding:"9px 13px",textAlign:"right",color:C.text}}>{sym}{fmt(cc)}</td>
                        <td style={{padding:"9px 13px",textAlign:"right",fontWeight:600,color:C.navy}}>{sym}{fmt(cv)}</td>
                        <td style={{padding:"9px 13px",textAlign:"right",color:posColor(pl),fontWeight:600}}>{h.isCash?"--":(sign(pl))+sym+fmt(Math.abs(pl))}</td>
                        <td style={{padding:"9px 13px",textAlign:"right",color:posColor(ret)}}>{h.isCash?"--":pct(ret)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr style={{background:C.navy}}>
                  <td colSpan={4} style={{padding:"9px 13px",color:C.white,fontWeight:600}}>Total</td>
                  <td style={{padding:"9px 13px",textAlign:"right",color:"rgba(255,255,255,0.5)"}}>{sym}{fmt(totals.totalCost,0)}</td>
                  <td style={{padding:"9px 13px",textAlign:"right",color:C.white,fontWeight:700,fontFamily:"Space Grotesk,sans-serif"}}>{sym}{fmt(totals.totalValue,0)}</td>
                  <td style={{padding:"9px 13px",textAlign:"right",color:totals.pl>= 0 ?"#34D399":"#F87171",fontWeight:600}}>{sign(totals.pl)}{sym}{fmt(Math.abs(totals.pl),0)}</td>
                  <td style={{padding:"9px 13px",textAlign:"right",color:totals.pctReturn>= 0 ?"#34D399":"#F87171",fontWeight:600}}>{pct(totals.pctReturn)}</td>
                </tr></tfoot>
              </table>
            </div>
          </div>
          {wdRequests.length>0&&(
            <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden",marginTop:14}}>
              <div style={{padding:"12px 16px",borderBottom:"0.5px solid "+C.silver,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFBFC"}}>
                <div style={{fontSize:13,fontWeight:600,color:C.navy}}>Withdrawal requests</div>
                <Badge color={wdRequests.filter(r=>r.status==="Pending").length> 0 ?"warning":"success"}>{wdRequests.filter(r=>r.status==="Pending").length} pending</Badge>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:C.silver}}>{["ID","Date","Type","Amount","CCY","Status"].map(h=><th key={h} style={{padding:"7px 13px",textAlign:"left",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                <tbody>
                  {wdRequests.map((r,i)=>(
                    <tr key={r.id} style={{borderBottom:"0.5px solid "+C.silver,background:i%2=== 0 ?C.white:"#FAFBFC"}}>
                      <td style={{padding:"8px 13px",fontFamily:"monospace",fontSize:10,color:C.faint}}>{r.id}</td>
                      <td style={{padding:"8px 13px",color:C.text}}>{r.date}</td>
                      <td style={{padding:"8px 13px",fontWeight:600,color:C.navy}}>{r.type}</td>
                      <td style={{padding:"8px 13px",fontFamily:"Space Grotesk,sans-serif",fontWeight:600,color:C.navy,textAlign:"right"}}>{r.ccy==="GBP"?"GBP":"$"}{fmt(r.amount)}</td>
                      <td style={{padding:"8px 13px"}}><Badge color={r.ccy==="GBP"?"navy":"info"}>{r.ccy}</Badge></td>
                      <td style={{padding:"8px 13px"}}><Badge color={r.status==="Actioned"?"success":"warning"}>{r.status==="Actioned"?"Actioned":"Pending"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {tab==="transactions"&&(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <input value={txSearch} onChange={e=>txSetSearch(e.target.value)} placeholder="Search transactions..." style={{flex:1,minWidth:150,padding:"7px 11px",border:"1.5px solid "+C.silver,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
            <select onChange={e=>txSetFilter("txtype",e.target.value)} style={{padding:"7px 10px",border:"1.5px solid "+C.silver,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",color:C.navy,background:C.white}}>
              <option value="all">All types</option>
              {txTypes.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select onChange={e=>txSetFilter("ticker",e.target.value)} style={{padding:"7px 10px",border:"1.5px solid "+C.silver,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",color:C.navy,background:C.white}}>
              <option value="all">All tickers</option>
              {tickers.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <span style={{fontSize:12,color:C.faint,display:"flex",alignItems:"center"}}>{txSorted.length} rows</span>
          </div>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden"}}>
            <div style={{overflowX:"auto",maxHeight:480,overflowY:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead style={{position:"sticky",top:0,zIndex:5}}>
                  <tr style={{background:C.navy}}>
                    {[["tradedate","Date"],["txtype","Type"],["ticker","Ticker"],["description","Description"],["ccy","CCY"],["qty","Qty"],["consideration","Amount"],["netamt","Net"]].map(([col,label])=>(
                      <th key={col} onClick={()=>txToggle(col)} style={{padding:"8px 11px",textAlign:"left",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:0.8,textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap",userSelect:"none",background:C.navy}}>
                        {label}<SortIcon dir={txSort.col===col?txSort.dir:null}/>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txSorted.slice(0,300).map((t,i)=>{
                    const tc=t.txtype==="BUY"?"success":t.txtype==="SELL"?"error":t.txtype==="Dividend"?"gold":t.txtype.includes("Fee")||t.txtype==="SR Fee"?"warning":"info";
                    return(
                      <tr key={i} style={{borderBottom:"0.5px solid "+C.silver,background:i%2=== 0 ?C.white:"#FAFBFC"}}>
                        <td style={{padding:"6px 11px",color:C.text,whiteSpace:"nowrap"}}>{t.tradedate}</td>
                        <td style={{padding:"6px 11px"}}><Badge color={tc}>{t.txtype}</Badge></td>
                        <td style={{padding:"6px 11px",fontFamily:"Space Grotesk,sans-serif",fontWeight:600,color:C.navy}}>{t.ticker}</td>
                        <td style={{padding:"6px 11px",color:C.text,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td>
                        <td style={{padding:"6px 11px"}}><Badge color={t.ccy==="GBP"?"navy":"info"}>{t.ccy}</Badge></td>
                        <td style={{padding:"6px 11px",textAlign:"right",color:C.text}}>{t.qty!== 0 ?fmt(Math.abs(t.qty),0):"--"}</td>
                        <td style={{padding:"6px 11px",textAlign:"right",fontWeight:600,color:C.navy}}>{fmt(t.consideration)}</td>
                        <td style={{padding:"6px 11px",textAlign:"right",color:posColor(t.netamt)}}>{fmt(t.netamt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {txSorted.length>300&&<div style={{padding:"8px 14px",fontSize:11,color:C.faint,borderTop:"0.5px solid "+C.silver}}>Showing 300 of {txSorted.length} rows -- use filters to narrow</div>}
          </div>
        </div>
      )}
      {tab==="risk"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14,marginBottom:14}}>
            <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase"}}>Risk profile</div>
                <Btn small variant="ghost" onClick={()=>setEditingRisk(true)}>Edit</Btn>
              </div>
              <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:14}}>
                <div style={{width:52,height:52,borderRadius:"50%",background:RISK_COLOURS[score]||C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontFamily:"Space Grotesk,sans-serif",fontSize:22,fontWeight:700,flexShrink:0}}>{score}</div>
                <div>
                  <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:16,fontWeight:600,color:C.navy}}>{RISK_LABELS[score]}</div>
                  <div style={{fontSize:11,color:C.faint,marginTop:2}}>Equity {RISK_MANDATES[score].equity[0]}-{RISK_MANDATES[score].equity[1]}% . FI {RISK_MANDATES[score].fi[0]}-{RISK_MANDATES[score].fi[1]}%</div>
                  <div style={{fontSize:11,color:C.faint}}>Reviewed: {(profile&&profile.reviewed)||"Never"}</div>
                </div>
              </div>
              <div style={{fontSize:12,color:C.text,lineHeight:1.6,fontStyle:"italic"}}>{(profile&&profile.notes)||"No suitability notes."}</div>
              <div style={{marginTop:14,paddingTop:14,borderTop:"0.5px solid "+C.silver}}>
                <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Compliance flags</div>
                {comp&&comp.flags&&comp.flags.length===0&&<div style={{color:C.green,fontSize:13,fontWeight:500}}>OK No breaches detected</div>}
                {comp&&comp.flags&&comp.flags.length>0&&comp.flags.map((f,fi)=>(
                  <div key={fi} style={{display:"flex",gap:8,marginBottom:6,padding:"7px 10px",background:f.type==="error"?C.redBg:C.amberBg,borderRadius:6}}>
                    <span>{f.type==="error"?"[R]":"[A]"}</span>
                    <span style={{fontSize:12,color:C.text,lineHeight:1.5}}>{f.msg}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:18}}>
              <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",marginBottom:14}}>Current vs mandate</div>
              {comp&&["Equity","Fixed Income","Cash","Commodity"].map(ac=>{
                const val=ac==="Equity"?comp.eqPct:ac==="Fixed Income"?comp.fiPct:ac==="Cash"?comp.cashPct:comp.comPct;
                const range=RISK_MANDATES[score][ac==="Equity"?"equity":ac==="Fixed Income"?"fi":ac==="Cash"?"cash":"commodity"];
                const breach=val<range[0]||val>range[1];
                return(
                  <div key={ac} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                      <span style={{fontWeight:breach?600:400,color:breach?C.red:C.navy}}>{ac}</span>
                      <span style={{color:breach?C.red:C.faint}}>{val}% <span style={{color:C.faint,fontSize:11}}>(mandate {range[0]}-{range[1]}%)</span></span>
                    </div>
                    <div style={{height:6,background:C.silver,borderRadius:3,position:"relative"}}>
                      <div style={{height:"100%",width:Math.min(val,100)+"%",background:breach?C.red:RISK_COLOURS[score]||C.teal,borderRadius:3}}/>
                      <div style={{position:"absolute",top:0,height:"100%",width:2,left:range[1]+"%",background:"rgba(0,0,0,0.15)",borderRadius:1}}/>
                    </div>
                  </div>
                );
              })}
              {comp&&(()=>{
                const total=holdings.reduce((s,h)=>s+convertAmount(h.value,h.ccy,selectedCcy),0);
                const trades=["Equity","Fixed Income","Cash","Commodity"].map(ac=>{
                  const cur=(comp.byClass[ac]||0);
                  const m=RISK_MANDATES[score][ac==="Equity"?"equity":ac==="Fixed Income"?"fi":ac==="Cash"?"cash":"commodity"];
                  const tgt=total*(m[0]+m[1])*0.005;
                  return {ac,diff:tgt-cur};
                }).filter(t=>Math.abs(t.diff)>500);
                if(trades.length===0) return <div style={{marginTop:14,color:C.green,fontSize:13,fontWeight:500}}>OK Portfolio within mandate -- no rebalance needed</div>;
                return(
                  <div style={{marginTop:14,paddingTop:14,borderTop:"0.5px solid "+C.silver}}>
                    <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Suggested trades</div>
                    {trades.map((t,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:t.diff>= 0 ?C.greenBg:C.redBg,borderRadius:6,marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:600,color:C.navy}}>{t.ac}</span>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <Badge color={t.diff>= 0 ?"success":"error"}>{t.diff>= 0 ?"BUY":"SELL"}</Badge>
                          <span style={{fontFamily:"Space Grotesk,sans-serif",fontWeight:700,fontSize:13,color:t.diff>= 0 ?C.green:C.red}}>{sym}{fmt(Math.abs(t.diff),0)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {tab==="crm"&&(
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 2fr",gap:14}}>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:18}}>
            <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Client profile</div>
            {[["Full name",client.name],["Email",client.email],["Phone",client.phone||"--"],["Address",client.address],["Jurisdiction",client.jurisdiction],["Client since",client.joined],["Status","Verified"]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"0.5px solid "+C.silver}}>
                <span style={{fontSize:12,color:C.faint}}>{l}</span>
                <span style={{fontSize:12,fontWeight:500,color:C.navy}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:"0.5px solid "+C.silver,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,fontWeight:600,color:C.navy}}>Communication log</div>
              <div style={{display:"flex",gap:6}}>
                <Btn small onClick={()=>setShowEmail(true)} variant="ghost">@ Email</Btn>
                <Btn small onClick={()=>setShowLog(true)} variant="secondary">+ Log</Btn>
              </div>
            </div>
            <div style={{padding:"0 16px"}}>
              {comms.map((c,i)=>(
                <div key={i} style={{padding:"12px 0",borderBottom:"0.5px solid "+C.silver}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
                    <div style={{display:"flex",gap:7,alignItems:"center"}}>
                      <Badge color={c.type==="email"?"info":c.type==="call"?"success":c.type==="meeting"?"gold":"navy"}>{c.type}</Badge>
                      <span style={{fontSize:13,fontWeight:600,color:C.navy}}>{c.subject}</span>
                    </div>
                    <span style={{fontSize:11,color:C.faint,whiteSpace:"nowrap"}}>{c.date}</span>
                  </div>
                  <div style={{fontSize:12,color:C.text,lineHeight:1.6}}>{c.summary}</div>
                  <div style={{fontSize:11,color:C.faint,marginTop:3}}>Logged by {c.user}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {showEmail&&<Modal title={"Email "+client.name} onClose={()=>setShowEmail(false)}>
        <div style={{fontSize:12,color:C.faint,marginBottom:14}}>To: {client.email}</div>
        <FldInput label="Subject" value={emailSubject} onChange={setEmailSubject} placeholder="e.g. Q2 Portfolio Review"/>
        <div style={{marginBottom:13}}><label style={{fontSize:11,fontWeight:600,color:C.text,display:"block",marginBottom:4}}>Message</label><textarea value={emailBody} onChange={e=>setEmailBody(e.target.value)} rows={5} style={{width:"100%",padding:"8px 11px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",resize:"vertical",boxSizing:"border-box"}}/></div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>setShowEmail(false)}>Cancel</Btn><Btn onClick={sendEmail}>Send</Btn></div>
      </Modal>}

      {showLog&&<Modal title="Log communication" onClose={()=>setShowLog(false)}>
        <FldSelect label="Type" value={logType} onChange={setLogType} options={[{value:"call",label:"Phone call"},{value:"email",label:"Email"},{value:"meeting",label:"Meeting"},{value:"note",label:"Internal note"}]}/>
        <div style={{marginBottom:13}}><label style={{fontSize:11,fontWeight:600,color:C.text,display:"block",marginBottom:4}}>Notes</label><textarea value={logNote} onChange={e=>setLogNote(e.target.value)} rows={4} style={{width:"100%",padding:"8px 11px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",resize:"vertical",boxSizing:"border-box"}}/></div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>setShowLog(false)}>Cancel</Btn><Btn onClick={logComm}>Save</Btn></div>
      </Modal>}

      {showWD&&<Modal title="Withdrawal request" onClose={()=>{setShowWD(false);setWdError("");}}>
        <div style={{background:C.navy,borderRadius:8,padding:"12px 16px",marginBottom:16,display:"flex",gap:12,alignItems:"center"}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:14,fontWeight:700}}>{initials}</div>
          <div><div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:14,fontWeight:600,color:C.white}}>{client.name}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.45)"}}>{client.id}</div></div>
        </div>
        <FldSelect label="Withdrawal type" value={wdType} onChange={setWdType} options={[
          {value:"PCLS",label:"PCLS -- Pension Commencement Lump Sum"},
          {value:"Regular Withdrawal",label:"Regular withdrawal"},
          {value:"Drawdown",label:"Drawdown"},
          {value:"Flexi-Access Drawdown",label:"Flexi-access drawdown"},
          {value:"UFPLS",label:"UFPLS -- Uncrystallised Fund Pension Lump Sum"},
          {value:"Full Surrender",label:"Full surrender"},
          {value:"Partial Surrender",label:"Partial surrender"},
          {value:"Ad Hoc",label:"Ad hoc withdrawal"},
        ]}/>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
          <FldInput label="Amount" value={wdAmount} onChange={setWdAmount} placeholder="5000.00" type="number"/>
          <FldSelect label="CCY" value={wdCcy} onChange={setWdCcy} options={[{value:"GBP",label:"GBP GBP"},{value:"USD",label:"USD $"},{value:"EUR",label:"EUR EUR"},{value:"CNY",label:"CNY CNY"}]}/>
        </div>
        <div style={{marginBottom:14}}><label style={{fontSize:11,fontWeight:600,color:C.text,display:"block",marginBottom:4}}>Notes (optional)</label><textarea value={wdNotes} onChange={e=>setWdNotes(e.target.value)} rows={3} placeholder="e.g. Transfer to Barclays account ending 4821" style={{width:"100%",padding:"8px 11px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",resize:"vertical",boxSizing:"border-box"}}/></div>
        <div style={{background:C.silver,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:C.text,lineHeight:1.7}}>Request will be logged with status <strong>Pending</strong> and written to the Google Sheets back-office log.</div>
        {wdError&&<div style={{background:C.amberBg,border:"1px solid "+C.gold,borderRadius:6,padding:"10px 12px",fontSize:12,color:C.amber,marginBottom:12}}>{wdError}</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>{setShowWD(false);setWdError("");}}>Cancel</Btn><Btn onClick={submitWithdrawal} variant="dark">{wdSubmitting?"Submitting...":"Submit request"}</Btn></div>
      </Modal>}

      {showDocs&&<Modal title={"Documents -- "+client.name} onClose={()=>setShowDocs(false)}>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
          {clientDocs.map(doc=>(
            <div key={doc.id} style={{display:"flex",gap:12,alignItems:"center",padding:"10px 14px",background:C.silver,borderRadius:8}}>
              <span style={{fontSize:22,flexShrink:0}}>{typeIcon[doc.type]||"Doc"}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:C.navy}}>{doc.name}</div>
                <div style={{display:"flex",gap:6,marginTop:4}}><Badge color={typeColour[doc.type]||"info"}>{doc.type}</Badge></div>
                <div style={{fontSize:11,color:C.faint,marginTop:3}}>{doc.date} . {doc.size} . {doc.uploader}</div>
              </div>
              <Btn small variant="ghost">View</Btn>
            </div>
          ))}
          {clientDocs.length===0&&<div style={{textAlign:"center",padding:20,color:C.faint,fontSize:13}}>No documents uploaded yet.</div>}
        </div>
        <div style={{borderTop:"0.5px solid "+C.silver,paddingTop:14,display:"flex",justifyContent:"flex-end",gap:8}}>
          <Btn variant="secondary" onClick={()=>setShowDocs(false)}>Close</Btn>
          <Btn variant="primary">+ Upload document</Btn>
        </div>
      </Modal>}

      {editingRisk&&<Modal title="Edit risk profile" onClose={()=>setEditingRisk(false)}>
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:14,fontWeight:600,color:C.navy,marginBottom:14}}>{client.name}</div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:11,fontWeight:600,color:C.text,display:"block",marginBottom:6}}>Risk score: <strong>{editScore} -- {RISK_LABELS[editScore]}</strong></label>
          <input type="range" min={1} max={10} value={editScore} onChange={e=>setEditScore(+e.target.value)} style={{width:"100%"}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.faint,marginTop:4}}><span>1 Very Cautious</span><span>5 Moderate</span><span>10 Speculative</span></div>
        </div>
        <div style={{background:C.silver,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.text,marginBottom:14}}>
          Mandate: Equity {RISK_MANDATES[editScore].equity[0]}-{RISK_MANDATES[editScore].equity[1]}% . Fixed Income {RISK_MANDATES[editScore].fi[0]}-{RISK_MANDATES[editScore].fi[1]}% . Cash max {RISK_MANDATES[editScore].cash[1]}%
        </div>
        <div style={{marginBottom:14}}><label style={{fontSize:11,fontWeight:600,color:C.text,display:"block",marginBottom:4}}>Suitability notes</label><textarea value={editNotes} onChange={e=>setEditNotes(e.target.value)} rows={4} style={{width:"100%",padding:"8px 11px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",resize:"vertical",boxSizing:"border-box"}}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn variant="secondary" onClick={()=>setEditingRisk(false)}>Cancel</Btn>
          <Btn onClick={()=>{setRiskProfiles({...riskProfiles,[clientId]:{...profile,score:editScore,notes:editNotes,reviewed:new Date().toISOString().slice(0,10)}});setEditingRisk(false);}}>Save</Btn>
        </div>
      </Modal>}
    </div>
  );
};


const ClientsList=({selectedClient,setSelectedClient,selectedCcy,setPreviewClientId})=>{
  const [search,setSearch]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [clients,setClients]=useState(CLIENTS);
  const [newC,setNewC]=useState({name:"",email:"",address:"",jurisdiction:"US"});
  const sym=CCY_SYMBOLS[selectedCcy]||"$";
  if(selectedClient) return <ClientDetail clientId={selectedClient} onBack={()=>setSelectedClient(null)} selectedCcy={selectedCcy} setPreviewClientId={setPreviewClientId}/>;
  const filtered=clients.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())||c.email.toLowerCase().includes(search.toLowerCase())||c.id.includes(search));
  const addClient=()=>{const id="C00"+Date.now().toString().slice(-6);setClients([...clients,{...newC,id,code:(id.slice(1)+"-"+(newC.name.split(" ")[1]||"New")),verified:false,phone:"",joined:new Date().toISOString().slice(0,10)}]);setShowAdd(false);setNewC({name:"",email:"",address:"",jurisdiction:"US"});};
  return(
    <div style={{padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div><div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>CRM</div><div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>Clients</div></div>
        <div style={{display:"flex",gap:7}}><Btn variant="secondary">^ Upload CSV</Btn><Btn onClick={()=>setShowAdd(true)}>+ Add client</Btn></div>
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, email or ID..." style={{width:"100%",padding:"9px 13px",border:"1.5px solid "+C.silver,borderRadius:7,fontSize:13,fontFamily:"'Inter',sans-serif",marginBottom:14,boxSizing:"border-box",outline:"none"}}/>
      <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:C.silver}}>{["Client","ID","Email","Jurisdiction","Verified","Portfolio","P&L",""].map(h=><th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map((c,i)=>{const t=clientTotals(c.id,selectedCcy);return(
              <tr key={c.id} style={{borderBottom:"0.5px solid "+C.silver,background:i%2=== 0 ?C.white:"#FAFBFC",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=C.tealLight} onMouseLeave={e=>e.currentTarget.style.background=i%2=== 0 ?C.white:"#FAFBFC"}>
                <td style={{padding:"11px 14px"}}><div style={{display:"flex",gap:9,alignItems:"center"}}><div style={{width:33,height:33,borderRadius:"50%",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:12,fontWeight:700,flexShrink:0}}>{c.name.split(" ").map(n=>n[0]).join("")}</div><div><div style={{fontSize:13,fontWeight:600,color:C.navy}}>{c.name}</div><div style={{fontSize:11,color:C.faint}}>{c.address}</div></div></div></td>
                <td style={{padding:"11px 14px",fontFamily:"monospace",fontSize:11,color:C.faint}}>{c.id}</td>
                <td style={{padding:"11px 14px",fontSize:12,color:C.text}}>{c.email}</td>
                <td style={{padding:"11px 14px"}}><Badge color="navy">{c.jurisdiction}</Badge></td>
                <td style={{padding:"11px 14px"}}><Badge color={c.verified?"success":"warning"}>{c.verified?"Yes":"No"}</Badge></td>
                <td style={{padding:"11px 14px",fontFamily:"Space Grotesk,sans-serif",fontWeight:600,color:C.navy}}>{sym}{fmt(t.totalValue,0)}</td>
                <td style={{padding:"11px 14px",fontWeight:600,color:posColor(t.pl)}}>{sign(t.pl)}{sym}{fmt(Math.abs(t.pl),0)}</td>
                <td style={{padding:"11px 14px"}}><Btn small variant="ghost" onClick={()=>setSelectedClient(c.id)}>View &gt;</Btn></td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
      {showAdd&&<Modal title="Add client" onClose={()=>setShowAdd(false)}><FldInput label="Full name" value={newC.name} onChange={v=>setNewC({...newC,name:v})} placeholder="Jane Smith"/><FldInput label="Email" value={newC.email} onChange={v=>setNewC({...newC,email:v})} placeholder="jane@example.com"/><FldInput label="Address" value={newC.address} onChange={v=>setNewC({...newC,address:v})} placeholder="1 Main Street"/><FldSelect label="Jurisdiction" value={newC.jurisdiction} onChange={v=>setNewC({...newC,jurisdiction:v})} options={[{value:"US",label:"United States"},{value:"UK",label:"United Kingdom"},{value:"EU",label:"European Union"},{value:"Other",label:"Other"}]}/><div style={{display:"flex",gap:7,justifyContent:"flex-end",marginTop:6}}><Btn variant="secondary" onClick={()=>setShowAdd(false)}>Cancel</Btn><Btn onClick={addClient}>Add client</Btn></div></Modal>}
    </div>
  );
};

// --- TRANSACTIONS (ALL 1283) ---------------------------------------
const Transactions=({selectedCcy})=>{
  const sym=CCY_SYMBOLS[selectedCcy]||"$";
  const [showAdd,setShowAdd]=useState(false);
  const [extraTxns,setExtraTxns]=useState([]);
  const [newTxn,setNewTxn]=useState({clientId:"",txtype:"BUY",ticker:"",description:"",ccy:"USD",qty:"",consideration:"",netamt:""});
  const allTxns=[...TXNS,...extraTxns];
  const {result,sort,toggleSort,filters,setFilter,search,setSearch}=useSortFilter(allTxns,{col:"tradedate",dir:"desc"});

  const txTypes=[...new Set(allTxns.map(t=>t.txtype))].sort();
  const clientNames=[...new Set(allTxns.map(t=>t.clientId))];
  const selectors=["Trade","Cashflow","Dividend","CorpAct"];

  const addTxn=()=>{
    const client=CLIENTS.find(c=>c.id===newTxn.clientId);
    setExtraTxns([{...newTxn,id:Date.now(),selector:"Cashflow",tradedate:new Date().toISOString().slice(0,10),settdate:new Date().toISOString().slice(0,10),clientName:(client&&client.name)||"",qty:parseFloat(newTxn.qty)||0,consideration:parseFloat(newTxn.consideration)||0,netamt:parseFloat(newTxn.netamt)||0,costprice:0,costvalue:0},...extraTxns]);
    setShowAdd(false);setNewTxn({clientId:"",txtype:"BUY",ticker:"",description:"",ccy:"USD",qty:"",consideration:"",netamt:""});
  };

  return(
    <div style={{padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>Data</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>All transactions</div>
          <div style={{fontSize:12,color:C.faint,marginTop:2}}>{allTxns.length.toLocaleString()} records . Trades, Dividends, Cashflows, FX, Fees, Deposits, Withdrawals</div>
        </div>
        <div style={{display:"flex",gap:7}}><Btn variant="secondary">^ Upload CSV</Btn><Btn onClick={()=>setShowAdd(true)}>+ Add transaction</Btn></div>
      </div>

      <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:"0.5px solid "+C.silver,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",background:"#FAFBFC"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Search descriptions, tickers, refs..." style={{flex:1,minWidth:200,padding:"6px 10px",border:"1.5px solid "+C.silver,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
          <select onChange={e=>setFilter("clientId",e.target.value)} style={{padding:"6px 9px",border:"1.5px solid "+C.silver,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none",color:C.navy,background:C.white}}>
            <option value="all">All clients</option>
            {CLIENTS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select onChange={e=>setFilter("selector",e.target.value)} style={{padding:"6px 9px",border:"1.5px solid "+C.silver,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none",color:C.navy,background:C.white}}>
            <option value="all">All categories</option>
            {selectors.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <select onChange={e=>setFilter("txtype",e.target.value)} style={{padding:"6px 9px",border:"1.5px solid "+C.silver,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none",color:C.navy,background:C.white}}>
            <option value="all">All types</option>
            {txTypes.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <select onChange={e=>setFilter("ccy",e.target.value)} style={{padding:"6px 9px",border:"1.5px solid "+C.silver,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none",color:C.navy,background:C.white}}>
            <option value="all">All CCY</option>
            <option value="GBP">GBP</option><option value="USD">USD</option>
          </select>
          <span style={{fontSize:12,color:C.faint,whiteSpace:"nowrap"}}>{result.length.toLocaleString()} of {allTxns.length.toLocaleString()}</span>
        </div>

        <div style={{overflowX:"auto",maxHeight:600,overflowY:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead style={{position:"sticky",top:0,zIndex:5}}>
              <tr style={{background:C.navy}}>
                {[["tradedate","Trade Date"],["settdate","Sett Date"],["clientId","Client"],["selector","Category"],["txtype","Type"],["ticker","Ticker"],["description","Description"],["ccy","CCY"],["qty","Qty"],["consideration","Consideration"],["netamt","Net Amt"],["costprice","Cost Price"],["costvalue","Cost Value"]].map(([col,label])=>(
                  <th key={col} onClick={()=>toggleSort(col)} style={{padding:"8px 10px",textAlign:"left",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:0.8,textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap",userSelect:"none",position:"sticky",top:0,background:C.navy}}>
                    {label}<SortIcon dir={sort.col===col?sort.dir:null}/>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.slice(0,600).map((t,i)=>{
                const typeColor=t.txtype==="BUY"?"success":t.txtype==="SELL"?"error":t.txtype==="Dividend"?"gold":t.txtype.includes("Fee")||t.txtype==="SR Fee"?"warning":t.txtype==="Deposit"?"up":t.txtype==="Withdrawal"?"down":t.txtype.includes("FX")?"navy":"info";
                const clientName=(CLIENTS.find(c=>c.id===t.clientId)||{name:t.clientId}).name.split(" ")[0];
                return(
                  <tr key={t.id||i} style={{borderBottom:"0.5px solid "+C.silver,background:i%2=== 0 ?C.white:"#FAFBFC"}}>
                    <td style={{padding:"6px 10px",color:C.text,whiteSpace:"nowrap"}}>{t.tradedate}</td>
                    <td style={{padding:"6px 10px",color:C.faint,whiteSpace:"nowrap"}}>{t.settdate}</td>
                    <td style={{padding:"6px 10px",fontSize:11,fontWeight:500,color:C.navy,whiteSpace:"nowrap"}}>{clientName}</td>
                    <td style={{padding:"6px 10px"}}><Badge color="navy">{t.selector}</Badge></td>
                    <td style={{padding:"6px 10px"}}><Badge color={typeColor}>{t.txtype}</Badge></td>
                    <td style={{padding:"6px 10px",fontFamily:"Space Grotesk,sans-serif",fontWeight:600,color:C.navy,whiteSpace:"nowrap"}}>{t.ticker}</td>
                    <td style={{padding:"6px 10px",color:C.text,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td>
                    <td style={{padding:"6px 10px"}}><Badge color={t.ccy==="GBP"?"navy":"info"}>{t.ccy}</Badge></td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.text}}>{t.qty!== 0 ?fmt(Math.abs(t.qty),4):"--"}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600,color:C.navy}}>{fmt(t.consideration)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:posColor(t.netamt),fontWeight:500}}>{fmt(t.netamt)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.faint}}>{t.costprice!== 0 ?fmt(t.costprice,4):"--"}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.faint}}>{t.costvalue!== 0 ?fmt(t.costvalue):"--"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {result.length>600&&<div style={{padding:"9px 14px",fontSize:11,color:C.faint,borderTop:"0.5px solid "+C.silver,background:"#FAFBFC"}}>Showing 600 of {result.length} matching rows. Use filters or search to narrow results.</div>}
      </div>

      {showAdd&&<Modal title="Add transaction" onClose={()=>setShowAdd(false)}>
        <FldSelect label="Client" value={newTxn.clientId} onChange={v=>setNewTxn({...newTxn,clientId:v})} options={[{value:"",label:"Select client..."}, ...CLIENTS.map(c=>({value:c.id,label:c.name}))]}/>
        <FldSelect label="Type" value={newTxn.txtype} onChange={v=>setNewTxn({...newTxn,txtype:v})} options={["BUY","SELL","Dividend","Fee","SR Fee","FX Deposit","FX Withdrawal","Deposit","Withdrawal"].map(v=>({value:v,label:v}))}/>
        <FldInput label="Ticker" value={newTxn.ticker} onChange={v=>setNewTxn({...newTxn,ticker:v})} placeholder="e.g. VTI"/>
        <FldInput label="Description" value={newTxn.description} onChange={v=>setNewTxn({...newTxn,description:v})} placeholder="e.g. Advisory Fee June 2024"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <FldInput label="Qty" value={newTxn.qty} onChange={v=>setNewTxn({...newTxn,qty:v})} placeholder="100" type="number"/>
          <FldInput label="Consideration" value={newTxn.consideration} onChange={v=>setNewTxn({...newTxn,consideration:v})} placeholder="5000.00" type="number"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <FldInput label="Net Amount" value={newTxn.netamt} onChange={v=>setNewTxn({...newTxn,netamt:v})} placeholder="-5000.00" type="number"/>
          <FldSelect label="CCY" value={newTxn.ccy} onChange={v=>setNewTxn({...newTxn,ccy:v})} options={[{value:"USD",label:"USD"},{value:"GBP",label:"GBP"}]}/>
        </div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>setShowAdd(false)}>Cancel</Btn><Btn onClick={addTxn}>Add</Btn></div>
      </Modal>}
    </div>
  );
};

// --- PRICING -------------------------------------------------------
const PRICES=[
  {ticker:"AGBP",name:"iShares Core Glb Agg GBP-H D",ccy:"GBP",price:4.522,type:"ETF"},
  {ticker:"ERNS",name:"iShares GBP Ultrashort Bond",ccy:"GBP",price:102.93,type:"ETF"},
  {ticker:"EMIM",name:"iShares Core EM IMI ACC",ccy:"GBP",price:24.16,type:"ETF"},
  {ticker:"EUXS",name:"iShares MSCI Europe Ex-UK GBP-H",ccy:"GBP",price:6.673,type:"ETF"},
  {ticker:"GSPX",name:"iShares Core S&P 500 GBP-H D",ccy:"GBP",price:7.872,type:"ETF"},
  {ticker:"XGIG",name:"Invesco Global HY Corp Bond",ccy:"GBP",price:27.05,type:"ETF"},
  {ticker:"IS15",name:"iShares GBP Corp Bond 0-5Yr",ccy:"GBP",price:99.31,type:"ETF"},
  {ticker:"CUKX",name:"iShares Core FTSE 100 ACC",ccy:"GBP",price:141.46,type:"ETF"},
  {ticker:"IJPH",name:"iShares MSCI Japan GBP-H",ccy:"GBP",price:92.39,type:"ETF"},
  {ticker:"CSH2",name:"Lyxor Smart Cash",ccy:"GBP",price:1097.82,type:"MMF"},
  {ticker:"GILS",name:"Lyxor Core UK Govt Bond",ccy:"GBP",price:103.39,type:"ETF"},
  {ticker:"VGOV",name:"Vanguard UK Gilt",ccy:"GBP",price:19.03,type:"ETF"},
  {ticker:"VTI",name:"Vanguard Total Stock Market",ccy:"USD",price:204.14,type:"ETF"},
  {ticker:"VWO",name:"Vanguard FTSE Emerging Markets",ccy:"USD",price:39.89,type:"ETF"},
  {ticker:"VPL",name:"Vanguard FTSE Pacific",ccy:"USD",price:68.96,type:"ETF"},
  {ticker:"VCSH",name:"Vanguard Short-Term Corp Bond",ccy:"USD",price:76.25,type:"ETF"},
  {ticker:"SCHP",name:"Schwab US TIPS ETF",ccy:"USD",price:53.26,type:"ETF"},
  {ticker:"SCHO",name:"Schwab Short-Term US Treasury",ccy:"USD",price:48.74,type:"ETF"},
  {ticker:"DBEU",name:"Xtrackers MSCI Europe Hedged",ccy:"USD",price:37.64,type:"ETF"},
  {ticker:"BNDX",name:"Vanguard Total Intl Bond ETF",ccy:"USD",price:50.13,type:"ETF"},
  {ticker:"VAPX",name:"Vanguard FTSE Asia Pacific",ccy:"USD",price:19.93,type:"ETF"},
  {ticker:"ARKK",name:"ARK Innovation ETF",ccy:"USD",price:50.17,type:"ETF"},
  {ticker:"SGOV",name:"iShares 0-3M Treasury Bond",ccy:"USD",price:100.39,type:"ETF"},
  {ticker:"LGLV",name:"SPDR US Large Cap Low Vol",ccy:"USD",price:145.59,type:"ETF"},
  {ticker:"VYM",name:"Vanguard High Dividend Yield",ccy:"USD",price:107.74,type:"ETF"},
  {ticker:"IAU",name:"iShares Gold Trust",ccy:"USD",price:38.32,type:"Commodity"},
  {ticker:"GBPUSD",name:"GBP/USD",ccy:"USD",price:1.2618,type:"FX"},
  {ticker:"GBPEUR",name:"GBP/EUR",ccy:"EUR",price:1.16028,type:"FX"},
  {ticker:"EURUSD",name:"EUR/USD",ccy:"USD",price:1.0875,type:"FX"},
  {ticker:"USDGBP",name:"USD/GBP",ccy:"GBP",price:0.79252,type:"FX"},
];

const Pricing=({selectedCcy})=>{
  const [prices,setPrices]=useState(PRICES);
  const [showAdd,setShowAdd]=useState(false);
  const [search,setSearch]=useState("");
  const [newP,setNewP]=useState({ticker:"",name:"",ccy:"USD",price:"",type:"ETF"});
  const sym=CCY_SYMBOLS[selectedCcy]||"$";
  const {result,sort,toggleSort}=useSortFilter(prices.filter(p=>p.ticker.toLowerCase().includes(search.toLowerCase())||p.name.toLowerCase().includes(search.toLowerCase())),{col:"ticker",dir:"asc"});

  return(
    <div style={{padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div><div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>Market data</div><div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>Price file</div></div>
        <div style={{display:"flex",gap:7}}><Btn variant="secondary">^ Upload CSV</Btn><Btn onClick={()=>setShowAdd(true)}>+ Add price</Btn></div>
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ticker or name..." style={{width:"100%",padding:"9px 13px",border:"1.5px solid "+C.silver,borderRadius:7,fontSize:13,fontFamily:"'Inter',sans-serif",marginBottom:14,boxSizing:"border-box",outline:"none"}}/>
      <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:C.navy}}>
            {[["ticker","Ticker"],["name","Name"],["ccy","CCY"],["type","Type"],["price","Price"]].map(([col,label])=>(
              <th key={col} onClick={()=>toggleSort(col)} style={{padding:"9px 14px",textAlign:"left",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:1,textTransform:"uppercase",cursor:"pointer",userSelect:"none"}}>
                {label}<SortIcon dir={sort.col===col?sort.dir:null}/>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {result.map((p,i)=>(
              <tr key={i} style={{borderBottom:"0.5px solid "+C.silver,background:i%2=== 0 ?C.white:"#FAFBFC"}}>
                <td style={{padding:"9px 14px",fontFamily:"Space Grotesk,sans-serif",fontWeight:600,color:C.navy}}>{p.ticker}</td>
                <td style={{padding:"9px 14px",color:C.text}}>{p.name}</td>
                <td style={{padding:"9px 14px"}}><Badge color={p.ccy==="GBP"?"navy":p.type==="FX"?"gold":"info"}>{p.ccy}</Badge></td>
                <td style={{padding:"9px 14px"}}><Badge color="info">{p.type}</Badge></td>
                <td style={{padding:"9px 14px",fontFamily:"Space Grotesk,sans-serif",fontWeight:600,color:C.navy,textAlign:"right"}}>
                  {p.type==="FX" ? fmt(p.price,5) : (p.ccy==="GBP"?"GBP":"$")+fmt(p.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd&&<Modal title="Add price" onClose={()=>setShowAdd(false)}>
        <FldInput label="Ticker" value={newP.ticker} onChange={v=>setNewP({...newP,ticker:v})} placeholder="e.g. VWRL"/>
        <FldInput label="Name" value={newP.name} onChange={v=>setNewP({...newP,name:v})} placeholder="e.g. Vanguard FTSE All-World"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <FldSelect label="CCY" value={newP.ccy} onChange={v=>setNewP({...newP,ccy:v})} options={[{value:"USD",label:"USD"},{value:"GBP",label:"GBP"},{value:"EUR",label:"EUR"}]}/>
          <FldSelect label="Type" value={newP.type} onChange={v=>setNewP({...newP,type:v})} options={["ETF","Stock","Bond","MMF","Commodity","FX"].map(v=>({value:v,label:v}))}/>
        </div>
        <FldInput label="Price" value={newP.price} onChange={v=>setNewP({...newP,price:v})} placeholder="99.31" type="number"/>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>setShowAdd(false)}>Cancel</Btn><Btn onClick={()=>{setPrices([...prices,{...newP,price:parseFloat(newP.price)}]);setShowAdd(false);setNewP({ticker:"",name:"",ccy:"USD",price:"",type:"ETF"});}}>Add price</Btn></div>
      </Modal>}
    </div>
  );
};

// --- VALUATIONS ----------------------------------------------------
const Valuations=({setSection,setSelectedClient,selectedCcy})=>{
  const sym=CCY_SYMBOLS[selectedCcy]||"$";
  const rows=CLIENTS.map(c=>{
    const t=clientTotals(c.id,selectedCcy);
    const hs=HOLDINGS[c.id]||[];
    return{...c,...t,equityVal:hs.filter(h=>!h.isCash).reduce((s,h)=>s+convertAmount(h.value,h.ccy,selectedCcy),0),cashVal:hs.filter(h=>h.isCash).reduce((s,h)=>s+convertAmount(h.value,h.ccy,selectedCcy),0),positions:hs.filter(h=>!h.isCash).length};
  });
  const totalAUM=rows.reduce((s,r)=>s+r.totalValue,0);
  const totalCost=rows.reduce((s,r)=>s+r.totalCost,0);
  const totalPL=totalAUM-totalCost;

  return(
    <div style={{padding:24}}>
      <div style={{marginBottom:18}}><div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>Calculated</div><div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>Valuations <span style={{fontSize:14,fontWeight:400,color:C.faint}}>in {selectedCcy}</span></div></div>
      <div style={{background:C.navy,borderRadius:10,padding:"18px 22px",marginBottom:14,display:"flex",gap:32,alignItems:"center",flexWrap:"wrap"}}>
        <div><div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:4}}>Total AUM</div><div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:30,fontWeight:700,color:C.white}}>{sym}{fmt(totalAUM,0)}</div></div>
        <div style={{height:40,width:1,background:"rgba(255,255,255,0.1)"}}/>
        <div><div style={{fontSize:10,color:"rgba(255,255,255,0.38)",marginBottom:2}}>Cost basis</div><div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:18,fontWeight:600,color:"rgba(255,255,255,0.7)"}}>{sym}{fmt(totalCost,0)}</div></div>
        <div><div style={{fontSize:10,color:"rgba(255,255,255,0.38)",marginBottom:2}}>Total P&L</div><div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:18,fontWeight:600,color:totalPL>= 0 ?"#34D399":"#F87171"}}>{sign(totalPL)}{sym}{fmt(Math.abs(totalPL),0)}</div></div>
        <div><div style={{fontSize:10,color:"rgba(255,255,255,0.38)",marginBottom:2}}>Return</div><div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:18,fontWeight:600,color:totalPL>= 0 ?"#34D399":"#F87171"}}>{pct(calcPct(totalCost,totalAUM))}</div></div>
      </div>
      <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden",marginBottom:16}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:C.navy}}>{["Client","Equity Value","Cash Value","Total Value","Cost Basis","P&L","Return","Positions",""].map(h=><th key={h} style={{padding:"9px 13px",textAlign:"left",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:"0.5px solid "+C.silver,background:i%2=== 0 ?C.white:"#FAFBFC"}}>
                <td style={{padding:"11px 13px"}}><div style={{fontSize:13,fontWeight:600,color:C.navy}}>{r.name}</div><div style={{fontSize:10,color:C.faint}}>{r.id}</div></td>
                <td style={{padding:"11px 13px",textAlign:"right",color:C.text}}>{sym}{fmt(r.equityVal,0)}</td>
                <td style={{padding:"11px 13px",textAlign:"right",color:C.faint}}>{sym}{fmt(r.cashVal,0)}</td>
                <td style={{padding:"11px 13px",textAlign:"right",fontFamily:"Space Grotesk,sans-serif",fontWeight:700,color:C.navy,fontSize:14}}>{sym}{fmt(r.totalValue,0)}</td>
                <td style={{padding:"11px 13px",textAlign:"right",color:C.text}}>{sym}{fmt(r.totalCost,0)}</td>
                <td style={{padding:"11px 13px",textAlign:"right",fontWeight:600,color:posColor(r.pl)}}>{sign(r.pl)}{sym}{fmt(Math.abs(r.pl),0)}</td>
                <td style={{padding:"11px 13px",textAlign:"right",fontWeight:600,color:posColor(r.pctReturn)}}>{pct(r.pctReturn)}</td>
                <td style={{padding:"11px 13px",textAlign:"right",color:C.text}}>{r.positions}</td>
                <td style={{padding:"11px 13px"}}><Btn small variant="ghost" onClick={()=>{setSelectedClient(r.id);setSection("clients");}}>Detail &gt;</Btn></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr style={{background:C.navy}}>
            <td style={{padding:"10px 13px",color:C.white,fontWeight:600}}>Total</td>
            <td style={{padding:"10px 13px",textAlign:"right",color:"rgba(255,255,255,0.5)"}}>{sym}{fmt(rows.reduce((s,r)=>s+r.equityVal,0),0)}</td>
            <td style={{padding:"10px 13px",textAlign:"right",color:"rgba(255,255,255,0.38)"}}>{sym}{fmt(rows.reduce((s,r)=>s+r.cashVal,0),0)}</td>
            <td style={{padding:"10px 13px",textAlign:"right",color:C.white,fontFamily:"Space Grotesk,sans-serif",fontWeight:700,fontSize:15}}>{sym}{fmt(totalAUM,0)}</td>
            <td style={{padding:"10px 13px",textAlign:"right",color:"rgba(255,255,255,0.5)"}}>{sym}{fmt(totalCost,0)}</td>
            <td style={{padding:"10px 13px",textAlign:"right",color:totalPL>= 0 ?"#34D399":"#F87171",fontWeight:700}}>{sign(totalPL)}{sym}{fmt(Math.abs(totalPL),0)}</td>
            <td style={{padding:"10px 13px",textAlign:"right",color:totalPL>= 0 ?"#34D399":"#F87171",fontWeight:600}}>{pct(calcPct(totalCost,totalAUM))}</td>
            <td colSpan={2}/>
          </tr></tfoot>
        </table>
      </div>
      <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Top positions (all clients)</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:9}}>
        {Object.entries(HOLDINGS).flatMap(([cid,hs])=>hs.filter(h=>!h.isCash).map(h=>({...h,client:(CLIENTS.find(c=>c.id===cid)||{name:cid}).name.split(" ")[0],convVal:convertAmount(h.value,h.ccy,selectedCcy)}))).sort((a,b)=>b.convVal-a.convVal).slice(0,8).map((h,i)=>(
          <div key={i} style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:8,padding:"13px 15px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontFamily:"Space Grotesk,sans-serif",fontWeight:700,color:C.navy,fontSize:14}}>{h.ticker}</span><Badge color={h.ccy==="GBP"?"navy":"info"}>{h.ccy}</Badge></div>
            <div style={{fontSize:11,color:C.faint,marginBottom:7,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</div>
            <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:17,fontWeight:600,color:C.navy}}>{sym}{fmt(h.convVal,0)}</div>
            <div style={{fontSize:11,color:C.faint,marginTop:1}}>{h.client}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- NEWS (Bloomberg feed) -----------------------------------------
const News=()=>{
  const isMobile=useIsMobile();
  const [ticker,setTicker]=useState("all");
  const {livePrices,liveNews,marketStatus,lastUpdated,refresh}=useMarketData();
  const [refreshing,setRefreshing]=useState(false);

  const handleRefresh=async()=>{
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const sourceLabel = marketStatus==="yahoo"?"Yahoo Finance . Live" : marketStatus==="alphavantage"?"Alpha Vantage . Live" : marketStatus==="bloomberg"?"Bloomberg . Live" : "Static data . No API key configured";
  const sourceColor = marketStatus==="static"?C.amber:C.teal;

  // Use live news if available, otherwise use static
  const newsItems = (liveNews && liveNews.length>0) ? liveNews : BLOOMBERG_NEWS;
  const allTickers=["all","FTSE","SPX","GBP","EMIM","GSPX","GILTS","XAU","NKY"];
  const filtered=ticker==="all"?newsItems:newsItems.filter(n=>n.tag===ticker||n.category.includes(ticker));

  // Build indices from live prices or static
  const getIndexValue = (symbol, staticValue, staticPct) => {
    if (livePrices && livePrices[symbol]) {
      const d = livePrices[symbol];
      return { value: d.price, pct: d.changePct, direction: d.changePct>= 0 ?"up":"down" };
    }
    return { value: staticValue, pct: staticPct, direction: staticPct>= 0 ?"up":"down" };
  };

  const indices = [
    {...getIndexValue("^GSPC",5312.8,+0.35), name:"S&P 500",    ticker:"SPX"},
    {...getIndexValue("^FTSE",8247.3,-0.15), name:"FTSE 100",   ticker:"UKX"},
    {...getIndexValue("^STOXX50E",4921.6,+0.64), name:"Euro Stoxx", ticker:"SX5E"},
    {...getIndexValue("^N225",38842.0,+1.09), name:"Nikkei 225", ticker:"NKY"},
    {...getIndexValue("^HSI",18452.1,-0.48), name:"Hang Seng",   ticker:"HSI"},
  ];

  // Build risers/fallers from live prices for portfolio tickers
  const portfolioTickers = ["ARKK","EMIM","VAPX","IAU","GSPX","DBEU","LGLV","CUKX","VYM","IJPH"];
  const portfolioMoves = portfolioTickers.map(t=>{
    const yahooSym = TICKER_MAP[t];
    const live = livePrices && (livePrices[yahooSym]||livePrices[t]);
    if (live && live.changePct !== undefined) {
      return {ticker:t, name:(PRICES.find(p=>p.ticker===t)||{name:t}).name, pct:live.changePct, change:live.change};
    }
    return null;
  }).filter(Boolean);

  const risers = portfolioMoves.length>0 ? [...portfolioMoves].sort((a,b)=>b.pct-a.pct).slice(0,5)
    : MARKET_DATA.risers;
  const fallers = portfolioMoves.length>0 ? [...portfolioMoves].sort((a,b)=>a.pct-b.pct).slice(0,5)
    : MARKET_DATA.fallers;

  // FX rates from live or static
  const getFX = (sym, staticRate) => {
    if (livePrices && livePrices[sym]) return livePrices[sym].price;
    return staticRate;
  };
  const fxRates = [
    {pair:"GBP/USD", rate:getFX("GBPUSD=X",1.2618), change:+0.0042},
    {pair:"GBP/EUR", rate:getFX("GBPEUR=X",1.1603), change:-0.0021},
    {pair:"EUR/USD", rate:getFX("EURUSD=X",1.0875), change:+0.0031},
    {pair:"USD/CNY", rate:getFX("USDCNY=X",7.2400), change:-0.0120},
  ];

  return(
    <div style={{padding:isMobile?"12px 10px":24}}>
      <div style={{marginBottom:isMobile?12:18}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3,flexWrap:"wrap"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:sourceColor}}/>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:sourceColor,textTransform:"uppercase"}}>{sourceLabel}</div>
          {lastUpdated&&<div style={{fontSize:10,color:C.faint}}>Updated {lastUpdated.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</div>}
          <button onClick={handleRefresh} style={{background:"none",border:"1px solid "+C.silver,borderRadius:5,padding:"2px 8px",fontSize:11,cursor:"pointer",color:C.faint,fontFamily:"'Inter',sans-serif"}}>{refreshing?"Refreshing...":"Refresh Refresh"}</button>
        </div>
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?18:22,fontWeight:600,color:C.navy}}>Market News and Intelligence</div>
        {marketStatus==="static"&&(
          <div style={{marginTop:8,background:C.amberBg,border:"1px solid "+C.gold,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.amber}}>
            <strong>No live data source connected.</strong> Add a Yahoo Finance RapidAPI key or Alpha Vantage key in <code>MARKET_CONFIG</code> (top of App.jsx) to enable live prices and news.
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"2fr 1fr",gap:isMobile?10:16,marginBottom:16}}>
        <div>
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {allTickers.map(t=>(
              <button key={t} onClick={()=>setTicker(t)} style={{background:ticker===t?C.navy:C.white,color:ticker===t?C.white:C.text,border:"0.5px solid "+(ticker===t?C.navy:C.silver),borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:ticker===t?600:400,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
                {t==="all"?"All":t}
              </button>
            ))}
          </div>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"10px 16px",borderBottom:"0.5px solid "+C.silver,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFBFC"}}>
              <div style={{fontSize:12,fontWeight:600,color:C.navy}}>Headlines</div>
              <div style={{fontSize:11,color:C.faint}}>{filtered.length} articles</div>
            </div>
            {filtered.length=== 0 ?(
              <div style={{padding:32,textAlign:"center",color:C.faint,fontSize:13}}>No articles for this filter.</div>
            ):filtered.map((n,i)=>(
              <div key={n.id||i} style={{padding:"14px 16px",borderBottom:"0.5px solid "+C.silver,display:"flex",gap:14,alignItems:"flex-start"}}>
                <div style={{fontSize:11,color:C.faint,whiteSpace:"nowrap",minWidth:38}}>{n.time||"--"}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:7,marginBottom:5,flexWrap:"wrap"}}>
                    <Badge color="navy">{n.category}</Badge>
                    <Badge color={n.tag==="LIVE"?"success":"info"}>{n.tag}</Badge>
                  </div>
                  <div style={{fontSize:13,fontWeight:500,color:C.navy,lineHeight:1.5}}>{n.headline}</div>
                  <div style={{fontSize:11,color:C.faint,marginTop:3}}>{n.source}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{marginTop:14}}>
            <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Key market trends</div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10}}>
              {MARKET_DATA.trends.map((t,i)=>(
                <div key={i} style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:16}}>
                  <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:13,fontWeight:600,color:C.navy,marginBottom:7}}>{t.title}</div>
                  <div style={{fontSize:12,color:C.text,lineHeight:1.7}}>{t.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden",marginBottom:12}}>
            <div style={{padding:"10px 14px",borderBottom:"0.5px solid "+C.silver,background:C.navy}}>
              <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:1,textTransform:"uppercase"}}>Global indices</div>
            </div>
            {indices.map(i=>(
              <div key={i.ticker} style={{padding:"11px 14px",borderBottom:"0.5px solid "+C.silver,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:C.navy}}>{i.name}</div>
                  <div style={{fontSize:10,color:C.faint}}>{i.ticker}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:13,fontWeight:600,color:C.navy}}>{i.value&&i.value.toLocaleString()}</div>
                  <div style={{fontSize:11,fontWeight:600,color:dirColor(i.direction)}}>{i.direction==="up"?"^":"v"} {i.pct&&Math.abs(i.pct).toFixed(2)}%</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden"}}>
              <div style={{padding:"9px 12px",borderBottom:"0.5px solid "+C.silver,background:C.greenBg}}>
                <div style={{fontSize:11,fontWeight:600,color:C.green,letterSpacing:1,textTransform:"uppercase"}}>^ Risers</div>
              </div>
              {risers.map(r=>(
                <div key={r.ticker} style={{padding:"9px 12px",borderBottom:"0.5px solid "+C.silver}}>
                  <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:12,fontWeight:700,color:C.navy}}>{r.ticker}</div>
                  <div style={{fontSize:10,color:C.faint,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                  <div style={{fontSize:12,fontWeight:600,color:C.green}}>+{Math.abs(r.pct).toFixed(2)}%</div>
                </div>
              ))}
            </div>
            <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden"}}>
              <div style={{padding:"9px 12px",borderBottom:"0.5px solid "+C.silver,background:C.redBg}}>
                <div style={{fontSize:11,fontWeight:600,color:C.red,letterSpacing:1,textTransform:"uppercase"}}>v Fallers</div>
              </div>
              {fallers.map(r=>(
                <div key={r.ticker} style={{padding:"9px 12px",borderBottom:"0.5px solid "+C.silver}}>
                  <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:12,fontWeight:700,color:C.navy}}>{r.ticker}</div>
                  <div style={{fontSize:10,color:C.faint,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                  <div style={{fontSize:12,fontWeight:600,color:C.red}}>{r.pct.toFixed(2)}%</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{background:C.navy,borderRadius:10,padding:16}}>
            <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.5)",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>FX rates {marketStatus!=="static"&&<span style={{color:C.teal,fontSize:10}}>. Live</span>}</div>
            {fxRates.map(f=>(
              <div key={f.pair} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"0.5px solid rgba(255,255,255,0.08)"}}>
                <span style={{fontSize:12,fontWeight:500,color:"rgba(255,255,255,0.7)"}}>{f.pair}</span>
                <div style={{display:"flex",gap:8}}>
                  <span style={{fontFamily:"Space Grotesk,sans-serif",fontSize:13,fontWeight:600,color:C.white}}>{fmt(f.rate,4)}</span>
                  <span style={{fontSize:11,color:f.change>= 0 ?"#34D399":"#F87171"}}>{f.change>= 0 ?"+":""}{fmt(f.change,4)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


const Connect=()=>{
  const [connected,setConnected]=useState(["bloomberg"]);
  const [showModal,setShowModal]=useState(null);
  const apps=[
    {id:"bloomberg",name:"Bloomberg",category:"Market Data",desc:"Real-time prices, news, analytics & FX rates. Currently providing live data to i-Convergence.",icon:"o"},
    {id:"refinitiv",name:"Refinitiv Eikon",category:"Market Data",desc:"Financial data, news, and analytics platform.",icon:"o"},
    {id:"plaid",name:"Plaid",category:"Banking",desc:"Connect 12,000+ financial institutions for live account & transaction feeds.",icon:"o"},
    {id:"monzo",name:"Monzo Business",category:"Banking",desc:"UK business banking with real-time transaction feeds.",icon:"[R]"},
    {id:"barclays",name:"Barclays Open Banking",category:"Banking",desc:"PSD2 Open Banking API for account data.",icon:"o"},
    {id:"hsbc",name:"HSBC Open Banking",category:"Banking",desc:"HSBC account and transaction data.",icon:"o"},
    {id:"factset",name:"FactSet",category:"Analytics",desc:"Institutional-grade financial data and portfolio analytics.",icon:"o"},
    {id:"morningstar",name:"Morningstar Direct",category:"Analytics",desc:"Investment research, ratings, and portfolio analysis.",icon:"*"},
    {id:"salesforce",name:"Salesforce FSC",category:"CRM",desc:"Sync client data, activities and opportunities with Salesforce Financial Services Cloud.",icon:"C"},
    {id:"docusign",name:"DocuSign",category:"Documents",desc:"Electronic signatures and document workflow automation.",icon:"D"},
    {id:"xero",name:"Xero",category:"Accounting",desc:"Accounting and invoicing integration for fee management.",icon:"H"},
    {id:"sendgrid",name:"SendGrid",category:"Email",desc:"Bulk and transactional email for client communications.",icon:"@"},
  ];
  const cats=[...new Set(apps.map(a=>a.category))];
  return(
    <div style={{padding:24}}>
      <div style={{marginBottom:18}}><div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>Integrations</div><div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>Connect external apps</div></div>
      <div style={{background:C.tealLight,borderRadius:10,padding:"12px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:C.teal,flexShrink:0}}/>
        <div style={{fontSize:13,color:C.tealMid}}><strong>Bloomberg connected</strong> -- syncing prices and news every 15 minutes. FX rates from price file active.</div>
      </div>
      {cats.map(cat=>(
        <div key={cat} style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>{cat}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {apps.filter(a=>a.category===cat).map(app=>{
              const isConn=connected.includes(app.id);
              return(
                <div key={app.id} style={{background:C.white,border:"0.5px solid "+(isConn?C.teal:C.silver),borderRadius:10,padding:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9}}>
                    <div style={{display:"flex",gap:9,alignItems:"center"}}>
                      <span style={{fontSize:20}}>{app.icon}</span>
                      <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:13,fontWeight:600,color:C.navy}}>{app.name}</div>
                    </div>
                    {isConn&&<Badge color="success">Live</Badge>}
                  </div>
                  <div style={{fontSize:12,color:C.faint,lineHeight:1.6,marginBottom:10}}>{app.desc}</div>
                  {isConn?<Btn small variant="secondary" onClick={()=>setConnected(connected.filter(c=>c!==app.id))}>Disconnect</Btn>:<Btn small onClick={()=>setShowModal(app)}>Connect &gt;</Btn>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {showModal&&<Modal title={"Connect "+showModal.name} onClose={()=>setShowModal(null)}>
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:18}}><span style={{fontSize:34}}>{showModal.icon}</span><div><div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:16,fontWeight:600,color:C.navy}}>{showModal.name}</div><div style={{fontSize:12,color:C.faint}}>{showModal.category}</div></div></div>
        <div style={{background:C.silver,borderRadius:8,padding:14,marginBottom:16,fontSize:13,color:C.text,lineHeight:1.6}}>{showModal.desc}</div>
        <FldInput label="API Key / Client ID" value="" onChange={()=>{}} placeholder="Enter credentials..."/>
        <FldInput label="Secret / Token" value="" onChange={()=>{}} placeholder="**********" type="password"/>
        <div style={{fontSize:11,color:C.faint,marginBottom:14}}>Credentials are encrypted at rest. i-Convergence never stores plaintext keys.</div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>setShowModal(null)}>Cancel</Btn><Btn onClick={()=>{setConnected([...connected,showModal.id]);setShowModal(null);}}>Authorise</Btn></div>
      </Modal>}
    </div>
  );
};

// --- ROOT ----------------------------------------------------------


// --- RISK / ASSET CLASS DATA --------------------------------------




// --- SAMPLE DOCS ---------------------------------------------------

// --- DEFAULT ALERTS ------------------------------------------------

// --- AI PORTFOLIO ASSISTANT -----------------------------------------
const SUGGESTED_PROMPTS = [
  "What are the key risks across all client portfolios right now?",
  "Which clients have the highest concentration risk?",
  "Give me a market outlook for global equities this quarter",
  "Are any clients breaching their investment mandate?",
  "What is the outlook for GBP-hedged ETFs given current FX rates?",
  "Summarise Hash Murji's portfolio and flag any concerns",
  "Which holdings have the worst unrealised P&L across all clients?",
  "What would a rebalance look like for Lyndsey Starkie?",
];

// API key -- reads from Vite env var in production, empty string in artifact preview
// API key -- injected via window.__ANTHROPIC_KEY in index.html for Vercel deployment
const ANTHROPIC_API_KEY = (typeof window !== "undefined" && window.__ANTHROPIC_KEY) ? window.__ANTHROPIC_KEY : "";

const buildPortfolioContext = (selectedClient) => {
  const clientSummaries = CLIENTS.map(c => {
    const hs = HOLDINGS[c.id] || [];
    const total = hs.reduce((s,h)=>s+h.value,0);
    const cost  = hs.reduce((s,h)=>s+h.cost,0);
    const topH  = [...hs].sort((a,b)=>b.value-a.value).slice(0,5).map(h=>(h.ticker+" $"+Math.round(h.value).toLocaleString())).join(", ");
    return c.name+" ("+c.id+"): Portfolio $"+Math.round(total).toLocaleString()+", Cost $"+Math.round(cost).toLocaleString()+", P&L "+(total>= cost ?"+":"")+"$"+Math.round(total-cost).toLocaleString()+". Top holdings: "+topH+".";
  }).join("\n");
  const focusNote = selectedClient
    ? "\nThe adviser is currently viewing client: "+(CLIENTS.find(c=>c.id===selectedClient)||{name:selectedClient}).name+" specifically.\n"
    : "";
  return "You are an AI portfolio assistant for i-Convergence, a financial platform management system. You have access to the following live client portfolio data:\n\n"+clientSummaries+focusNote+"\nFX rates: GBP/USD 1.2618, GBP/EUR 1.1603, USD/CNY 7.24.\nToday\'s date: "+new Date().toLocaleDateString("en-GB")+".\nProvide concise, professional financial analysis. Always note that insights are for adviser reference only and not investment advice.";
};

const AIAssistant = ({ selectedCcy, selectedClient }) => {
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hello! I am your i-Convergence AI Portfolio Assistant. I have full context of all client portfolios, holdings, P&L, and FX rates. Ask me anything about your book of business, market outlook, or specific client concerns." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = { current: null };

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg) return;
    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    if (!ANTHROPIC_API_KEY) {
      setMessages([...newMessages, { role: "assistant", content: "To activate the AI assistant, paste your Anthropic API key into the ANTHROPIC_API_KEY constant in the source code (search for 'sk-ant'). You can get a key at console.anthropic.com." }]);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: buildPortfolioContext(selectedClient),
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await response.json();
      const reply = (data.content && data.content[0] && data.content[0].text) || "Sorry, I could not generate a response. Please try again.";
      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages([...newMessages, { role: "assistant", content: "Connection error. Please check your network and try again." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: isMobile ? "12px 10px" : 24, display: "flex", flexDirection: "column", height: "calc(100vh - 54px)" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 3, color: C.teal, textTransform: "uppercase", marginBottom: 3 }}>AI powered</div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 600, color: C.navy }}>Portfolio assistant</div>
      </div>

      {!ANTHROPIC_API_KEY && (
        <div style={{ background: C.amberBg, border: "1px solid " + C.gold, borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: C.amber }}>
          <strong>Setup required:</strong> Add your Anthropic API key to the <code>ANTHROPIC_API_KEY</code> constant in the source code to activate AI responses.
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", background: C.silver, borderRadius: 10, padding: 16, marginBottom: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%", padding: "10px 14px", borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
              background: m.role === "user" ? C.navy : C.white,
              color: m.role === "user" ? C.white : C.text,
              fontSize: 13, lineHeight: 1.6,
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ background: C.white, padding: "10px 14px", borderRadius: "12px 12px 12px 4px", fontSize: 13, color: C.faint }}>
              Analysing portfolios...
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {SUGGESTED_PROMPTS.slice(0, isMobile ? 2 : 4).map((p, i) => (
          <button key={i} onClick={() => send(p)} style={{ background: C.white, border: "0.5px solid " + C.silver, borderRadius: 20, padding: "5px 12px", fontSize: 11, color: C.text, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
            {p}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about portfolios, markets, rebalancing, risk..."
          style={{ flex: 1, padding: "10px 14px", border: "1.5px solid " + C.silverMid, borderRadius: 8, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none" }}
        />
        <Btn onClick={() => send()} variant="primary">{loading ? "..." : "Send"}</Btn>
      </div>
    </div>
  );
};

// --- RISK & SUITABILITY PAGE ----------------------------------------
const RiskPage = ({ selectedCcy, setSection, setSelectedClient }) => {
  const isMobile = useIsMobile();
  const sym = CCY_SYMBOLS[selectedCcy] || "$";
  const [profiles, setProfiles] = useState(DEFAULT_RISK_PROFILES);
  const [editing, setEditing] = useState(null);
  const [editScore, setEditScore] = useState(5);
  const [editNotes, setEditNotes] = useState("");

  const saveProfile = () => {
    setProfiles({ ...profiles, [editing]: { ...profiles[editing], score: editScore, notes: editNotes, reviewed: new Date().toISOString().slice(0, 10) } });
    setEditing(null);
  };

  return (
    <div style={{ padding: isMobile ? "12px 10px" : 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 3, color: C.teal, textTransform: "uppercase", marginBottom: 3 }}>Compliance</div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 600, color: C.navy }}>Risk and suitability</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,1fr)", gap: 14 }}>
        {CLIENTS.map(client => {
          const profile = profiles[client.id] || DEFAULT_RISK_PROFILES[client.id];
          const score = (profile && profile.score) || 5;
          const comp = computeCompliance(client.id, profiles);
          const hasFlags = comp && comp.flags && comp.flags.length > 0;
          const colour = RISK_COLOURS[score] || C.teal;

          return (
            <div key={client.id} style={{ background: C.white, border: "0.5px solid " + (hasFlags ? C.gold : C.silver), borderRadius: 12, overflow: "hidden" }}>
              <div style={{ background: C.navy, padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600, color: C.white }}>{client.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{client.id}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {hasFlags && <Badge color="warning">{comp.flags.length} flag{comp.flags.length !== 1 ? "s" : ""}</Badge>}
                  <Btn small variant="ghost" onClick={() => { setEditing(client.id); setEditScore(score); setEditNotes((profile && profile.notes) || ""); }}>Edit profile</Btn>
                </div>
              </div>
              <div style={{ padding: "16px 18px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "12px 18px", marginBottom: 14 }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: colour, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700 }}>
                    {score}
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600, color: C.navy }}>{RISK_LABELS[score] || "Custom"}</div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>Mandate: Equity {RISK_MANDATES[score].equity[0]}-{RISK_MANDATES[score].equity[1]}% . FI {RISK_MANDATES[score].fi[0]}-{RISK_MANDATES[score].fi[1]}%</div>
                    <div style={{ fontSize: 11, color: C.faint }}>Reviewed: {(profile && profile.reviewed) || "Never"}</div>
                  </div>
                </div>

                {comp && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.faint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Current allocation</div>
                    {[["Equity", comp.eqPct, RISK_MANDATES[score].equity], ["Fixed Income", comp.fiPct, RISK_MANDATES[score].fi], ["Cash", comp.cashPct, RISK_MANDATES[score].cash], ["Commodity", comp.comPct, RISK_MANDATES[score].commodity]].map(([label, val, range]) => {
                      const breach = val < range[0] || val > range[1];
                      return (
                        <div key={label} style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                            <span style={{ color: breach ? C.red : C.text, fontWeight: breach ? 600 : 400 }}>{label}</span>
                            <span style={{ color: breach ? C.red : C.faint }}>{val}% <span style={{ color: C.faint }}>(mandate: {range[0]}-{range[1]}%)</span></span>
                          </div>
                          <div style={{ height: 5, background: C.silver, borderRadius: 3 }}>
                            <div style={{ height: "100%", width: Math.min(val, 100) + "%", background: breach ? C.red : colour, borderRadius: 3, transition: "width 0.4s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6, fontStyle: "italic", marginBottom: 12 }}>
                  {(profile && profile.notes) || "No suitability notes recorded."}
                </div>

                <div style={{ fontSize: 11, fontWeight: 600, color: C.faint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Compliance flags</div>
                {comp && comp.flags && comp.flags.length === 0 && (
                  <div style={{ color: C.green, fontSize: 13, fontWeight: 500, display: "flex", gap: 6, alignItems: "center" }}><span>OK</span><span>No breaches detected</span></div>
                )}
                {comp && comp.flags && comp.flags.length > 0 && comp.flags.map((f, fi) => (
                  <div key={fi} style={{ display: "flex", gap: 8, marginBottom: 8, padding: "8px 10px", background: f.type === "error" ? C.redBg : C.amberBg, borderRadius: 6 }}>
                    <span style={{ flexShrink: 0 }}>{f.type === "error" ? "[R]" : "[A]"}</span>
                    <span style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{f.msg}</span>
                  </div>
                ))}
                {!comp && (
                  <div style={{ fontSize: 12, color: C.faint }}>No compliance data available.</div>
                )}

                <div style={{ marginTop: 12, display: "flex", gap: 7 }}>
                  <Btn small variant="ghost" onClick={() => { setSelectedClient(client.id); setSection("clients"); }}>View client</Btn>
                  <Btn small variant="secondary" onClick={() => setSection("rebalance")}>Rebalance</Btn>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <Modal title="Edit risk profile" onClose={() => setEditing(null)}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600, color: C.navy, marginBottom: 14 }}>
            {(CLIENTS.find(c => c.id === editing) || {name: editing}).name}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Risk score: <strong>{editScore} -- {RISK_LABELS[editScore]}</strong></label>
            <input type="range" min={1} max={10} value={editScore} onChange={e => setEditScore(+e.target.value)} style={{ width: "100%" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.faint, marginTop: 4 }}>
              <span>1 Very Cautious</span><span>5 Moderate</span><span>10 Speculative</span>
            </div>
          </div>
          <div style={{ background: C.silver, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.text, marginBottom: 14 }}>
            Mandate: Equity {RISK_MANDATES[editScore].equity[0]}-{RISK_MANDATES[editScore].equity[1]}% . Fixed Income {RISK_MANDATES[editScore].fi[0]}-{RISK_MANDATES[editScore].fi[1]}% . Cash max {RISK_MANDATES[editScore].cash[1]}%
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.text, display: "block", marginBottom: 4 }}>Suitability notes</label>
            <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={4}
              style={{ width: "100%", padding: "8px 11px", border: "1.5px solid " + C.silverMid, borderRadius: 6, fontSize: 13, fontFamily: "'Inter',sans-serif", resize: "vertical", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setEditing(null)}>Cancel</Btn>
            <Btn onClick={saveProfile}>Save profile</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// --- REBALANCING TOOL -----------------------------------------------
const RebalancePage = ({ selectedCcy }) => {
  const isMobile = useIsMobile();
  const sym = CCY_SYMBOLS[selectedCcy] || "$";
  const [selectedId, setSelectedId] = useState(CLIENTS[0].id);

  const client = CLIENTS.find(c => c.id === selectedId);
  const hs = HOLDINGS[selectedId] || [];
  const profile = DEFAULT_RISK_PROFILES[selectedId];
  const score = (profile && profile.score) || 5;
  const mandate = RISK_MANDATES[score];
  const total = hs.reduce((s, h) => s + convertAmount(h.value, h.ccy, selectedCcy), 0);

  const byClass = {};
  hs.forEach(h => {
    const ac = ASSET_CLASS[h.ticker] || "Other";
    byClass[ac] = (byClass[ac] || 0) + convertAmount(h.value, h.ccy, selectedCcy);
  });

  const targetMid = ac => {
    const m = mandate[ac.toLowerCase().replace(" ", "")] || mandate[ac.toLowerCase()];
    if (!m) return 0;
    return (m[0] + m[1]) / 2 / 100;
  };

  const classes = ["Equity", "Fixed Income", "Cash", "Commodity"];
  const trades = [];
  classes.forEach(ac => {
    const current = byClass[ac] || 0;
    const target = total * targetMid(ac);
    const diff = target - current;
    if (Math.abs(diff) > 500) {
      trades.push({ ac, current, target, diff, pctCurrent: Math.round(current / total * 100), pctTarget: Math.round(targetMid(ac) * 100) });
    }
  });

  const exportTrades = () => {
    const nl = "\n";
    const rows = trades.map(t => [t.ac, t.pctCurrent + "%", t.pctTarget + "%", (t.diff >= 0 ? "BUY" : "SELL"), sym + Math.abs(Math.round(t.diff)).toLocaleString()].join(",")).join(nl);
    const blob = new Blob(["Asset Class,Current %,Target %,Action,Amount" + nl + rows], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "rebalance-" + selectedId + ".csv"; a.click();
  };

  return (
    <div style={{ padding: isMobile ? "12px 10px" : 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 3, color: C.teal, textTransform: "uppercase", marginBottom: 3 }}>Tools</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 600, color: C.navy }}>Rebalancing tool</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ padding: "8px 12px", border: "1.5px solid " + C.silver, borderRadius: 7, fontSize: 13, fontFamily: "'Inter',sans-serif", color: C.navy, background: C.white }}>
            {CLIENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {trades.length > 0 && <Btn small onClick={exportTrades}>Export CSV</Btn>}
        </div>
      </div>

      <div style={{ background: C.navy, borderRadius: 10, padding: "16px 20px", marginBottom: 16, display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>Client</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 600, color: C.white }}>{client && client.name}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>Risk profile</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 600, color: C.teal }}>{score} -- {RISK_LABELS[score]}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>Portfolio value</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 600, color: C.white }}>{sym}{fmt(total, 0)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        <div style={{ background: C.white, border: "0.5px solid " + C.silver, borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.faint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>Current vs target allocation</div>
          {classes.map(ac => {
            const cur = Math.round((byClass[ac] || 0) / total * 100);
            const tgt = Math.round(targetMid(ac) * 100);
            const breach = cur < (mandate[ac.toLowerCase().replace(" ", "")] || [0, 100])[0] || cur > (mandate[ac.toLowerCase().replace(" ", "")] || [0, 100])[1];
            return (
              <div key={ac} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, color: C.navy }}>{ac}</span>
                  <span style={{ color: breach ? C.red : C.faint }}>{cur}% <span style={{ color: C.teal }}>&gt;</span> {tgt}%</span>
                </div>
                <div style={{ position: "relative", height: 8, background: C.silver, borderRadius: 4 }}>
                  <div style={{ position: "absolute", height: "100%", width: cur + "%", background: breach ? C.red : C.navyMid, borderRadius: 4 }} />
                  <div style={{ position: "absolute", height: "100%", width: 2, left: tgt + "%", background: C.teal, borderRadius: 1 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.faint, marginTop: 2 }}>
                  <span>Current: {sym}{fmt((byClass[ac] || 0), 0)}</span>
                  <span>Target: {sym}{fmt(total * targetMid(ac), 0)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background: C.white, border: "0.5px solid " + C.silver, borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.faint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>Recommended trades</div>
          {trades.length === 0 ? (
            <div style={{ color: C.green, fontSize: 13, fontWeight: 500, display: "flex", gap: 6, alignItems: "center", padding: "20px 0" }}>
              <span>OK</span><span>Portfolio is within mandate -- no rebalancing required</span>
            </div>
          ) : trades.map((t, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: t.diff >= 0 ? C.greenBg : C.redBg, borderRadius: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{t.ac}</div>
                <div style={{ fontSize: 11, color: C.faint }}>{t.pctCurrent}% &gt; {t.pctTarget}%</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <Badge color={t.diff >= 0 ? "success" : "error"}>{t.diff >= 0 ? "BUY" : "SELL"}</Badge>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: t.diff >= 0 ? C.green : C.red, marginTop: 4 }}>
                  {sym}{fmt(Math.abs(t.diff), 0)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- ALERTS PAGE ----------------------------------------------------
const AlertsPage = ({ setSection, setSelectedClient }) => {
  const isMobile = useIsMobile();
  const [alerts, setAlerts] = useState(buildDefaultAlerts());
  const [filter, setFilter] = useState("open");

  const dismiss = (id) => setAlerts(alerts.map(a => a.id === id ? { ...a, status: "dismissed" } : a));
  const filtered = filter === "all" ? alerts : alerts.filter(a => a.status === filter);
  const openCount = alerts.filter(a => a.status === "open").length;

  return (
    <div style={{ padding: isMobile ? "12px 10px" : 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 3, color: C.teal, textTransform: "uppercase", marginBottom: 3 }}>Monitoring</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 600, color: C.navy, display: "flex", alignItems: "center", gap: 10 }}>
            Alerts
            {openCount > 0 && <span style={{ background: C.redBg, color: C.red, fontSize: 13, fontWeight: 700, padding: "2px 10px", borderRadius: 100 }}>{openCount} open</span>}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["open", "Open"], ["dismissed", "Dismissed"], ["all", "All"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ background: filter === k ? C.navy : C.white, color: filter === k ? C.white : C.text, border: "0.5px solid " + (filter === k ? C.navy : C.silver), borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif", fontWeight: filter === k ? 600 : 400 }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ background: C.white, border: "0.5px solid " + C.silver, borderRadius: 10, padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>OK</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 600, color: C.navy }}>No alerts</div>
          </div>
        ) : filtered.map(alert => (
          <div key={alert.id} style={{ background: C.white, border: "0.5px solid " + (alert.severity === "error" ? "#FCA5A5" : alert.severity === "warning" ? "#FCD34D" : C.silver), borderRadius: 10, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, opacity: alert.status === "dismissed" ? 0.5 : 1 }}>
            <div style={{ display: "flex", gap: 12, flex: 1 }}>
              <div style={{ fontSize: 20, flexShrink: 0 }}>{alert.severity === "error" ? "[R]" : alert.severity === "warning" ? "[A]" : "o"}</div>
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                  <Badge color={alert.severity === "error" ? "error" : alert.severity === "warning" ? "warning" : "info"}>{alert.type}</Badge>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{alert.client}</span>
                </div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 6 }}>{alert.msg}</div>
                <div style={{ fontSize: 11, color: C.faint }}>Triggered {alert.triggered}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <Btn small variant="ghost" onClick={() => { setSelectedClient(alert.clientId); setSection("clients"); }}>View client</Btn>
              {alert.status === "open" && <Btn small variant="secondary" onClick={() => dismiss(alert.id)}>Dismiss</Btn>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- DOCUMENT VAULT -------------------------------------------------
const DocVaultPage = () => {
  const isMobile = useIsMobile();
  const [docs, setDocs] = useState(() => {
    const all = [];
    Object.entries(DEFAULT_DOCS).forEach(([cid, ds]) => ds.forEach(d => all.push({ ...d, clientId: cid, clientName: (CLIENTS.find(c => c.id === cid) || {name: cid}).name })));
    return all;
  });
  const [filterClient, setFilterClient] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [uploadClient, setUploadClient] = useState(CLIENTS[0].id);
  const [uploadType, setUploadType] = useState("KYC");
  const [showUpload, setShowUpload] = useState(false);

  const typeColour = { KYC: "navy", "Suitability": "success", "Mandate": "info", "Risk Disclosure": "warning", "Authorisation": "gold" };
  const typeIcon   = { KYC: "ID", "Suitability": "OK", "Mandate": "D", "Risk Disclosure": "!", "Authorisation": "S" };
  const docTypes = ["KYC", "Suitability", "Mandate", "Risk Disclosure", "Authorisation"];

  const filtered = docs.filter(d => (filterClient === "all" || d.clientId === filterClient) && (filterType === "all" || d.type === filterType));

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (files.length && uploadClient) {
      const clientName = (CLIENTS.find(c => c.id === uploadClient) || {name: uploadClient}).name;
      const newDocs = files.map((f, i) => ({ id: Date.now() + i, name: f.name, type: uploadType, date: new Date().toISOString().slice(0, 10), size: (f.size / 1024).toFixed(0) + " KB", uploader: "JW", clientId: uploadClient, clientName }));
      setDocs([...newDocs, ...docs]);
      setShowUpload(false);
    }
  };

  return (
    <div style={{ padding: isMobile ? "12px 10px" : 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 3, color: C.teal, textTransform: "uppercase", marginBottom: 3 }}>Compliance</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 600, color: C.navy }}>Document vault</div>
        </div>
        <Btn onClick={() => setShowUpload(true)}>+ Upload document</Btn>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ padding: "7px 10px", border: "1.5px solid " + C.silver, borderRadius: 6, fontSize: 12, fontFamily: "'Inter',sans-serif", color: C.navy, background: C.white }}>
          <option value="all">All clients</option>
          {CLIENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: "7px 10px", border: "1.5px solid " + C.silver, borderRadius: 6, fontSize: 12, fontFamily: "'Inter',sans-serif", color: C.navy, background: C.white }}>
          <option value="all">All types</option>
          {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ fontSize: 12, color: C.faint, display: "flex", alignItems: "center" }}>{filtered.length} document{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,1fr)", gap: 10 }}>
        {filtered.map(doc => (
          <div key={doc.id} style={{ background: C.white, border: "0.5px solid " + C.silver, borderRadius: 10, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 26, flexShrink: 0 }}>{typeIcon[doc.type] || "Doc"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: C.navy, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                <Badge color={typeColour[doc.type] || "info"}>{doc.type}</Badge>
                <Badge color="navy">{doc.clientName}</Badge>
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 5 }}>{doc.date} . {doc.size} . {doc.uploader}</div>
            </div>
            <Btn small variant="ghost">View</Btn>
          </div>
        ))}
      </div>

      {showUpload && (
        <Modal title="Upload document" onClose={() => setShowUpload(false)}>
          <FldSelect label="Client" value={uploadClient} onChange={setUploadClient} options={CLIENTS.map(c => ({ value: c.id, label: c.name }))} />
          <FldSelect label="Document type" value={uploadType} onChange={setUploadType} options={docTypes.map(t => ({ value: t, label: t }))} />
          <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            style={{ background: C.silver, borderRadius: 8, padding: 32, textAlign: "center", marginBottom: 16, border: "2px dashed " + C.silverMid, cursor: "pointer" }}
            onClick={() => { const el = document.getElementById("vaultFileInput"); if (el) el.click(); }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>D</div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>Drag and drop files here</div>
            <div style={{ fontSize: 11, color: C.faint }}>PDF, DOCX, XLSX supported</div>
            <input id="vaultFileInput" type="file" multiple style={{ display: "none" }} onChange={e => {
              const files = Array.from(e.target.files || []);
              if (files.length) {
                const clientName = (CLIENTS.find(c => c.id === uploadClient) || {name: uploadClient}).name;
                const newDocs = files.map((f, i) => ({ id: Date.now() + i, name: f.name, type: uploadType, date: new Date().toISOString().slice(0, 10), size: (f.size / 1024).toFixed(0) + " KB", uploader: "JW", clientId: uploadClient, clientName }));
                setDocs([...newDocs, ...docs]);
                setShowUpload(false);
              }
            }} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setShowUpload(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};



// --- WITHDRAWALS PAGE ---------------------------------------------
const WithdrawalsPage=()=>{
  const isMobile=useIsMobile();
  const [requests,setRequests]=useState([]);
  const [statusMap,setStatusMap]=useState({});
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [filter,setFilter]=useState("all");
  const [showSetup,setShowSetup]=useState(false);
  const [sheetId,setSheetId]=useState("");
  const [apiKey2,setApiKey2]=useState("");

  useEffect(()=>{ loadRequests().then(r=>{setRequests(r);setLoading(false);}); },[]);

  const syncStatuses=async()=>{
    setSyncing(true);
    const map=await readSheetStatuses();
    setStatusMap(map);
    if(Object.keys(map).length>0){
      const updated=requests.map(r=>map[r.id]?{...r,status:map[r.id]}:r);
      await saveRequests(updated);
      setRequests(updated);
    }
    setSyncing(false);
  };

  const filtered=filter==="all"?requests:requests.filter(r=>{
    const live=statusMap[r.id]||r.status;
    if(filter==="pending") return live==="Pending";
    if(filter==="actioned") return live==="Actioned"||live==="Completed";
    return true;
  });

  const pendingCount=requests.filter(r=>(statusMap[r.id]||r.status)==="Pending").length;

  const exportCSV=()=>{
    const nl="\n";
    const hdr="Request ID,Date,Client,Type,Amount,CCY,Notes,Status"+nl;
    const rows=requests.map(r=>[r.id,r.date,r.clientName,r.type,r.amount,r.ccy,(r.notes||"").split(",").join(";"),statusMap[r.id]||r.status].join(",")).join(nl);
    const blob=new Blob([hdr+rows],{type:"text/csv"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="withdrawals.csv";a.click();
  };

  return(
    <div style={{padding:isMobile?"12px 10px":24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>Back-office</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:22,fontWeight:600,color:C.navy,display:"flex",alignItems:"center",gap:10}}>
            Withdrawal requests
            {pendingCount>0&&<span style={{background:C.amberBg,color:C.amber,fontSize:13,fontWeight:700,padding:"2px 10px",borderRadius:100}}>{pendingCount} pending</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Btn small variant="ghost" onClick={exportCSV}>Export CSV</Btn>
          <Btn small variant="secondary" onClick={()=>setShowSetup(true)}>Sheets setup</Btn>
          <Btn small onClick={syncStatuses}>{syncing?"Syncing...":"Sync status"}</Btn>
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {[["all","All"],["pending","Pending"],["actioned","Actioned"]].map(([k,l])=>(
          <button key={k} onClick={()=>setFilter(k)} style={{background:filter===k?C.navy:C.white,color:filter===k?C.white:C.text,border:"0.5px solid "+(filter===k?C.navy:C.silver),borderRadius:6,padding:"6px 14px",fontSize:12,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:filter===k?600:400}}>
            {l}{k==="pending"&&pendingCount> 0 ?" ("+pendingCount+")":""}
          </button>
        ))}
      </div>

      {loading?(
        <div style={{padding:40,textAlign:"center",color:C.faint}}>Loading...</div>
      ):requests.length=== 0 ?(
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:40,textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:12}}>v</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:16,fontWeight:600,color:C.navy,marginBottom:6}}>No withdrawal requests</div>
          <div style={{fontSize:13,color:C.faint}}>Submit requests from client profiles.</div>
        </div>
      ):(
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:C.navy}}>
                {["Request ID","Date","Client","Type","Amount","CCY","Notes","Status"].map(h=>(
                  <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map((r,i)=>{
                  const live=statusMap[r.id]||r.status;
                  const isActioned=live==="Actioned"||live==="Completed";
                  return(
                    <tr key={r.id} style={{borderBottom:"0.5px solid "+C.silver,background:i%2=== 0 ?C.white:"#FAFBFC"}}>
                      <td style={{padding:"9px 14px",fontFamily:"monospace",fontSize:11,color:C.faint}}>{r.id}</td>
                      <td style={{padding:"9px 14px",color:C.text,whiteSpace:"nowrap"}}>{r.date}</td>
                      <td style={{padding:"9px 14px",fontWeight:500,color:C.navy}}>{r.clientName}</td>
                      <td style={{padding:"9px 14px",fontWeight:600,color:C.navy}}>{r.type}</td>
                      <td style={{padding:"9px 14px",fontFamily:"Space Grotesk,sans-serif",fontWeight:600,color:C.navy,textAlign:"right"}}>
                        {r.ccy==="GBP"?"GBP":r.ccy==="EUR"?"EUR":r.ccy==="CNY"?"CNY":"$"}{fmt(r.amount)}
                      </td>
                      <td style={{padding:"9px 14px"}}><Badge color={r.ccy==="GBP"?"navy":"info"}>{r.ccy}</Badge></td>
                      <td style={{padding:"9px 14px",color:C.text,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.notes||"--"}</td>
                      <td style={{padding:"9px 14px"}}><Badge color={isActioned?"success":"warning"}>{isActioned?"Actioned":"Pending"}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{padding:"10px 14px",borderTop:"0.5px solid "+C.silver,fontSize:11,color:C.faint}}>
            {filtered.length} request{filtered.length!==1 ?"s":""} . Update Status in Google Sheet then click Sync
          </div>
        </div>
      )}

      {showSetup&&(
        <Modal title="Google Sheets setup" onClose={()=>setShowSetup(false)}>
          <div style={{fontSize:13,color:C.text,lineHeight:1.8,marginBottom:16}}>
            <strong>1.</strong> Create a Google Sheet, name first tab <strong>Withdrawals</strong>.<br/>
            <strong>2.</strong> Add headers: Request ID, Date, Client ID, Client Name, Withdrawal Type, Amount, CCY, Notes, Requested By, Status<br/>
            <strong>3.</strong> Enable Google Sheets API in Google Cloud Console and create an API key.<br/>
            <strong>4.</strong> Share sheet as "Anyone with link can view", then paste credentials below.
          </div>
          <FldInput label="Spreadsheet ID" value={sheetId} onChange={setSheetId} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"/>
          <FldInput label="API Key" value={apiKey2} onChange={setApiKey2} placeholder="AIzaSy..."/>
          <div style={{background:C.silver,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:C.text}}>
            To make this permanent, paste the values into <code>SHEETS_CONFIG</code> at the top of App.jsx.
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>setShowSetup(false)}>Close</Btn>
            <Btn onClick={()=>{SHEETS_CONFIG.SPREADSHEET_ID=sheetId;SHEETS_CONFIG.API_KEY=apiKey2;setShowSetup(false);}}>Save</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};


// --- LOGIN SCREEN ------------------------------------------------------------
const LoginScreen = ({ onLogin, loading, error }) => (
  <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{width:"100%",maxWidth:400}}>
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:42,fontWeight:700,color:C.white,letterSpacing:-1,marginBottom:8}}>
          <span style={{color:C.teal}}>i-</span>Convergence
        </div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.4)",letterSpacing:2,textTransform:"uppercase"}}>Platform Management System</div>
      </div>
      <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:16,padding:36}}>
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:20,fontWeight:600,color:C.white,marginBottom:6}}>Sign in</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:28,lineHeight:1.6}}>
          Secure access with multi-factor authentication. You will be redirected to our identity provider.
        </div>

        {error && (
          <div style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:"12px 14px",marginBottom:20,fontSize:13,color:"#FCA5A5"}}>
            {error}
          </div>
        )}

        <button onClick={onLogin} disabled={loading} style={{width:"100%",background:C.teal,color:C.white,border:"none",borderRadius:8,padding:"14px",fontSize:15,fontWeight:600,cursor:loading?"wait":"pointer",fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:10,opacity:loading?0.7:1,transition:"opacity 0.2s"}}>
          {loading ? (
            <>
              <div style={{width:18,height:18,border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid white",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
              Connecting...
            </>
          ) : (
            <>
              <span style={{fontSize:18}}>Login</span>
              Continue with MFA
            </>
          )}
        </button>

        <div style={{marginTop:24,paddingTop:20,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:C.teal,flexShrink:0}}/>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.35)"}}>Multi-factor authentication required</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:C.teal,flexShrink:0}}/>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.35)"}}>Role-based access control</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:C.teal,flexShrink:0}}/>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.35)"}}>Session expires after 8 hours</span>
          </div>
        </div>
      </div>

      <div style={{textAlign:"center",marginTop:24,fontSize:11,color:"rgba(255,255,255,0.2)"}}>
        i-Convergence Financial Platform . Powered by Auth0
      </div>
    </div>
  </div>
);

// --- CLIENT PORTAL -----------------------------------------------------------
const ClientPortal = ({ user, logout, selectedCcy, setCcy, previewClientId }) => {
  const isMobile = useIsMobile();
  const clientId = previewClientId || (user && user.clientId);
  const client = CLIENTS.find(c => c.id === clientId);
  const sym = CCY_SYMBOLS[selectedCcy] || "$";
  const holdings = HOLDINGS[clientId] || [];
  const totals = clientTotals(clientId, selectedCcy);
  const chartData = buildChart(clientId, selectedCcy);
  const equityH = holdings.filter(h => !h.isCash);
  const cashH = holdings.filter(h => h.isCash);
  const [tab, setTab] = useState("portfolio");
  const clientTxns = TXNS.filter(t => t.clientId === clientId);
  const {result:txSorted,sort:txSort,toggleSort:txToggle,setFilter:txSetFilter,search:txSearch,setSearch:txSetSearch} = useSortFilter(clientTxns, {col:"tradedate",dir:"desc"});
  const txTypes = [...new Set(clientTxns.map(t => t.txtype))].sort();

  if (!client) return (
    <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:C.white,fontSize:16,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:16}}>!</div>
        <div>No portfolio linked to this account.</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.4)",marginTop:8}}>Please contact your adviser.</div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Inter',sans-serif",background:"#F2F5F9",minHeight:"100vh"}}>
      <div style={{background:C.navy,padding:"0 20px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,borderBottom:"1px solid rgba(0,184,176,0.15)"}}>
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:18,fontWeight:700,color:C.white}}>
          <span style={{color:C.teal}}>i-</span>Convergence
          {previewClientId && <span style={{fontSize:11,background:C.gold,color:C.navy,padding:"2px 8px",borderRadius:4,marginLeft:10,fontFamily:"'Inter',sans-serif",fontWeight:600}}>ADVISER PREVIEW</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <CCYSelector selectedCcy={selectedCcy} onChange={setCcy} compact={isMobile}/>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",display:isMobile?"none":"block"}}>{previewClientId ? "Adviser preview" : (user && user.name)}</div>
          <button onClick={logout} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.6)",borderRadius:6,padding:"5px 12px",fontSize:12,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
            {previewClientId ? "<- Exit preview" : "Sign out"}
          </button>
        </div>
      </div>

      <div style={{padding:isMobile?"12px":24,paddingBottom:40}}>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:4}}>{previewClientId ? "Client view preview" : "Welcome back"}</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:24,fontWeight:700,color:C.navy}}>{client.name}</div>
          <div style={{fontSize:13,color:C.faint,marginTop:2}}>{client.code} . {client.jurisdiction}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:12,marginBottom:20}}>
          <div style={{background:C.navy,borderRadius:12,padding:"18px 20px"}}>
            <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:6}}>Portfolio value</div>
            <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:26,fontWeight:700,color:C.white,letterSpacing:-0.5}}>{sym}{fmt(totals.totalValue,0)}</div>
            <div style={{fontSize:12,color:totals.pl>= 0 ?"#34D399":"#F87171",marginTop:4}}>{totals.pl>= 0 ?"^":"v"} {pct(totals.pctReturn)} overall</div>
          </div>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,padding:"18px 20px"}}>
            <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.faint,marginBottom:6}}>Inception value</div>
            <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:26,fontWeight:700,color:C.navy,letterSpacing:-0.5}}>{sym}{fmt(totals.totalCost,0)}</div>
            <div style={{fontSize:12,color:C.faint,marginTop:4}}>Cost basis</div>
          </div>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,padding:"18px 20px"}}>
            <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.faint,marginBottom:6}}>Unrealised gain/loss</div>
            <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:26,fontWeight:700,color:posColor(totals.pl),letterSpacing:-0.5}}>{sign(totals.pl)}{sym}{fmt(Math.abs(totals.pl),0)}</div>
            <div style={{fontSize:12,color:C.faint,marginTop:4}}>{pct(totals.pctReturn)} return</div>
          </div>
        </div>
        <div style={{display:"flex",gap:0,borderBottom:"1px solid "+C.silver,marginBottom:18}}>
          {[["portfolio","Portfolio"],["transactions","Transactions"]].map(([t,label])=>(
            <button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",borderBottom:tab===t?"2px solid "+C.teal:"2px solid transparent",color:tab===t?C.teal:C.faint,fontSize:13,fontWeight:tab===t?600:400,cursor:"pointer",padding:"9px 16px",marginBottom:-1,fontFamily:"'Inter',sans-serif"}}>
              {label}
            </button>
          ))}
        </div>
        {tab==="portfolio"&&(
          <div>
            <div style={{background:C.navy,borderRadius:12,padding:"20px 22px",marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:4}}>Portfolio value over time . {selectedCcy}</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData}>
                  <defs><linearGradient id="cgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.teal} stopOpacity={0.3}/><stop offset="95%" stopColor={C.teal} stopOpacity={0}/></linearGradient></defs>
                  <XAxis dataKey="date" tick={{fontSize:10,fill:"rgba(255,255,255,0.35)"}}/>
                  <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,0.35)"}} tickFormatter={v=>sym+Math.round(v*0.001)+"k"}/>
                  <Tooltip formatter={v=>[sym+fmt(v,0),"Value"]} contentStyle={{background:C.navyMid,border:"none",borderRadius:6,fontSize:12}} labelStyle={{color:C.white}}/>
                  <Area type="monotone" dataKey="value" stroke={C.teal} strokeWidth={2} fill="url(#cgrad)" dot={{fill:C.teal,r:3}}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,overflow:"hidden",marginBottom:16}}>
              <div style={{padding:"14px 18px",borderBottom:"0.5px solid "+C.silver,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:15,fontWeight:600,color:C.navy}}>Holdings</div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <Badge color="info">{equityH.length} positions</Badge>
                  <Badge color="navy">{cashH.length} cash</Badge>
                </div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:C.silver}}>
                      {["Ticker","Description","CCY","Qty","Cost Value","Market Value","P&L","Return"].map(h=>(
                        <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h,i)=>{
                      const cv = convertAmount(h.value, h.ccy, selectedCcy);
                      const cc = convertAmount(h.cost, h.ccy, selectedCcy);
                      const pl = cv - cc;
                      const ret = calcPct(cc, cv);
                      return(
                        <tr key={i} style={{borderBottom:"0.5px solid "+C.silver,background:i%2=== 0 ?C.white:"#FAFBFC"}}>
                          <td style={{padding:"10px 14px",fontFamily:"Space Grotesk,sans-serif",fontWeight:700,color:C.navy}}>{h.ticker}</td>
                          <td style={{padding:"10px 14px",color:C.text,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</td>
                          <td style={{padding:"10px 14px"}}><Badge color={h.ccy==="GBP"?"navy":"info"}>{h.ccy}</Badge></td>
                          <td style={{padding:"10px 14px",textAlign:"right",color:C.text}}>{h.isCash?"--":fmt(h.qty,0)}</td>
                          <td style={{padding:"10px 14px",textAlign:"right",color:C.text}}>{sym}{fmt(cc)}</td>
                          <td style={{padding:"10px 14px",textAlign:"right",fontWeight:600,color:C.navy}}>{sym}{fmt(cv)}</td>
                          <td style={{padding:"10px 14px",textAlign:"right",fontWeight:600,color:h.isCash?"#999":posColor(pl)}}>
                            {h.isCash?"--":(sign(pl))+sym+fmt(Math.abs(pl))}
                          </td>
                          <td style={{padding:"10px 14px",textAlign:"right",color:h.isCash?"#999":posColor(ret)}}>
                            {h.isCash?"--":pct(ret)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:C.navy}}>
                      <td colSpan={4} style={{padding:"10px 14px",color:C.white,fontWeight:600}}>Total</td>
                      <td style={{padding:"10px 14px",textAlign:"right",color:"rgba(255,255,255,0.5)"}}>{sym}{fmt(totals.totalCost,0)}</td>
                      <td style={{padding:"10px 14px",textAlign:"right",color:C.white,fontFamily:"Space Grotesk,sans-serif",fontWeight:700}}>{sym}{fmt(totals.totalValue,0)}</td>
                      <td style={{padding:"10px 14px",textAlign:"right",color:totals.pl>= 0 ?"#34D399":"#F87171",fontWeight:600}}>
                        {sign(totals.pl)}{sym}{fmt(Math.abs(totals.pl),0)}
                      </td>
                      <td style={{padding:"10px 14px",textAlign:"right",color:totals.pctReturn>= 0 ?"#34D399":"#F87171",fontWeight:600}}>
                        {pct(totals.pctReturn)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div style={{fontSize:11,color:C.faint,textAlign:"center",lineHeight:1.8}}>
              Portfolio values are indicative and updated periodically. For queries contact your adviser.<br/>
              i-Convergence Financial Platform . Data as of {new Date().toLocaleDateString("en-GB")}
            </div>
          </div>
        )}
        {tab==="transactions"&&(
          <div>
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              <input value={txSearch} onChange={e=>txSetSearch(e.target.value)} placeholder="Search transactions..." style={{flex:1,minWidth:150,padding:"7px 11px",border:"1.5px solid "+C.silver,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
              <select onChange={e=>txSetFilter("txtype",e.target.value)} style={{padding:"7px 10px",border:"1.5px solid "+C.silver,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",color:C.navy,background:C.white}}>
                <option value="all">All types</option>
                {txTypes.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <span style={{fontSize:12,color:C.faint,display:"flex",alignItems:"center"}}>{txSorted.length} records</span>
            </div>
            <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,overflow:"hidden"}}>
              <div style={{overflowX:"auto",maxHeight:520,overflowY:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead style={{position:"sticky",top:0,zIndex:5}}>
                    <tr style={{background:C.navy}}>
                      {[["tradedate","Date"],["txtype","Type"],["ticker","Ticker"],["description","Description"],["ccy","CCY"],["qty","Qty"],["consideration","Amount"],["netamt","Net"]].map(([col,label])=>(
                        <th key={col} onClick={()=>txToggle(col)} style={{padding:"9px 12px",textAlign:"left",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:0.8,textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap",userSelect:"none",background:C.navy}}>
                          {label}<SortIcon dir={txSort.col===col?txSort.dir:null}/>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {txSorted.slice(0,300).map((t,i)=>{
                      const tc = t.txtype==="BUY"?"success":t.txtype==="SELL"?"error":t.txtype==="Dividend"?"gold":t.txtype.includes("Fee")||t.txtype==="SR Fee"?"warning":"info";
                      return(
                        <tr key={i} style={{borderBottom:"0.5px solid "+C.silver,background:i%2=== 0 ?C.white:"#FAFBFC"}}>
                          <td style={{padding:"8px 12px",color:C.text,whiteSpace:"nowrap"}}>{t.tradedate}</td>
                          <td style={{padding:"8px 12px"}}><Badge color={tc}>{t.txtype}</Badge></td>
                          <td style={{padding:"8px 12px",fontFamily:"Space Grotesk,sans-serif",fontWeight:600,color:C.navy}}>{t.ticker}</td>
                          <td style={{padding:"8px 12px",color:C.text,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td>
                          <td style={{padding:"8px 12px"}}><Badge color={t.ccy==="GBP"?"navy":"info"}>{t.ccy}</Badge></td>
                          <td style={{padding:"8px 12px",textAlign:"right",color:C.text}}>{t.qty!== 0 ?fmt(Math.abs(t.qty),0):"--"}</td>
                          <td style={{padding:"8px 12px",textAlign:"right",fontWeight:600,color:C.navy}}>{fmt(t.consideration)}</td>
                          <td style={{padding:"8px 12px",textAlign:"right",color:posColor(t.netamt),fontWeight:500}}>{fmt(t.netamt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {txSorted.length>300&&(
                <div style={{padding:"9px 14px",fontSize:11,color:C.faint,borderTop:"0.5px solid "+C.silver}}>
                  Showing 300 of {txSorted.length} transactions -- use search or filters to narrow results
                </div>
              )}
            </div>

            <div style={{marginTop:16,fontSize:11,color:C.faint,textAlign:"center",lineHeight:1.8}}>
              Transaction history is for reference only. For queries contact your adviser.<br/>
              i-Convergence Financial Platform . Data as of {new Date().toLocaleDateString("en-GB")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


// --- USER MANAGEMENT PAGE (adviser only) -------------------------------------
const UserManagement = ({ user }) => {
  const isMobile = useIsMobile();
  const [users] = useState([
    {id:"1",email:"james@iconvergence.co.uk",name:"James White",role:"adviser",lastLogin:"2024-06-01",status:"active"},
    {id:"2",email:"sarah@iconvergence.co.uk",name:"Sarah Johnson",role:"adviser",lastLogin:"2024-05-30",status:"active"},
    {id:"3",email:"Michael@i-FSC.com",name:"Michael Lightfoot",role:"client",clientId:"C00355633",lastLogin:"2024-05-28",status:"active"},
    {id:"4",email:"Lyndsey@i-FSC.com",name:"Lyndsey Starkie",role:"client",clientId:"C00356735",lastLogin:"2024-05-15",status:"active"},
    {id:"5",email:"Chris@i-FSC.com",name:"Chris Pauls",role:"client",clientId:"C00355634",lastLogin:"2024-04-20",status:"active"},
    {id:"6",email:"Hash@i-FSC.com",name:"Hash Murji",role:"client",clientId:"C00347223",lastLogin:"2024-06-01",status:"active"},
  ]);
  const [showInvite,setShowInvite]=useState(false);
  const [inviteEmail,setInviteEmail]=useState("");
  const [inviteRole,setInviteRole]=useState("client");
  const [inviteClientId,setInviteClientId]=useState("");
  const [resetMsg,setResetMsg]=useState("");

  const triggerReset = (email) => {
    setResetMsg("Password reset email sent to "+email);
    setTimeout(()=>setResetMsg(""),3000);
  };

  return(
    <div style={{padding:isMobile?"12px 10px":24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>Administration</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>User management</div>
        </div>
        <Btn onClick={()=>setShowInvite(true)}>+ Invite user</Btn>
      </div>

      {resetMsg&&<div style={{background:C.tealLight,border:"1px solid "+C.teal,borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:13,color:C.tealMid}}>{resetMsg}</div>}

      <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:C.navy}}>
            {["User","Email","Role","Client ID","Last login","Status","Actions"].map(h=>(
              <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {users.map((u,i)=>(
              <tr key={u.id} style={{borderBottom:"0.5px solid "+C.silver,background:i%2=== 0 ?C.white:"#FAFBFC"}}>
                <td style={{padding:"11px 14px"}}>
                  <div style={{display:"flex",gap:9,alignItems:"center"}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:u.role==="adviser"?C.navy:C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:12,fontWeight:700,flexShrink:0}}>
                      {u.name.split(" ").map(n=>n[0]).join("")}
                    </div>
                    <span style={{fontWeight:600,color:C.navy}}>{u.name}</span>
                  </div>
                </td>
                <td style={{padding:"11px 14px",color:C.text}}>{u.email}</td>
                <td style={{padding:"11px 14px"}}><Badge color={u.role==="adviser"?"navy":"info"}>{u.role}</Badge></td>
                <td style={{padding:"11px 14px",fontFamily:"monospace",fontSize:11,color:C.faint}}>{u.clientId||"--"}</td>
                <td style={{padding:"11px 14px",color:C.faint}}>{u.lastLogin}</td>
                <td style={{padding:"11px 14px"}}><Badge color="success">{u.status}</Badge></td>
                <td style={{padding:"11px 14px"}}>
                  <div style={{display:"flex",gap:6}}>
                    <Btn small variant="ghost" onClick={()=>triggerReset(u.email)}>Reset pwd</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{marginTop:16,background:C.silver,borderRadius:10,padding:"14px 18px",fontSize:12,color:C.text,lineHeight:1.8}}>
        <strong style={{color:C.navy}}>To manage users in Auth0:</strong> Visit{" "}
        <a href="https://manage.auth0.com" target="_blank" rel="noreferrer" style={{color:C.teal}}>manage.auth0.com</a>
        {" "}&gt; User Management &gt; Users. Assign roles, reset passwords, enable/disable MFA, and view login history there.
        Password resets above trigger an Auth0 email to the user.
      </div>

      {showInvite&&(
        <Modal title="Invite user" onClose={()=>setShowInvite(false)}>
          <FldInput label="Email address" value={inviteEmail} onChange={setInviteEmail} placeholder="user@example.com"/>
          <FldSelect label="Role" value={inviteRole} onChange={setInviteRole} options={[{value:"adviser",label:"Adviser -- full platform access"},{value:"client",label:"Client -- portal access only"}]}/>
          {inviteRole==="client"&&(
            <FldSelect label="Link to client" value={inviteClientId} onChange={setInviteClientId} options={[{value:"",label:"Select client..."},...CLIENTS.map(c=>({value:c.id,label:c.name}))]}/>
          )}
          <div style={{background:C.silver,borderRadius:8,padding:"12px 14px",marginBottom:16,fontSize:12,color:C.text,lineHeight:1.7}}>
            An invitation email will be sent. The user must set up MFA on first login. For client users, their portal will show only their linked portfolio.
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn variant="secondary" onClick={()=>setShowInvite(false)}>Cancel</Btn>
            <Btn onClick={()=>setShowInvite(false)}>Send invite</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};


// --- TRUSTEE DASHBOARD --------------------------------------------------------
const TrusteePage = () => {
  const isMobile = useIsMobile();
  const [quarter, setQuarter] = useState("Q2 2026");
  const [editMode, setEditMode] = useState(false);

  // All metrics are editable so the trustee can update them each quarter
  const [metrics, setMetrics] = useState({
    // Membership
    activeMembers:   4128,
    deferredMembers: 8762,
    pensioners:      5331,
    // Funding
    fundingRatio:    98.4,
    buyoutFunding:   85.1,
    schemeAssets:    842,
    monthlyCashflow: 1.2,
    // Admin SLAs
    retirementsSLA:  97.2,
    transfersSLA:    94.6,
    deathsSLA:       99.1,
    queriesSLA:      96.4,
    openCases:       327,
    cases30:         41,
    cases90:         6,
    // Data integrity
    commonData:      98.7,
    conditionalData: 94.3,
    missingAddress:  74,
    missingNI:       18,
    duplicates:      4,
    // Risk & governance
    auditActions:    3,
    regBreaches:     0,
    cyberIncidents:  0,
    criticalRisks:   1,
    // Overall score
    healthScore:     91,
  });

  const [draft, setDraft] = useState({...metrics});

  const rag = (val, green, amber) => {
    if (val >= green) return { colour: C.green, icon: "[G]" };
    if (val >= amber) return { colour: C.amber, icon: "o" };
    return { colour: C.red, icon: "[R]" };
  };
  const ragLow = (val, redAbove, amberAbove) => {
    if (val === 0) return { colour: C.green, icon: "[G]" };
    if (val <= amberAbove) return { colour: C.amber, icon: "o" };
    return { colour: C.red, icon: "[R]" };
  };

  const totalMembers = metrics.activeMembers + metrics.deferredMembers + metrics.pensioners;
  const healthRag = rag(metrics.healthScore, 90, 75);

  const saveEdits = () => { setMetrics({...draft}); setEditMode(false); };
  const cancelEdits = () => { setDraft({...metrics}); setEditMode(false); };

  const Num = ({ field, prefix="", suffix="", dp=0 }) => editMode ? (
    <input
      type="number"
      value={draft[field]}
      onChange={e => setDraft({...draft, [field]: parseFloat(e.target.value)||0})}
      style={{width:80,padding:"2px 6px",border:"1.5px solid "+C.teal,borderRadius:4,fontSize:14,fontFamily:"Space Grotesk,sans-serif",fontWeight:600,color:C.navy,textAlign:"right"}}
    />
  ) : (
    <span style={{fontFamily:"Space Grotesk,sans-serif",fontSize:22,fontWeight:700,color:C.navy,letterSpacing:-0.5}}>
      {prefix}{typeof metrics[field]==="number"&&dp=== 0 ?metrics[field].toLocaleString():metrics[field].toFixed(dp)}{suffix}
    </span>
  );

  const SectionHeader = ({ title }) => (
    <div style={{display:"flex",alignItems:"center",gap:12,margin:"20px 0 14px",paddingTop:20,borderTop:"1px solid "+C.silver}}>
      <div style={{height:2,width:20,background:C.teal,borderRadius:1,flexShrink:0}}/>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:3,color:C.faint,textTransform:"uppercase"}}>{title}</div>
      <div style={{flex:1,height:1,background:C.silver}}/>
    </div>
  );

  const KPI = ({ label, field, prefix="", suffix="", greenAt, amberAt, ragType="high", dp=0, wide=false }) => {
    const val = editMode ? draft[field] : metrics[field];
    const r = ragType==="high" ? rag(val, greenAt, amberAt) : ragLow(val, amberAt, greenAt);
    return (
      <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 16px",minWidth:wide?200:0}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:C.faint,marginBottom:8}}>{label}</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
          <Num field={field} prefix={prefix} suffix={suffix} dp={dp}/>
          <span style={{fontSize:20}}>{r.icon}</span>
        </div>
        <div style={{marginTop:6,height:3,background:C.silver,borderRadius:2}}>
          <div style={{height:"100%",width:Math.min(val,100)+"%",background:r.colour,borderRadius:2,transition:"width 0.5s"}}/>
        </div>
      </div>
    );
  };

  const StatItem = ({ label, field, prefix="", suffix="", ragType, greenAt, amberAt, dp=0 }) => {
    const val = editMode ? draft[field] : metrics[field];
    const r = ragType==="high" ? rag(val, greenAt||100, amberAt||95)
            : ragType==="low"  ? ragLow(val, amberAt||1, greenAt||5)
            : null;
    return (
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"0.5px solid "+C.silver}}>
        <span style={{fontSize:13,color:C.text}}>{label}</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {editMode ? (
            <input type="number" value={draft[field]}
              onChange={e=>setDraft({...draft,[field]:parseFloat(e.target.value)||0})}
              style={{width:72,padding:"2px 6px",border:"1.5px solid "+C.teal,borderRadius:4,fontSize:13,fontFamily:"Space Grotesk,sans-serif",fontWeight:600,color:C.navy,textAlign:"right"}}/>
          ) : (
            <span style={{fontFamily:"Space Grotesk,sans-serif",fontSize:15,fontWeight:600,color:C.navy}}>
              {prefix}{dp> 0 ?val.toFixed(dp):typeof val==="number"?val.toLocaleString():val}{suffix}
            </span>
          )}
          {r&&<span style={{fontSize:16}}>{r.icon}</span>}
        </div>
      </div>
    );
  };

  return (
    <div style={{padding:isMobile?"12px 10px":24,maxWidth:1100,margin:"0 auto"}}>
      <div style={{background:C.navy,borderRadius:12,padding:isMobile?"18px 16px":"22px 28px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:14}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",marginBottom:6}}>Pension scheme executive dashboard</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?22:28,fontWeight:700,color:C.white,letterSpacing:-0.5}}>
            Trustee reporting
          </div>
          <div style={{marginTop:8,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {editMode ? (
              <input value={draft.quarter||quarter} onChange={e=>setQuarter(e.target.value)}
                style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:6,padding:"4px 10px",color:C.white,fontSize:13,fontFamily:"'Inter',sans-serif"}}/>
            ) : (
              <span style={{background:"rgba(0,184,176,0.2)",color:C.teal,fontSize:13,fontWeight:600,padding:"4px 12px",borderRadius:20}}>{quarter}</span>
            )}
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{fontSize:36}}>{healthRag.icon}</div>
              <div>
                <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:28,fontWeight:700,color:C.white,lineHeight:1}}>
                  {editMode?(
                    <input type="number" value={draft.healthScore}
                      onChange={e=>setDraft({...draft,healthScore:parseFloat(e.target.value)||0})}
                      style={{width:60,background:"transparent",border:"none",borderBottom:"1px solid "+C.teal,color:C.white,fontSize:28,fontFamily:"Space Grotesk,sans-serif",fontWeight:700}}/>
                  ):metrics.healthScore} / 100
                </div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:2}}>Overall health score</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
          {editMode ? (
            <>
              <Btn small variant="ghost" onClick={cancelEdits}>Cancel</Btn>
              <Btn small onClick={saveEdits}>Save changes</Btn>
            </>
          ) : (
            <Btn small variant="ghost" onClick={()=>{setDraft({...metrics});setEditMode(true);}}>Edit Edit metrics</Btn>
          )}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:16,marginBottom:4}}>
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,padding:"18px 20px"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:C.teal,marginBottom:14}}>Membership</div>
          <StatItem label="Active members"   field="activeMembers"/>
          <StatItem label="Deferred members" field="deferredMembers"/>
          <StatItem label="Pensioners"       field="pensioners"/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",marginTop:4}}>
            <span style={{fontSize:13,fontWeight:600,color:C.navy}}>Total members</span>
            <span style={{fontFamily:"Space Grotesk,sans-serif",fontSize:18,fontWeight:700,color:C.navy}}>{totalMembers.toLocaleString()}</span>
          </div>
        </div>
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,padding:"18px 20px"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:C.teal,marginBottom:14}}>Funding</div>
          <StatItem label="Funding ratio"    field="fundingRatio"   suffix="%"  ragType="high" greenAt={95}  amberAt={85} dp={1}/>
          <StatItem label="Buyout funding"   field="buyoutFunding"  suffix="%"  ragType="high" greenAt={90}  amberAt={80} dp={1}/>
          <StatItem label="Scheme assets"    field="schemeAssets"   prefix="GBP"  suffix="m"     dp={0}/>
          <StatItem label="Monthly cashflow" field="monthlyCashflow" prefix={metrics.monthlyCashflow>= 0 ?"+GBP":"GBP"} suffix="m" dp={1}/>
        </div>
      </div>

      <SectionHeader title="Administration performance"/>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:16}}>
        <KPI label="Retirements SLA" field="retirementsSLA" suffix="%" greenAt={96} amberAt={90} dp={1}/>
        <KPI label="Transfers SLA"   field="transfersSLA"  suffix="%" greenAt={96} amberAt={90} dp={1}/>
        <KPI label="Deaths SLA"      field="deathsSLA"     suffix="%" greenAt={96} amberAt={90} dp={1}/>
        <KPI label="Member queries SLA" field="queriesSLA" suffix="%" greenAt={96} amberAt={90} dp={1}/>
      </div>
      <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 18px",marginBottom:4}}>
        <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Open cases</div>
        <StatItem label="Open cases total"  field="openCases"/>
        <StatItem label="Cases > 30 days"   field="cases30"  ragType="low" greenAt={5}  amberAt={20}/>
        <StatItem label="Cases > 90 days"   field="cases90"  ragType="low" greenAt={0}  amberAt={3}/>
      </div>

      <SectionHeader title="Data integrity"/>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(2,1fr)",gap:10,marginBottom:10}}>
        <KPI label="Common data score"      field="commonData"      suffix="%" greenAt={97} amberAt={92} dp={1}/>
        <KPI label="Conditional data score" field="conditionalData" suffix="%" greenAt={96} amberAt={90} dp={1}/>
      </div>
      <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 18px",marginBottom:4}}>
        <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Data issues</div>
        <StatItem label="Missing addresses"  field="missingAddress" ragType="low" greenAt={0} amberAt={50}/>
        <StatItem label="Missing NI numbers" field="missingNI"      ragType="low" greenAt={0} amberAt={20}/>
        <StatItem label="Duplicate records"  field="duplicates"     ragType="low" greenAt={0} amberAt={2}/>
      </div>

      <SectionHeader title="Risk and Governance"/>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:10,marginBottom:20}}>
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:C.faint,marginBottom:8}}>Open audit actions</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <Num field="auditActions"/>
            <span style={{fontSize:20}}>{ragLow(metrics.auditActions,5,2).icon}</span>
          </div>
        </div>
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:C.faint,marginBottom:8}}>Regulatory breaches</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <Num field="regBreaches"/>
            <span style={{fontSize:20}}>{ragLow(metrics.regBreaches,1,0).icon}</span>
          </div>
        </div>
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:C.faint,marginBottom:8}}>Cyber incidents</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <Num field="cyberIncidents"/>
            <span style={{fontSize:20}}>{ragLow(metrics.cyberIncidents,1,0).icon}</span>
          </div>
        </div>
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:C.faint,marginBottom:8}}>Critical risks</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <Num field="criticalRisks"/>
            <span style={{fontSize:20}}>{ragLow(metrics.criticalRisks,1,0).icon}</span>
          </div>
        </div>
      </div>
      <div style={{background:C.navy,borderRadius:12,padding:"20px 24px"}}>
        <div style={{fontSize:11,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.4)",marginBottom:12}}>Overall trustee health score</div>
        <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?36:48,fontWeight:700,color:C.white,letterSpacing:-1,lineHeight:1}}>
            {editMode?(
              <input type="number" value={draft.healthScore}
                onChange={e=>setDraft({...draft,healthScore:parseFloat(e.target.value)||0})}
                style={{width:100,background:"transparent",border:"none",borderBottom:"2px solid "+C.teal,color:C.white,fontSize:isMobile?36:48,fontFamily:"Space Grotesk,sans-serif",fontWeight:700,outline:"none"}}/>
            ):metrics.healthScore}
            <span style={{fontSize:isMobile?18:24,color:"rgba(255,255,255,0.4)",marginLeft:4}}>{"/100"}</span>
          </div>
          <div style={{flex:1,minWidth:200}}>
            <div style={{height:12,background:"rgba(255,255,255,0.1)",borderRadius:6,overflow:"hidden",marginBottom:8}}>
              <div style={{height:"100%",width:metrics.healthScore+"%",background:healthRag.colour,borderRadius:6,transition:"width 0.8s ease"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"rgba(255,255,255,0.3)"}}>
              <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
            </div>
          </div>
          <div style={{fontSize:36}}>{healthRag.icon}</div>
          <div>
            <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:16,fontWeight:600,color:healthRag.colour}}>
              {metrics.healthScore>=90 ?"Excellent":metrics.healthScore>=75 ?"Good":metrics.healthScore>=60 ?"Fair":"Needs attention"}
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:2}}>{quarter} assessment</div>
          </div>
        </div>
      </div>

      <div style={{marginTop:16,fontSize:11,color:C.faint,textAlign:"center",lineHeight:1.8}}>
        Trustee dashboard . {quarter} . Click <strong>Edit Edit metrics</strong> to update figures each quarter<br/>
        All RAG statuses are automatically calculated from the values entered
      </div>
    </div>
  );
};


export default function App(){
  const {user,loading,error,login,logout} = useAuth();
  const [section,setSection]=useState("dashboard");
  const [selectedClient,setSelectedClient]=useState(null);
  const [selectedCcy,setSelectedCcy]=useState("USD");
  const [previewClientId,setPreviewClientId]=useState(null);
  const isMobile=useIsMobile();

  useEffect(()=>{
    const style=document.createElement("style");
    style.innerHTML=`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box;}body{overflow-x:hidden;margin:0;padding:0;}`;
    style.id="iconv-global";
    if(!document.getElementById("iconv-global")) document.head.appendChild(style);
    return ()=>{ const el=document.getElementById("iconv-global"); if(el) el.remove(); };
  },[]);

  const handleSection=(s)=>{setSection(s);if(s!=="clients")setSelectedClient(null);};

  // Loading state
  if(loading){
    return(
      <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:32,fontWeight:700,color:C.white,marginBottom:20}}><span style={{color:C.teal}}>i-</span>Convergence</div>
          <div style={{width:32,height:32,border:"3px solid rgba(0,184,176,0.3)",borderTop:"3px solid "+C.teal,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto"}}/>
        </div>
      </div>
    );
  }

  // Not logged in
  if(!user){
    return <LoginScreen onLogin={login} loading={loading} error={error}/>;
  }

  // Client portal preview (adviser previewing a client view)
  if(previewClientId){
    return <ClientPortal user={user} logout={()=>setPreviewClientId(null)} selectedCcy={selectedCcy} setCcy={setSelectedCcy} previewClientId={previewClientId}/>;
  }

  // Client role - show client portal only
  if(user.isClient && !user.isAdviser){
    return <ClientPortal user={user} logout={logout} selectedCcy={selectedCcy} setCcy={setSelectedCcy}/>;
  }

  // Adviser role - full platform
  return(
    <div style={{fontFamily:"'Inter',sans-serif",background:"#F2F5F9",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <Nav section={section} setSection={handleSection} selectedCcy={selectedCcy} setCcy={setSelectedCcy} user={user} logout={logout}/>
      <div style={{flex:1,overflowY:"auto",paddingBottom:isMobile?68:0}}>
        {section==="dashboard"&&<Dashboard setSection={handleSection} setSelectedClient={setSelectedClient} selectedCcy={selectedCcy}/>}
        {section==="clients"&&<ClientsList selectedClient={selectedClient} setSelectedClient={setSelectedClient} selectedCcy={selectedCcy} setPreviewClientId={setPreviewClientId}/>}
        {section==="alerts"&&<AlertsPage setSection={handleSection} setSelectedClient={setSelectedClient}/>}
        {section==="pricing"&&<Pricing selectedCcy={selectedCcy}/>}
        {section==="ai"&&<AIAssistant selectedCcy={selectedCcy} selectedClient={selectedClient}/>}
        {section==="news"&&<News/>}
        {section==="connect"&&<Connect/>}
        {section==="users"&&<UserManagement user={user}/>}
        {section==="trustee"&&<TrusteePage/>}
      </div>
    </div>
  );
}
