import { useState, useMemo, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, AreaChart, Area } from "recharts";

// ─── AUTH0 CONFIG ────────────────────────────────────────────────────────────
const AUTH0_DOMAIN = "iconvergence.uk.auth0.com";
const AUTH0_CLIENT_ID = "jWc8OqcK0Vw77Z1sIYQOr7BNviukmrbp";
const AUTH0_REDIRECT_URI = typeof window !== "undefined" ? window.location.origin : "";
const AUTH0_AUDIENCE = "https://"+AUTH0_DOMAIN+"/api/v2/";

// ─── SIMPLE AUTH0 HOOK (no SDK dependency) ───────────────────────────────────
// Uses Auth0 Universal Login + PKCE flow - no SDK needed
const generateCodeVerifier = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
};
const generateCodeChallenge = async (verifier) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
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
      const base64 = token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
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


// ─── MOBILE HOOK ─────────────────────────────────────────────────
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
};



// ─── i-CONVERGENCE BRAND ───────────────────────────────────────────
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

// ─── FX RATES (from Price File + CNY) ───────────────────────────────
const FX = {
  GBPUSD: 1.2618, GBPEUR: 1.16027586, GBPCNY: 11.47,
  USDGBP: 0.79251862, USDEUR: 0.91954023, USDCNY: 7.24,
  EURGBP: 0.861864, EURUSD: 1.0875, EURCNY: 7.91,
  CNYGBP: 0.08726, CNYUSD: 0.1381, CNYEUR: 0.1264,
};

const convertAmount = (amount, fromCcy, toCcy) => {
  if (!amount || fromCcy === toCcy) return amount || 0;
  const key = `${fromCcy.toUpperCase()}${toCcy.toUpperCase()}`;
  if (FX[key]) return amount * FX[key];
  const key2 = `${toCcy.toUpperCase()}${fromCcy.toUpperCase()}`;
  if (FX[key2]) return amount / FX[key2];
  // Via USD
  const toUSD = FX[`${fromCcy.toUpperCase()}USD`] || 1;
  const fromUSD = FX[`USD${toCcy.toUpperCase()}`] || 1;
  return amount * toUSD * fromUSD;
};

const CCY_SYMBOLS = { USD: "$", GBP: "£", EUR: "€", CNY: "¥" };

// ─── ALL TRANSACTIONS (1283 rows from Excel) ─────────────────────────
// Fields: [sel, tradedate, settdate, clientId, txtype, ticker, desc, ccy, qty, consideration, netamt, costprice, costvalue]
const RAW_TXNS = [["T","2021-02-22","2021-02-24","C00355633","BUY","AGBP","Bought AGBP 2shs@GBP5.1823 (Rebalance)","GBP",2.0,10.36,-10.36,5.18,-10.36],["C","2023-06-30","2023-06-30","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharge 2023 06","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2023-06-30","2023-06-30","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharge 2023 06","USD",0.0,134.91,-134.91,0.0,0.0],["C","2023-06-30","2023-06-30","C00356735","Fee","Cash-GBP","Advisory Fee 2023 06","GBP",0.0,429.44,-429.44,0.0,0.0],["C","2023-06-30","2023-06-30","C00355634","Fee","Cash-USD","Advisory Fee 2023 06","USD",0.0,5.19,-5.19,0.0,0.0],["C","2023-06-30","2023-06-30","C00355634","Fee","Cash-USD","Advisory Fee 2023 06","USD",0.0,169.12,-169.12,0.0,0.0],["C","2023-06-30","2023-06-30","C00355633","Fee","Cash-USD","Advisory Fee 2023 06","USD",0.0,241.81,-241.81,0.0,0.0],["C","2023-06-30","2023-06-30","C00347223","Fee","Cash-GBP","Advisory Fee 2023 06","GBP",0.0,725.3,-725.3,0.0,0.0],["D","2023-06-30","2023-06-30","C00355634","Dividend","VYM","CashDiv VYM @USD0.876699per shs","USD",0.0,92.93,92.93,0.0,92.93],["D","2023-06-30","2023-06-30","C00355634","Dividend","VWO","CashDiv VWO @USD0.2267per shs","USD",0.0,95.9,95.9,0.0,95.9],["D","2023-06-30","2023-06-30","C00355633","Dividend","VWO","CashDiv VWO @USD0.2267per shs","USD",0.0,218.99,218.99,0.0,218.99],["D","2023-06-30","2023-06-30","C00355634","Dividend","VTI","CashDiv VTI @USD0.8265per shs","USD",0.0,244.65,244.65,0.0,244.65],["D","2023-06-30","2023-06-30","C00355633","Dividend","VTI","CashDiv VTI @USD0.8265per shs","USD",0.0,558.71,558.71,0.0,558.71],["D","2023-06-30","2023-06-30","C00355634","Dividend","VPL","CashDiv VPL @USD0.5213per shs","USD",0.0,157.42,157.42,0.0,157.42],["D","2023-06-30","2023-06-30","C00355633","Dividend","VPL","CashDiv VPL @USD0.5213per shs","USD",0.0,359.71,359.71,0.0,359.71],["D","2023-06-30","2023-06-30","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1952per shs","USD",0.0,42.94,42.94,0.0,42.94],["D","2023-06-30","2023-06-30","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1952per shs","USD",0.0,44.13,44.13,0.0,44.13],["D","2023-06-30","2023-06-30","C00356735","Dividend","VAPX","CashDiv VAPX @USD0.204532per shs","USD",0.0,474.72,474.72,0.0,474.72],["D","2023-06-30","2023-06-30","C00347223","Dividend","VAPX","CashDiv VAPX @USD0.204532per shs","USD",0.0,457.54,457.54,0.0,457.54],["D","2023-06-30","2023-06-30","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.432017per shs","USD",0.0,43.2,43.2,0.0,43.2],["D","2023-06-30","2023-06-30","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.1667per shs","USD",0.0,52.52,52.52,0.0,52.52],["D","2023-06-30","2023-06-30","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.1667per shs","USD",0.0,54.01,54.01,0.0,54.01],["D","2023-06-30","2023-06-30","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.1454per shs","USD",0.0,50.01,50.01,0.0,50.01],["D","2023-06-30","2023-06-30","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.1454per shs","USD",0.0,51.47,51.47,0.0,51.47],["D","2023-06-30","2023-06-30","C00355634","Dividend","LGLV","CashDiv LGLV @USD0.627497per shs","USD",0.0,78.44,78.44,0.0,78.44],["D","2023-06-30","2023-06-30","C00355634","Dividend","DBEU","CashDiv DBEU @USD1.37539per shs","USD",0.0,832.1,832.1,0.0,832.1],["D","2023-06-30","2023-06-30","C00355633","Dividend","DBEU","CashDiv DBEU @USD1.37539per shs","USD",0.0,1903.53,1903.53,0.0,1903.53],["D","2023-06-30","2023-06-30","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0726per shs","USD",0.0,29.91,29.91,0.0,29.91],["D","2023-06-30","2023-06-30","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0726per shs","USD",0.0,25.7,25.7,0.0,25.7],["D","2023-06-30","2023-06-30","C00356735","Dividend","XGIG","CashDiv XGIG @GBP0.0395per shs","GBP",0.0,27.02,27.02,0.0,27.02],["D","2023-06-30","2023-06-30","C00347223","Dividend","XGIG","CashDiv XGIG @GBP0.0395per shs","GBP",0.0,69.4,69.4,0.0,69.4],["D","2023-06-30","2023-06-30","C00356735","Dividend","ERNS","CashDiv ERNS @GBP1.9688per shs","GBP",0.0,637.89,637.89,0.0,637.89],["D","2023-06-30","2023-06-30","C00347223","Dividend","ERNS","CashDiv ERNS @GBP1.9688per shs","GBP",0.0,1368.31,1368.31,0.0,1368.31],["T","2022-09-09","2022-09-13","C00356735","SELL","GSPX","Rebalance - SELL GSPX 2shs@GBP5.63","GBP",-2.0,11.27,11.26,-6.65,13.29],["T","2023-05-15","2023-05-17","C00347223","SELL","EMIM","Rebalance - SELL EMIM 1shs@GBP23.588232","GBP",-1.0,23.59,23.59,-26.7,26.7],["C","2023-05-31","2023-05-31","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharges 2023 05","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2023-05-31","2023-05-31","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2023 05","USD",0.0,134.91,-134.91,0.0,0.0],["C","2023-04-30","2023-04-30","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharges 2023 04","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2023-04-30","2023-04-30","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2023 04","USD",0.0,134.91,-134.91,0.0,0.0],["T","2021-02-19","2021-02-23","C00355633","SELL","DBEU","Sold DBEU 1shs@USD31.1657","USD",-1.0,31.17,31.17,-31.47,31.47],["C","2023-03-31","2023-03-31","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharges 2023 03","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2023-03-31","2023-03-31","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2023 03","USD",0.0,134.91,-134.91,0.0,0.0],["C","2023-05-31","2023-05-31","C00356735","Fee","Cash-GBP","Advisory Fee 2023 05","GBP",0.0,419.96,-419.96,0.0,0.0],["C","2023-05-31","2023-05-31","C00355634","Fee","Cash-USD","Advisory Fee 2023 05","USD",0.0,5.19,-5.19,0.0,0.0],["C","2023-05-31","2023-05-31","C00355634","Fee","Cash-USD","Advisory Fee 2023 05","USD",0.0,166.65,-166.65,0.0,0.0],["C","2023-05-31","2023-05-31","C00355633","Fee","Cash-USD","Advisory Fee 2023 05","USD",0.0,236.7,-236.7,0.0,0.0],["C","2023-05-31","2023-05-31","C00347223","Fee","Cash-GBP","Advisory Fee 2023 05","GBP",0.0,714.21,-714.21,0.0,0.0],["D","2023-05-31","2023-05-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1826per shs","USD",0.0,38.34,38.34,0.0,38.34],["D","2023-05-31","2023-05-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1826per shs","USD",0.0,32.5,32.5,0.0,32.5],["D","2023-05-31","2023-05-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.392064per shs","USD",0.0,36.83,36.83,0.0,36.83],["D","2023-05-31","2023-05-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.1712per shs","USD",0.0,51.35,51.35,0.0,51.35],["D","2023-05-31","2023-05-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.1712per shs","USD",0.0,40.56,40.56,0.0,40.56],["D","2023-05-31","2023-05-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.1328per shs","USD",0.0,43.16,43.16,0.0,43.16],["D","2023-05-31","2023-05-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.1328per shs","USD",0.0,38.23,38.23,0.0,38.23],["D","2023-05-31","2023-05-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0698per shs","USD",0.0,27.36,27.36,0.0,27.36],["D","2023-05-31","2023-05-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0698per shs","USD",0.0,16.04,16.04,0.0,16.04],["D","2023-05-31","2023-05-31","C00356735","Dividend","EUXS","CashDiv EUXS @GBP0.0381per shs","GBP",0.0,561.59,561.59,0.0,561.59],["D","2023-05-31","2023-05-31","C00347223","Dividend","EUXS","CashDiv EUXS @GBP0.0381per shs","GBP",0.0,501.85,501.85,0.0,501.85],["T","2022-09-09","2022-09-13","C00347223","SELL","EUXS","Rebalance - SELL EUXS 6shs@GBP8.6014","GBP",-6.0,51.61,51.56,-6.42,38.49],["T","2021-02-22","2021-02-24","C00355633","SELL","VAPX","Sold VAPX 2shs@GBP22.4219 (Rebalance)","GBP",-2.0,44.84,44.84,-22.72,45.44],["T","2023-05-15","2023-05-17","C00347223","BUY","AGBP","Rebalance - BUY AGBP 13shs@GBP4.522379","GBP",13.0,58.79,-58.79,4.52,-58.79],["C","2023-04-30","2023-04-30","C00356735","Fee","Cash-GBP","Advisory Fee 2023 04","GBP",0.0,419.21,-419.21,0.0,0.0],["C","2023-04-30","2023-04-30","C00355634","Fee","Cash-USD","Advisory Fee 2023 04","USD",0.0,5.2,-5.2,0.0,0.0],["C","2023-04-30","2023-04-30","C00355634","Fee","Cash-USD","Advisory Fee 2023 04","USD",0.0,166.85,-166.85,0.0,0.0],["C","2023-04-30","2023-04-30","C00355633","Fee","Cash-USD","Advisory Fee 2023 04","USD",0.0,236.1,-236.1,0.0,0.0],["C","2023-04-30","2023-04-30","C00347223","Fee","Cash-GBP","Advisory Fee 2023 04","GBP",0.0,714.54,-714.54,0.0,0.0],["D","2023-04-30","2023-04-30","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1908per shs","USD",0.0,40.06,40.06,0.0,40.06],["D","2023-04-30","2023-04-30","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1908per shs","USD",0.0,33.96,33.96,0.0,33.96],["D","2023-04-30","2023-04-30","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.361604per shs","USD",0.0,33.98,33.98,0.0,33.98],["D","2023-04-30","2023-04-30","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.0856per shs","USD",0.0,25.67,25.67,0.0,25.67],["D","2023-04-30","2023-04-30","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.0856per shs","USD",0.0,20.28,20.28,0.0,20.28],["D","2023-04-30","2023-04-30","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.1561per shs","USD",0.0,50.74,50.74,0.0,50.74],["D","2023-04-30","2023-04-30","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.1561per shs","USD",0.0,44.96,44.96,0.0,44.96],["D","2023-04-30","2023-04-30","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0716per shs","USD",0.0,28.04,28.04,0.0,28.04],["D","2023-04-30","2023-04-30","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0716per shs","USD",0.0,16.46,16.46,0.0,16.46],["D","2023-04-30","2023-04-30","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.039499per shs","GBP",0.0,65.05,65.05,0.0,65.05],["D","2023-04-30","2023-04-30","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.039499per shs","GBP",0.0,150.57,150.57,0.0,150.57],["T","2021-02-19","2021-02-23","C00355633","BUY","VCSH","Bought VCSH 1shs@USD83.0742","USD",1.0,83.07,-83.07,83.07,-83.07],["T","2022-10-06","2022-10-11","C00355634","BUY","SCHP","Rebalance - BUY SCHP 2shs@USD51.9789","USD",2.0,103.96,-104.06,51.98,-103.96],["T","2021-02-22","2021-02-24","C00355633","BUY","XGIG","Bought XGIG 4shs@GBP27.0457 (Rebalance)","GBP",4.0,108.18,-108.18,27.05,-108.2],["T","2022-09-09","2022-09-13","C00356735","BUY","EMIM","Rebalance - BUY EMIM 5shs@GBP26.8034","GBP",5.0,134.02,-134.15,26.8,-134.02],["T","2022-10-06","2022-10-11","C00355634","BUY","BNDX","Rebalance - BUY BNDX 3shs@USD47.788","USD",3.0,143.36,-143.5,47.79,-143.36],["T","2021-02-19","2021-02-23","C00355633","SELL","VPL","Sold VPL 1shs@USD83.8990","USD",-1.0,83.9,83.9,-84.72,84.72],["C","2023-03-31","2023-03-31","C00356735","Fee","Cash-GBP","Advisory Fee 2023 03","GBP",0.0,409.69,-409.69,0.0,0.0],["C","2023-03-31","2023-03-31","C00355634","Fee","Cash-USD","Advisory Fee 2023 03","USD",0.0,5.2,-5.2,0.0,0.0],["C","2023-03-31","2023-03-31","C00355634","Fee","Cash-USD","Advisory Fee 2023 03","USD",0.0,162.89,-162.89,0.0,0.0],["C","2023-03-31","2023-03-31","C00355633","Fee","Cash-USD","Advisory Fee 2023 03","USD",0.0,229.39,-229.39,0.0,0.0],["C","2023-03-31","2023-03-31","C00347223","Fee","Cash-GBP","Advisory Fee 2023 03","GBP",0.0,701.63,-701.63,0.0,0.0],["D","2023-03-31","2023-03-31","C00355634","Dividend","VYM","CashDiv VYM @USD0.717199per shs","USD",0.0,76.02,76.02,0.0,76.02],["D","2023-03-31","2023-03-31","C00355634","Dividend","VWO","CashDiv VWO @USD0.0281per shs","USD",0.0,11.59,11.59,0.0,11.59],["D","2023-03-31","2023-03-31","C00355633","Dividend","VWO","CashDiv VWO @USD0.0281per shs","USD",0.0,23.32,23.32,0.0,23.32],["D","2023-03-31","2023-03-31","C00355634","Dividend","VTI","CashDiv VTI @USD0.7862per shs","USD",0.0,233.48,233.48,0.0,233.48],["D","2023-03-31","2023-03-31","C00355633","Dividend","VTI","CashDiv VTI @USD0.7862per shs","USD",0.0,575.48,575.48,0.0,575.48],["D","2023-03-31","2023-03-31","C00355634","Dividend","VPL","CashDiv VPL @USD0.1459per shs","USD",0.0,47.12,47.12,0.0,47.12],["D","2023-03-31","2023-03-31","C00355633","Dividend","VPL","CashDiv VPL @USD0.1459per shs","USD",0.0,94.39,94.39,0.0,94.39],["D","2023-03-31","2023-03-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1639per shs","USD",0.0,34.43,34.43,0.0,34.43],["D","2023-03-31","2023-03-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1639per shs","USD",0.0,29.16,29.16,0.0,29.16],["D","2023-03-31","2023-03-31","C00356735","Dividend","VAPX","CashDiv VAPX @USD0.296923per shs","USD",0.0,610.16,610.16,0.0,610.16],["D","2023-03-31","2023-03-31","C00347223","Dividend","VAPX","CashDiv VAPX @USD0.296923per shs","USD",0.0,675.8,675.8,0.0,675.8],["D","2023-03-31","2023-03-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.278003per shs","USD",0.0,26.13,26.13,0.0,26.13],["D","2023-03-31","2023-03-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.1332per shs","USD",0.0,43.28,43.28,0.0,43.28],["D","2023-03-31","2023-03-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.1332per shs","USD",0.0,38.36,38.36,0.0,38.36],["D","2023-03-31","2023-03-31","C00355634","Dividend","LGLV","CashDiv LGLV @USD0.59399per shs","USD",0.0,74.25,74.25,0.0,74.25],["D","2023-03-31","2023-03-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0588per shs","USD",0.0,23.05,23.05,0.0,23.05],["D","2023-03-31","2023-03-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0588per shs","USD",0.0,13.51,13.51,0.0,13.51],["D","2023-03-31","2023-03-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.036258per shs","GBP",0.0,59.72,59.72,0.0,59.72],["D","2023-03-31","2023-03-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.038557per shs","GBP",0.0,63.51,63.51,0.0,63.51],["D","2023-03-31","2023-03-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.036258per shs","GBP",0.0,138.21,138.21,0.0,138.21],["D","2023-03-31","2023-03-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.038557per shs","GBP",0.0,146.98,146.98,0.0,146.98],["D","2023-03-31","2023-03-31","C00356735","Dividend","IS15","CashDiv IS15 @GBP1.3028per shs","GBP",0.0,399.94,399.94,0.0,399.94],["D","2023-03-31","2023-03-31","C00347223","Dividend","IS15","CashDiv IS15 @GBP1.3028per shs","GBP",0.0,967.96,967.96,0.0,967.96],["T","2021-02-22","2021-02-24","C00355633","SELL","IS15","Sold IS15 1shs@GBP107.5874 (Rebalance)","GBP",-1.0,107.59,107.59,-107.75,107.75],["T","2021-02-19","2021-02-23","C00355634","BUY","VPL","Bought VPL 3shs@USD83.8990","USD",3.0,251.7,-251.7,83.9,-251.7],["T","2021-02-22","2021-02-24","C00355633","SELL","EUXS","Sold EUXS 23shs@GBP5.6787 (Rebalance)","GBP",-23.0,130.61,130.61,-5.71,131.33],["T","2023-05-15","2023-05-17","C00355634","BUY","VWO","Rebalance - BUY VWO 10shs@USD39.8924","USD",10.0,398.92,-398.92,39.89,-398.92],["T","2022-09-09","2022-09-13","C00356735","BUY","XGIG","Rebalance - BUY XGIG 16shs@GBP25.2718","GBP",16.0,404.35,-404.75,25.27,-404.35],["T","2020-11-19","2020-11-23","C00347223","BUY","CUKX","Bought CUKX 4shs@GBP106.6376","GBP",4.0,426.55,-426.55,106.64,-426.55],["T","2021-02-22","2021-02-24","C00355633","SELL","EMIM","Sold EMIM 7shs@GBP27.6300 (Rebalance)","GBP",-7.0,193.41,193.41,-28.08,196.56],["T","2021-02-22","2021-02-24","C00355633","SELL","ERNS","Sold ERNS 2shs@GBP100.5653 (Rebalance)","GBP",-2.0,201.13,201.13,-100.55,201.1],["T","2021-02-22","2021-02-24","C00355633","SELL","IJPH","Sold IJPH 3shs@GBP69.6840 (Rebalance)","GBP",-3.0,209.05,209.05,-68.01,204.03],["T","2023-05-15","2023-05-17","C00355634","SELL","VTI","Rebalance - SELL VTI 1shs@USD204.137","USD",-1.0,204.14,204.14,-213.02,213.02],["T","2022-09-09","2022-09-13","C00356735","BUY","AGBP","Rebalance - BUY AGBP 106shs@GBP4.5691","GBP",106.0,484.32,-484.8,4.57,-484.32],["T","2022-09-09","2022-09-13","C00356735","SELL","VAPX","Rebalance - SELL VAPX 11shs@GBP29.0864","GBP",-11.0,319.95,319.63,-20.71,227.81],["T","2021-02-16","2021-02-18","C00355633","BUY","VCSH","Bought VCSH 6shs@USD83.0752","USD",6.0,498.45,-498.45,83.08,-498.48],["T","2021-03-18","2021-03-22","C00355633","BUY","SCHP","Bought SCHP 9shs@USD60.8030","USD",9.0,547.23,-547.23,60.8,-547.23],["T","2021-02-16","2021-02-18","C00355633","BUY","SCHP","Bought SCHP 9shs@USD61.9979","USD",9.0,557.98,-557.98,62.0,-558.0],["T","2021-02-22","2021-02-24","C00355633","BUY","VGOV","Bought VGOV 23shs@GBP24.2842 (Rebalance)","GBP",23.0,558.54,-558.54,24.28,-558.44],["T","2021-03-18","2021-03-22","C00355633","BUY","SCHO","Bought SCHO 11shs@USD51.2913","USD",11.0,564.2,-564.2,51.29,-564.2],["T","2021-02-16","2021-02-18","C00355633","BUY","SCHO","Bought SCHO 11shs@USD51.3696","USD",11.0,565.07,-565.07,51.37,-565.07],["T","2021-03-18","2021-03-22","C00355633","BUY","VCSH","Bought VCSH 7shs@USD82.3121","USD",7.0,576.18,-576.18,82.31,-576.18],["T","2021-04-15","2021-04-19","C00355633","BUY","VCSH","Bought VCSH 7shs@USD82.6154","USD",7.0,578.31,-578.31,82.62,-578.31],["T","2021-02-19","2021-02-23","C00355634","BUY","SGOV","Bought SGOV 6shs@USD100.0180","USD",6.0,600.11,-600.11,100.02,-600.12],["T","2023-05-15","2023-05-17","C00355634","BUY","SGOV","Rebalance - BUY SGOV 6shs@USD100.3878","USD",6.0,602.33,-602.33,100.39,-602.33],["T","2021-04-15","2021-04-19","C00355633","BUY","SCHO","Bought SCHO 12shs@USD51.295","USD",12.0,615.54,-615.54,51.3,-615.54],["T","2021-04-15","2021-04-19","C00355633","BUY","SCHP","Bought SCHP 10shs@USD61.5579","USD",10.0,615.58,-615.58,61.56,-615.58],["T","2021-02-19","2021-02-23","C00355634","BUY","SCHO","Bought SCHO 14shs@USD51.3697","USD",14.0,719.18,-719.18,51.37,-719.18],["T","2021-11-29","2021-12-01","C00356735","SELL","CUKX","Sold CUKX 3shs@GBP123.2983","GBP",-3.0,369.9,369.9,-111.08,333.24],["T","2021-02-19","2021-02-23","C00355634","BUY","VCSH","Bought VCSH 9shs@USD83.0742","USD",9.0,747.67,-747.67,83.07,-747.63],["T","2023-05-15","2023-05-17","C00355634","BUY","VCSH","Rebalance - BUY VCSH 10shs@USD76.2495","USD",10.0,762.5,-762.5,76.25,-762.5],["T","2021-02-19","2021-02-23","C00355634","SELL","VWO","Sold VWO 7shs@USD56.1686","USD",-7.0,393.18,393.18,-49.35,345.44],["T","2022-09-09","2022-09-13","C00347223","BUY","XGIG","Rebalance - BUY XGIG 31shs@GBP25.2718","GBP",31.0,783.43,-784.21,25.27,-783.43],["T","2021-02-19","2021-02-23","C00355634","BUY","SCHP","Bought SCHP 13shs@USD61.3972","USD",13.0,798.16,-798.16,61.4,-798.2],["T","2023-05-15","2023-05-17","C00355634","BUY","SCHP","Rebalance - BUY SCHP 15shs@USD53.2637","USD",15.0,798.96,-798.96,53.26,-798.96],["T","2020-11-19","2020-11-23","C00347223","BUY","VAPX","Bought VAPX 41shs@GBP20.5552","GBP",41.0,842.76,-842.76,20.56,-842.76],["T","2021-02-19","2021-02-23","C00355634","BUY","BNDX","Bought BNDX 15shs@USD57.4242","USD",15.0,861.36,-861.36,57.42,-861.3],["T","2020-11-19","2020-11-23","C00347223","BUY","IJPH","Bought IJPH 14shs@GBP61.5592","GBP",14.0,861.83,-861.83,61.56,-861.83],["T","2021-11-29","2021-12-01","C00356735","SELL","XGIG","Sold XGIG 14shs@GBP29.6493","GBP",-14.0,415.09,415.09,-26.92,376.83],["T","2023-05-15","2023-05-17","C00355634","BUY","SCHO","Rebalance - BUY SCHO 19shs@USD48.7381","USD",19.0,926.02,-926.02,48.74,-926.02],["T","2023-05-15","2023-05-17","C00355634","BUY","BNDX","Rebalance - BUY BNDX 20shs@USD48.8656","USD",20.0,977.31,-977.31,48.87,-977.31],["T","2021-02-22","2021-02-24","C00355633","BUY","CSH2","Bought CSH2 1shs@GBP1033.6600 (Rebalance)","GBP",1.0,1033.66,-1033.66,1033.66,-1033.66],["T","2020-11-16","2020-11-18","C00355633","BUY","CUKX","Bought CUKX 10shs@GBP107.0605","GBP",10.0,1070.61,-1070.61,107.06,-1070.61],["T","2020-12-16","2020-12-18","C00355633","BUY","CUKX","Bought CUKX 10shs@GBP111.0942","GBP",10.0,1110.94,-1110.94,111.09,-1110.9],["T","2021-11-29","2021-12-01","C00356735","SELL","AGBP","Sold AGBP 82shs@GBP5.1596","GBP",-82.0,423.08,423.08,-5.15,422.16],["T","2021-01-15","2021-01-17","C00355633","BUY","CUKX","Bought CUKX 10shs@GBP114.2108","GBP",10.0,1142.11,-1142.11,114.21,-1142.1],["C","2023-02-28","2023-02-28","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2023 02","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2023-02-28","2023-02-28","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2023 02","USD",0.0,134.91,-134.91,0.0,0.0],["C","2023-02-28","2023-02-28","C00356735","Fee","Cash-GBP","Advisory Fee 2023 02","GBP",0.0,418.74,-418.74,0.0,0.0],["C","2023-02-28","2023-02-28","C00355634","Fee","Cash-USD","Advisory Fee 2023 02","USD",0.0,5.2,-5.2,0.0,0.0],["C","2023-02-28","2023-02-28","C00355634","Fee","Cash-USD","Advisory Fee 2023 02","USD",0.0,165.99,-165.99,0.0,0.0],["C","2023-02-28","2023-02-28","C00355633","Fee","Cash-USD","Advisory Fee 2023 02","USD",0.0,235.09,-235.09,0.0,0.0],["C","2023-02-28","2023-02-28","C00347223","Fee","Cash-GBP","Advisory Fee 2023 02","GBP",0.0,713.41,-713.41,0.0,0.0],["D","2023-02-28","2023-02-28","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1723per shs","USD",0.0,36.18,36.18,0.0,36.18],["D","2023-02-28","2023-02-28","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1723per shs","USD",0.0,30.67,30.67,0.0,30.67],["D","2023-02-28","2023-02-28","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.393571per shs","USD",0.0,36.99,36.99,0.0,36.99],["D","2023-02-28","2023-02-28","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.1093per shs","USD",0.0,35.5,35.5,0.0,35.5],["D","2023-02-28","2023-02-28","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.1093per shs","USD",0.0,31.45,31.45,0.0,31.45],["D","2023-02-28","2023-02-28","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0627per shs","USD",0.0,24.57,24.57,0.0,24.57],["D","2023-02-28","2023-02-28","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0627per shs","USD",0.0,14.4,14.4,0.0,14.4],["D","2023-02-28","2023-02-28","C00356735","Dividend","XGIG","CashDiv XGIG @GBP0.0396per shs","GBP",0.0,24.99,24.99,0.0,24.99],["D","2023-02-28","2023-02-28","C00347223","Dividend","XGIG","CashDiv XGIG @GBP0.0396per shs","GBP",0.0,64.83,64.83,0.0,64.83],["D","2023-02-28","2023-02-28","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.041819per shs","GBP",0.0,68.88,68.88,0.0,68.88],["D","2023-02-28","2023-02-28","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.041819per shs","GBP",0.0,159.41,159.41,0.0,159.41],["D","2023-02-28","2023-02-28","C00356735","Dividend","GSPX","CashDiv GSPX @GBP0.0462per shs","GBP",0.0,1811.87,1811.87,0.0,1811.87],["D","2023-02-28","2023-02-28","C00347223","Dividend","GSPX","CashDiv GSPX @GBP0.0462per shs","GBP",0.0,1616.1,1616.1,0.0,1616.1],["D","2023-02-28","2023-02-28","C00356735","Dividend","EUXS","CashDiv EUXS @GBP0.0139per shs","GBP",0.0,204.89,204.89,0.0,204.89],["D","2023-02-28","2023-02-28","C00347223","Dividend","EUXS","CashDiv EUXS @GBP0.0139per shs","GBP",0.0,183.09,183.09,0.0,183.09],["T","2022-09-09","2022-09-13","C00347223","BUY","VAPX","Rebalance - BUY VAPX 43shs@GBP29.0864","GBP",43.0,1250.72,-1251.97,29.09,-1250.72],["T","2023-05-15","2023-05-17","C00356735","BUY","XGIG","Rebalance - BUY XGIG 53shs@GBP24.199855","GBP",53.0,1282.59,-1282.59,24.2,-1282.59],["T","2020-11-19","2020-11-23","C00347223","BUY","XGIG","Bought XGIG 48shs@GBP27.4399","GBP",48.0,1317.12,-1317.12,27.44,-1317.12],["T","2020-11-19","2020-11-23","C00347223","BUY","AGBP","Bought AGBP 252shs@GBP5.2970","GBP",252.0,1334.86,-1334.86,5.3,-1334.84],["C","2021-04-30","2021-04-30","C00356735","Fee","CASH-GBP","Advisory Fee 2021 04 (Reverse Apr-21)","GBP",0.0,444.41,444.41,0.0,0.0],["C","2021-04-30","2021-04-30","C00355634","Fee","CASH-USD","Advisory Fee 2021 04 (Reverse Apr-21)","USD",0.0,184.56,184.56,0.0,0.0],["C","2021-04-30","2021-04-30","C00355633","Fee","CASH-GBP","Advisory Fee 2021 04 (Reverse Apr-21)","GBP",0.0,176.95,176.95,0.0,0.0],["C","2021-04-30","2021-04-30","C00347223","Fee","CASH-GBP","Advisory Fee 2021 04 (Reverse Apr-21)","GBP",0.0,760.31,760.31,0.0,0.0],["C","2021-04-30","2021-04-30","C00356735","Fee","CASH-GBP","Advisory Fee 2021 04 (Apr-21)","GBP",0.0,444.41,-444.41,0.0,0.0],["C","2021-04-30","2021-04-30","C00355634","Fee","CASH-USD","Advisory Fee 2021 04 (Apr-21)","USD",0.0,184.56,-184.56,0.0,0.0],["C","2021-04-30","2021-04-30","C00355633","Fee","CASH-GBP","Advisory Fee 2021 04 (Apr-21)","GBP",0.0,176.95,-176.95,0.0,0.0],["C","2021-04-30","2021-04-30","C00347223","Fee","CASH-GBP","Advisory Fee 2021 04 (Apr-21)","GBP",0.0,760.31,-760.31,0.0,0.0],["C","2021-03-31","2021-03-31","C00356735","Fee","CASH-GBP","Advisory Fee 2021 03","GBP",0.0,447.15,-447.15,0.0,0.0],["C","2021-03-31","2021-03-31","C00355634","Fee","CASH-USD","Advisory Fee 2021 03","USD",0.0,186.89,-186.89,0.0,0.0],["C","2021-03-31","2021-03-31","C00355633","Fee","CASH-GBP","Advisory Fee 2021 03","GBP",0.0,180.03,-180.03,0.0,0.0],["C","2021-03-31","2021-03-31","C00347223","Fee","CASH-GBP","Advisory Fee 2021 03","GBP",0.0,774.12,-774.12,0.0,0.0],["C","2021-01-31","2021-01-31","C00355634","Fee","CASH-USD","Advisory Fee 2021 01","USD",0.0,179.67,-179.67,0.0,0.0],["C","2021-01-31","2021-01-31","C00355633","Fee","CASH-GBP","Advisory Fee 2021 01","GBP",0.0,173.68,-173.68,0.0,0.0],["C","2021-01-31","2021-01-31","C00347223","Fee","CASH-GBP","Advisory Fee 2021 01","GBP",0.0,741.02,-741.02,0.0,0.0],["C","2021-02-28","2021-02-28","C00356735","Fee","CASH-GBP","Advisory Fee 2021 02","GBP",0.0,257.94,-257.94,0.0,0.0],["C","2021-02-28","2021-02-28","C00355634","Fee","CASH-USD","Advisory Fee 2021 02","USD",0.0,179.75,-179.75,0.0,0.0],["C","2021-02-28","2021-02-28","C00355633","Fee","CASH-GBP","Advisory Fee 2021 02","GBP",0.0,172.33,-172.33,0.0,0.0],["C","2021-02-28","2021-02-28","C00347223","Fee","CASH-GBP","Advisory Fee 2021 02","GBP",0.0,743.3,-743.3,0.0,0.0],["C","2020-11-30","2020-11-30","C00355634","Fee","CASH-USD","Advisory Fee 2020 11","USD",0.0,237.82,-237.82,0.0,0.0],["C","2020-11-30","2020-11-30","C00355633","Fee","CASH-GBP","Advisory Fee 2020 11","GBP",0.0,173.39,-173.39,0.0,0.0],["C","2020-11-30","2020-11-30","C00347223","Fee","CASH-GBP","Advisory Fee 2020 11","GBP",0.0,729.23,-729.23,0.0,0.0],["C","2020-11-01","2020-10-31","C00355633","Fee","CASH-GBP","Advisory Fee 2020 10","GBP",0.0,22.37,-22.37,0.0,0.0],["C","2020-10-31","2020-10-31","C00355634","Fee","CASH-USD","Advisory Fee 2020 10","USD",0.0,238.07,-238.07,0.0,0.0],["C","2020-10-31","2020-10-31","C00347223","Fee","CASH-GBP","Advisory Fee 2020 10","GBP",0.0,698.91,-698.91,0.0,0.0],["C","2020-09-30","2020-09-30","C00355634","Fee","CASH-USD","Advisory Fee 2020 09","USD",0.0,63.52,-63.52,0.0,0.0],["C","2020-09-30","2020-09-30","C00347223","Fee","CASH-GBP","Advisory Fee 2020 09","GBP",0.0,707.92,-707.92,0.0,0.0],["T","2020-11-19","2020-11-23","C00347223","BUY","EMIM","Bought EMIM 56shs@GBP24.8653","GBP",56.0,1392.46,-1392.46,24.87,-1392.46],["C","2023-01-31","2023-01-31","C00356735","Fee","Cash-GBP","Advisory Fee 2023 01","GBP",0.0,424.81,-424.81,0.0,0.0],["C","2023-01-31","2023-01-31","C00355634","Fee","Cash-USD","Advisory Fee 2023 01","USD",0.0,5.37,-5.37,0.0,0.0],["C","2023-01-31","2023-01-31","C00355634","Fee","Cash-USD","Advisory Fee 2023 01","USD",0.0,169.74,-169.74,0.0,0.0],["C","2023-01-31","2023-01-31","C00355633","Fee","Cash-USD","Advisory Fee 2023 01","USD",0.0,238.54,-238.54,0.0,0.0],["C","2023-01-31","2023-01-31","C00347223","Fee","Cash-GBP","Advisory Fee 2023 01","GBP",0.0,726.76,-726.76,0.0,0.0],["C","2023-01-31","2023-01-31","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2023 01","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2023-01-31","2023-01-31","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2023 01","USD",0.0,134.91,-134.91,0.0,0.0],["D","2023-01-31","2023-01-31","C00356735","Dividend","ERNS","CashDiv ERNS @GBP0.8672per shs","GBP",0.0,261.01,261.01,0.0,261.01],["D","2023-01-31","2023-01-31","C00347223","Dividend","ERNS","CashDiv ERNS @GBP0.8672per shs","GBP",0.0,626.94,626.94,0.0,626.94],["D","2023-01-31","2023-01-31","C00356735","Dividend","AGBP","CashDiv AGBP @GBP0.0418per shs","GBP",0.0,138.1,138.1,0.0,138.1],["D","2023-01-31","2023-01-31","C00347223","Dividend","AGBP","CashDiv AGBP @GBP0.0418per shs","GBP",0.0,391.91,391.91,0.0,391.91],["T","2021-02-22","2021-02-24","C00355633","SELL","GSPX","Sold GSPX 77shs@GBP6.7890 (Rebalance)","GBP",-77.0,522.75,522.75,-6.83,525.91],["T","2022-09-09","2022-09-13","C00347223","BUY","IS15","Rebalance - BUY IS15 15shs@GBP100.9804","GBP",15.0,1514.71,-1516.22,100.98,-1514.71],["T","2023-05-15","2023-05-17","C00356735","BUY","AGBP","Rebalance - BUY AGBP 349shs@GBP4.522379","GBP",349.0,1578.31,-1578.31,4.52,-1578.31],["C","2022-12-31","2022-12-31","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2022 12","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2022-12-31","2022-12-31","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2022 12","USD",0.0,134.91,-134.91,0.0,0.0],["C","2022-12-31","2022-12-31","C00356735","Fee","Cash-GBP","Advisory Fee 2022 12","GBP",0.0,403.74,-403.74,0.0,0.0],["C","2022-12-31","2022-12-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 12","USD",0.0,5.21,-5.21,0.0,0.0],["C","2022-12-31","2022-12-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 12","USD",0.0,160.53,-160.53,0.0,0.0],["C","2022-12-31","2022-12-31","C00355633","Fee","Cash-USD","Advisory Fee 2022 12","USD",0.0,224.41,-224.41,0.0,0.0],["C","2022-12-31","2022-12-31","C00347223","Fee","Cash-GBP","Advisory Fee 2022 12","GBP",0.0,692.97,-692.97,0.0,0.0],["D","2022-12-31","2022-12-31","C00355634","Dividend","VYM","CashDiv VYM @USD0.974499per shs","USD",0.0,103.3,103.3,0.0,103.3],["D","2022-12-31","2022-12-31","C00355634","Dividend","VWO","CashDiv VWO @USD0.6347per shs","USD",0.0,262.14,262.14,0.0,262.14],["D","2022-12-31","2022-12-31","C00355633","Dividend","VWO","CashDiv VWO @USD0.6347per shs","USD",0.0,526.8,526.8,0.0,526.8],["D","2022-12-31","2022-12-31","C00355634","Dividend","VTI","CashDiv VTI @USD0.9305per shs","USD",0.0,276.36,276.36,0.0,276.36],["D","2022-12-31","2022-12-31","C00355633","Dividend","VTI","CashDiv VTI @USD0.9305per shs","USD",0.0,681.12,681.12,0.0,681.12],["D","2022-12-31","2022-12-31","C00355634","Dividend","VPL","CashDiv VPL @USD1.026per shs","USD",0.0,331.39,331.39,0.0,331.39],["D","2022-12-31","2022-12-31","C00355633","Dividend","VPL","CashDiv VPL @USD1.026per shs","USD",0.0,663.82,663.82,0.0,663.82],["D","2022-12-31","2022-12-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1693per shs","USD",0.0,35.54,35.54,0.0,35.54],["D","2022-12-31","2022-12-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1496per shs","USD",0.0,31.42,31.42,0.0,31.42],["D","2022-12-31","2022-12-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1693per shs","USD",0.0,30.15,30.15,0.0,30.15],["D","2022-12-31","2022-12-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1496per shs","USD",0.0,26.64,26.64,0.0,26.64],["D","2022-12-31","2022-12-31","C00356735","Dividend","VAPX","CashDiv VAPX @USD0.140532per shs","USD",0.0,288.79,288.79,0.0,288.79],["D","2022-12-31","2022-12-31","C00347223","Dividend","VAPX","CashDiv VAPX @USD0.140532per shs","USD",0.0,319.84,319.84,0.0,319.84],["D","2022-12-31","2022-12-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.283489per shs","USD",0.0,26.65,26.65,0.0,26.65],["D","2022-12-31","2022-12-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.326661per shs","USD",0.0,30.71,30.71,0.0,30.71],["D","2022-12-31","2022-12-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.431per shs","USD",0.0,129.3,129.3,0.0,129.3],["D","2022-12-31","2022-12-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.2714per shs","USD",0.0,81.41,81.41,0.0,81.41],["D","2022-12-31","2022-12-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.2714per shs","USD",0.0,64.31,64.31,0.0,64.31],["D","2022-12-31","2022-12-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.431per shs","USD",0.0,102.15,102.15,0.0,102.15],["D","2022-12-31","2022-12-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0847per shs","USD",0.0,27.53,27.53,0.0,27.53],["D","2022-12-31","2022-12-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.1165per shs","USD",0.0,37.86,37.86,0.0,37.86],["D","2022-12-31","2022-12-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.1165per shs","USD",0.0,33.55,33.55,0.0,33.55],["D","2022-12-31","2022-12-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0847per shs","USD",0.0,24.39,24.39,0.0,24.39],["D","2022-12-31","2022-12-31","C00355634","Dividend","LGLV","CashDiv LGLV @USD0.779127per shs","USD",0.0,97.39,97.39,0.0,97.39],["D","2022-12-31","2022-12-31","C00355634","Dividend","DBEU","CashDiv DBEU @USD0.14282per shs","USD",0.0,97.68,97.68,0.0,97.68],["D","2022-12-31","2022-12-31","C00355633","Dividend","DBEU","CashDiv DBEU @USD0.14282per shs","USD",0.0,255.07,255.07,0.0,255.07],["D","2022-12-31","2022-12-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.2153per shs","USD",0.0,84.4,84.4,0.0,84.4],["D","2022-12-31","2022-12-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.2153per shs","USD",0.0,49.52,49.52,0.0,49.52],["D","2022-12-31","2022-12-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0598per shs","USD",0.0,23.38,23.38,0.0,23.38],["D","2022-12-31","2022-12-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0598per shs","USD",0.0,13.71,13.71,0.0,13.71],["D","2022-12-31","2022-12-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.039177per shs","GBP",0.0,64.35,64.35,0.0,64.35],["D","2022-12-31","2022-12-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.039177per shs","GBP",0.0,148.94,148.94,0.0,148.94],["D","2022-12-31","2022-12-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.03222per shs","GBP",0.0,53.06,53.06,0.0,53.06],["D","2022-12-31","2022-12-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.03222per shs","GBP",0.0,122.83,122.83,0.0,122.83],["T","2020-11-19","2020-11-23","C00347223","BUY","EUXS","Bought EUXS 318shs@GBP5.3801","GBP",318.0,1710.86,-1710.86,5.38,-1710.87],["C","2022-11-30","2022-11-30","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2022 11","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2022-11-30","2022-11-30","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2022 11","USD",0.0,134.91,-134.91,0.0,0.0],["C","2022-11-30","2022-11-30","C00356735","Fee","Cash-GBP","Advisory Fee 2022 11","GBP",0.0,404.53,-404.53,0.0,0.0],["C","2022-11-30","2022-11-30","C00355634","Fee","Cash-USD","Advisory Fee 2022 11","USD",0.0,5.21,-5.21,0.0,0.0],["C","2022-11-30","2022-11-30","C00355634","Fee","Cash-USD","Advisory Fee 2022 11","USD",0.0,159.58,-159.58,0.0,0.0],["C","2022-11-30","2022-11-30","C00355633","Fee","Cash-USD","Advisory Fee 2022 11","USD",0.0,222.97,-222.97,0.0,0.0],["C","2022-11-30","2022-11-30","C00347223","Fee","Cash-GBP","Advisory Fee 2022 11","GBP",0.0,693.49,-693.49,0.0,0.0],["D","2022-11-30","2022-11-30","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1481per shs","USD",0.0,31.09,31.09,0.0,31.09],["D","2022-11-30","2022-11-30","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1481per shs","USD",0.0,26.37,26.37,0.0,26.37],["D","2022-11-30","2022-11-30","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.240614per shs","USD",0.0,22.61,22.61,0.0,22.61],["D","2022-11-30","2022-11-30","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.153per shs","USD",0.0,45.91,45.91,0.0,45.91],["D","2022-11-30","2022-11-30","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.153per shs","USD",0.0,36.27,36.27,0.0,36.27],["D","2022-11-30","2022-11-30","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0775per shs","USD",0.0,25.19,25.19,0.0,25.19],["D","2022-11-30","2022-11-30","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0775per shs","USD",0.0,22.31,22.31,0.0,22.31],["D","2022-11-30","2022-11-30","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0541per shs","USD",0.0,21.21,21.21,0.0,21.21],["D","2022-11-30","2022-11-30","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0541per shs","USD",0.0,12.44,12.44,0.0,12.44],["D","2022-11-30","2022-11-30","C00356735","Dividend","XGIG","CashDiv XGIG @GBP0.0388per shs","GBP",0.0,24.43,24.43,0.0,24.43],["D","2022-11-30","2022-11-30","C00347223","Dividend","XGIG","CashDiv XGIG @GBP0.0388per shs","GBP",0.0,63.36,63.36,0.0,63.36],["D","2022-11-30","2022-11-30","C00356735","Dividend","EUXS","CashDiv EUXS @GBP0.006per shs","GBP",0.0,88.33,88.33,0.0,88.33],["D","2022-11-30","2022-11-30","C00347223","Dividend","EUXS","CashDiv EUXS @GBP0.006per shs","GBP",0.0,78.93,78.93,0.0,78.93],["T","2021-02-22","2021-02-24","C00347223","BUY","AGBP","Bought AGBP 355shs@GBP5.1823 (Rebalance)","GBP",355.0,1839.7,-1839.7,5.18,-1838.9],["C","2022-10-31","2022-10-31","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2022 10","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2022-10-31","2022-10-31","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2022 10","USD",0.0,134.91,-134.91,0.0,0.0],["C","2022-10-31","2022-10-31","C00356735","Fee","Cash-GBP","Advisory Fee 2022 10","GBP",0.0,386.77,-386.77,0.0,0.0],["C","2022-10-31","2022-10-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 10","USD",0.0,5.22,-5.22,0.0,0.0],["C","2022-10-31","2022-10-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 10","USD",0.0,153.31,-153.31,0.0,0.0],["C","2022-10-31","2022-10-31","C00355633","Fee","Cash-USD","Advisory Fee 2022 10","USD",0.0,211.12,-211.12,0.0,0.0],["C","2022-10-31","2022-10-31","C00347223","Fee","Cash-GBP","Advisory Fee 2022 10","GBP",0.0,665.77,-665.77,0.0,0.0],["D","2022-10-31","2022-10-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1443per shs","USD",0.0,32.19,32.19,0.0,32.19],["D","2022-10-31","2022-10-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1443per shs","USD",0.0,25.69,25.69,0.0,25.69],["D","2022-10-31","2022-10-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.156581per shs","USD",0.0,17.08,17.08,0.0,17.08],["D","2022-10-31","2022-10-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.2145per shs","USD",0.0,63.93,63.93,0.0,63.93],["D","2022-10-31","2022-10-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.2145per shs","USD",0.0,50.81,50.81,0.0,50.81],["D","2022-10-31","2022-10-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0766per shs","USD",0.0,27.57,27.57,0.0,27.57],["D","2022-10-31","2022-10-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0766per shs","USD",0.0,22.05,22.05,0.0,22.05],["D","2022-10-31","2022-10-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0495per shs","USD",0.0,19.25,19.25,0.0,19.25],["D","2022-10-31","2022-10-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0495per shs","USD",0.0,11.38,11.38,0.0,11.38],["D","2022-10-31","2022-10-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.027494per shs","GBP",0.0,45.29,45.29,0.0,45.29],["D","2022-10-31","2022-10-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.027494per shs","GBP",0.0,104.79,104.79,0.0,104.79],["C","2022-11-07","2022-11-07","C00356735","Fee","CASH-GBP","Bank Charge","GBP",0.0,18.85,-18.85,0.0,0.0],["C","2022-11-07","2022-11-07","C00356735","Fee","CASH-GBP","Trustee Fee","GBP",0.0,1160.0,-1160.0,0.0,0.0],["T","2022-09-09","2022-09-13","C00347223","BUY","AGBP","Rebalance - BUY AGBP 432shs@GBP4.5691","GBP",432.0,1973.85,-1975.82,4.57,-1973.85],["C","2022-10-20","2022-10-20","C00355634","Fee","CASH-GBP","Bank Charge","GBP",0.0,18.82,-18.82,0.0,0.0],["C","2022-10-20","2022-10-20","C00355634","Fee","CASH-GBP","Trustee Fee","GBP",0.0,1375.0,-1375.0,0.0,0.0],["C","2022-09-30","2022-09-30","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2022 09","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2022-09-30","2022-09-30","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2022 09","USD",0.0,134.91,-134.91,0.0,0.0],["C","2022-09-30","2022-09-30","C00356735","Fee","Cash-GBP","Advisory Fee 2022 09","GBP",0.0,402.17,-402.17,0.0,0.0],["C","2022-09-30","2022-09-30","C00355634","Fee","Cash-USD","Advisory Fee 2022 09","USD",0.0,5.22,-5.22,0.0,0.0],["C","2022-09-30","2022-09-30","C00355634","Fee","Cash-USD","Advisory Fee 2022 09","USD",0.0,158.51,-158.51,0.0,0.0],["C","2022-09-30","2022-09-30","C00355633","Fee","Cash-USD","Advisory Fee 2022 09","USD",0.0,218.4,-218.4,0.0,0.0],["C","2022-09-30","2022-09-30","C00347223","Fee","Cash-GBP","Advisory Fee 2022 09","GBP",0.0,689.45,-689.45,0.0,0.0],["D","2022-09-30","2022-09-30","C00355634","Dividend","VYM","CashDiv VYM @USD0.767199per shs","USD",0.0,81.32,81.32,0.0,81.32],["D","2022-09-30","2022-09-30","C00355634","Dividend","VWO","CashDiv VWO @USD0.5294per shs","USD",0.0,181.58,181.58,0.0,181.58],["D","2022-09-30","2022-09-30","C00355633","Dividend","VWO","CashDiv VWO @USD0.5294per shs","USD",0.0,439.4,439.4,0.0,439.4],["D","2022-09-30","2022-09-30","C00355634","Dividend","VTI","CashDiv VTI @USD0.7955per shs","USD",0.0,240.24,240.24,0.0,240.24],["D","2022-09-30","2022-09-30","C00355633","Dividend","VTI","CashDiv VTI @USD0.7955per shs","USD",0.0,582.31,582.31,0.0,582.31],["D","2022-09-30","2022-09-30","C00355634","Dividend","VPL","CashDiv VPL @USD0.149per shs","USD",0.0,40.83,40.83,0.0,40.83],["D","2022-09-30","2022-09-30","C00355633","Dividend","VPL","CashDiv VPL @USD0.149per shs","USD",0.0,96.39,96.39,0.0,96.39],["D","2022-09-30","2022-09-30","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1362per shs","USD",0.0,30.37,30.37,0.0,30.37],["D","2022-09-30","2022-09-30","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1362per shs","USD",0.0,24.24,24.24,0.0,24.24],["D","2022-09-30","2022-09-30","C00356735","Dividend","VAPX","CashDiv VAPX @USD0.274002per shs","USD",0.0,563.07,563.07,0.0,563.07],["D","2022-09-30","2022-09-30","C00347223","Dividend","VAPX","CashDiv VAPX @USD0.274002per shs","USD",0.0,623.63,623.63,0.0,623.63],["D","2022-09-30","2022-09-30","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.168009per shs","USD",0.0,18.31,18.31,0.0,18.31],["D","2022-09-30","2022-09-30","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.3018per shs","USD",0.0,89.94,89.94,0.0,89.94],["D","2022-09-30","2022-09-30","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.3018per shs","USD",0.0,71.54,71.54,0.0,71.54],["D","2022-09-30","2022-09-30","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.07per shs","USD",0.0,25.2,25.2,0.0,25.2],["D","2022-09-30","2022-09-30","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.07per shs","USD",0.0,20.16,20.16,0.0,20.16],["D","2022-09-30","2022-09-30","C00355634","Dividend","LGLV","CashDiv LGLV @USD0.672687per shs","USD",0.0,84.09,84.09,0.0,84.09],["D","2022-09-30","2022-09-30","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0484per shs","USD",0.0,18.84,18.84,0.0,18.84],["D","2022-09-30","2022-09-30","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0484per shs","USD",0.0,11.13,11.13,0.0,11.13],["D","2022-09-30","2022-09-30","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.026796per shs","GBP",0.0,44.14,44.14,0.0,44.14],["D","2022-09-30","2022-09-30","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.026796per shs","GBP",0.0,102.15,102.15,0.0,102.15],["D","2022-09-30","2022-09-30","C00356735","Dividend","IS15","CashDiv IS15 @GBP0.9515per shs","GBP",0.0,292.11,292.11,0.0,292.11],["D","2022-09-30","2022-09-30","C00347223","Dividend","IS15","CashDiv IS15 @GBP0.9515per shs","GBP",0.0,706.96,706.96,0.0,706.96],["C","2022-10-07","2022-10-12","C00355634","FX Withdrawal","Cash-USD","FX Conversion GBP to USD @1.11746","USD",0.0,1564.45,-1564.45,0.0,0.0],["C","2022-10-07","2022-10-12","C00355634","FX Deposit","Cash-GBP","FX Conversion GBP to USD @1.11746","GBP",0.0,1400.0,1400.0,0.0,0.0],["T","2023-05-15","2023-05-17","C00347223","SELL","VAPX","Rebalance - SELL VAPX 39shs@GBP19.925735","GBP",-39.0,777.1,777.1,-20.2,787.94],["T","2021-11-29","2021-12-01","C00356735","SELL","ERNS","Sold ERNS 8shs@GBP100.5269","GBP",-8.0,804.22,804.22,-100.41,803.28],["T","2021-02-22","2021-02-24","C00347223","BUY","XGIG","Bought XGIG 75shs@GBP27.0457 (Rebalance)","GBP",75.0,2028.43,-2028.43,27.05,-2028.75],["T","2021-11-29","2021-12-01","C00356735","SELL","VGOV","Sold VGOV 34shs@GBP24.8448","GBP",-34.0,844.72,844.72,-24.11,819.65],["T","2021-11-29","2021-12-01","C00356735","SELL","IS15","Sold IS15 8shs@GBP105.3472","GBP",-8.0,842.78,842.78,-105.85,846.8],["T","2020-11-16","2020-11-18","C00355633","BUY","VAPX","Bought VAPX 102shs@GBP20.5041","GBP",102.0,2091.42,-2091.42,20.5,-2091.42],["T","2021-06-18","2021-06-22","C00355634","BUY","SGOV","Bought SGOV 21shs@USD100.03","USD",21.0,2100.63,-2100.63,100.03,-2100.63],["T","2021-01-15","2021-01-17","C00355633","BUY","VAPX","Bought VAPX 92shs@GBP22.9092","GBP",92.0,2107.64,-2107.64,22.91,-2107.72],["T","2020-12-16","2020-12-18","C00355633","BUY","VAPX","Bought VAPX 97shs@GBP21.7380","GBP",97.0,2108.58,-2108.58,21.74,-2108.78],["T","2021-01-15","2021-01-17","C00355633","BUY","IJPH","Bought IJPH 32shs@GBP66.9947","GBP",32.0,2143.83,-2143.83,66.99,-2143.68],["T","2020-11-16","2020-11-18","C00355633","BUY","IJPH","Bought IJPH 35shs@GBP62.0054","GBP",35.0,2170.19,-2170.19,62.01,-2170.19],["T","2020-12-16","2020-12-18","C00355633","BUY","IJPH","Bought IJPH 34shs@GBP64.1180","GBP",34.0,2180.01,-2180.01,64.12,-2180.08],["T","2023-05-15","2023-05-17","C00347223","SELL","CSH2","Rebalance - SELL CSH2 1shs@GBP1066.1075","GBP",-1.0,1066.11,1066.11,-1034.12,1034.12],["T","2022-10-06","2022-10-11","C00355634","SELL","DBEU","Rebalance - SELL DBEU 31shs@USD30.9205","USD",-31.0,958.54,957.58,-33.76,1046.43],["T","2022-10-06","2022-10-11","C00355634","SELL","VCSH","Rebalance - SELL VCSH 13shs@USD74.4758","USD",-13.0,968.19,967.22,-80.8,1050.36],["T","2022-10-06","2022-10-11","C00355634","SELL","VTI","Rebalance - SELL VTI 5shs@USD189.0233","USD",-5.0,945.12,944.17,-215.55,1077.74],["T","2023-05-15","2023-05-17","C00347223","SELL","CUKX","Rebalance - SELL CUKX 9shs@GBP143.023718","GBP",-9.0,1287.21,1287.21,-122.94,1106.48],["T","2021-11-29","2021-12-01","C00356735","SELL","IJPH","Sold IJPH 16shs@GBP71.6715","GBP",-16.0,1146.74,1146.74,-69.68,1114.88],["T","2023-05-15","2023-05-17","C00356735","BUY","ERNS","Rebalance - BUY ERNS 23shs@GBP101.946157","GBP",23.0,2344.76,-2344.76,101.95,-2344.76],["T","2021-02-05","2021-02-07","C00355633","BUY","CUKX","Bought CUKX 22shs@GBP109.9283","GBP",22.0,2418.42,-2418.42,109.93,-2418.46],["T","2021-11-29","2021-12-01","C00356735","SELL","VAPX","Sold VAPX 55shs@GBP21.3934","GBP",-55.0,1176.63,1176.63,-21.64,1190.23],["T","2022-09-09","2022-09-13","C00347223","BUY","EMIM","Rebalance - BUY EMIM 93shs@GBP26.8034","GBP",93.0,2492.72,-2495.21,26.8,-2492.72],["C","2022-09-14","2022-09-16","C00356735","FX Withdrawal","Cash-USD","FX Conversion GBP to USD @1.15569","USD",0.0,1922.03,-1922.03,0.0,0.0],["C","2022-09-14","2022-09-16","C00356735","FX Deposit","Cash-GBP","FX Conversion GBP to USD @1.15569","GBP",0.0,1663.1,1663.1,0.0,0.0],["C","2022-08-31","2022-08-31","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2022 08","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2022-08-31","2022-08-31","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2022 08","USD",0.0,134.91,-134.91,0.0,0.0],["C","2022-08-31","2022-08-31","C00356735","Fee","Cash-GBP","Advisory Fee 2022 08","GBP",0.0,423.66,-423.66,0.0,0.0],["C","2022-08-31","2022-08-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 08","USD",0.0,5.22,-5.22,0.0,0.0],["C","2022-08-31","2022-08-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 08","USD",0.0,167.06,-167.06,0.0,0.0],["C","2022-08-31","2022-08-31","C00355633","Fee","Cash-USD","Advisory Fee 2022 08","USD",0.0,232.21,-232.21,0.0,0.0],["C","2022-08-31","2022-08-31","C00347223","Fee","Cash-GBP","Advisory Fee 2022 08","GBP",0.0,723.58,-723.58,0.0,0.0],["D","2022-08-31","2022-08-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1272per shs","USD",0.0,28.36,28.36,0.0,28.36],["D","2022-08-31","2022-08-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1272per shs","USD",0.0,22.64,22.64,0.0,22.64],["D","2022-08-31","2022-08-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.115689per shs","USD",0.0,12.6,12.6,0.0,12.6],["D","2022-08-31","2022-08-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.4774per shs","USD",0.0,142.28,142.28,0.0,142.28],["D","2022-08-31","2022-08-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.4774per shs","USD",0.0,113.15,113.15,0.0,113.15],["D","2022-08-31","2022-08-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0536per shs","USD",0.0,19.3,19.3,0.0,19.3],["D","2022-08-31","2022-08-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0536per shs","USD",0.0,15.42,15.42,0.0,15.42],["D","2022-08-31","2022-08-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0488per shs","USD",0.0,18.98,18.98,0.0,18.98],["D","2022-08-31","2022-08-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0488per shs","USD",0.0,11.2,11.2,0.0,11.2],["D","2022-08-31","2022-08-31","C00356735","Dividend","XGIG","CashDiv XGIG @GBP0.0337per shs","GBP",0.0,20.73,20.73,0.0,20.73],["D","2022-08-31","2022-08-31","C00347223","Dividend","XGIG","CashDiv XGIG @GBP0.0337per shs","GBP",0.0,54.12,54.12,0.0,54.12],["D","2022-08-31","2022-08-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.031724per shs","GBP",0.0,43.4,43.4,0.0,43.4],["D","2022-08-31","2022-08-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.031724per shs","GBP",0.0,100.34,100.34,0.0,100.34],["D","2022-08-31","2022-08-31","C00356735","Dividend","GSPX","CashDiv GSPX @GBP0.049per shs","GBP",0.0,1921.76,1921.76,0.0,1921.76],["D","2022-08-31","2022-08-31","C00347223","Dividend","GSPX","CashDiv GSPX @GBP0.049per shs","GBP",0.0,1764.32,1764.32,0.0,1764.32],["D","2022-08-31","2022-08-31","C00356735","Dividend","EUXS","CashDiv EUXS @GBP0.0858per shs","GBP",0.0,1236.96,1236.96,0.0,1236.96],["D","2022-08-31","2022-08-31","C00347223","Dividend","EUXS","CashDiv EUXS @GBP0.0858per shs","GBP",0.0,1130.66,1130.66,0.0,1130.66],["T","2022-10-06","2022-10-11","C00355634","BUY","VWO","Rebalance - BUY VWO 70shs@USD38.02","USD",70.0,2661.4,-2664.06,38.02,-2661.4],["T","2021-02-22","2021-02-24","C00347223","BUY","IS15","Bought IS15 25shs@GBP107.6583 (Rebalance)","GBP",25.0,2691.46,-2691.46,107.66,-2691.5],["T","2021-02-19","2021-02-23","C00355634","SELL","DBEU","Sold DBEU 47shs@USD31.1657","USD",-47.0,1464.79,1464.79,-29.92,1406.43],["T","2022-10-06","2022-10-11","C00355634","SELL","SGOV","Rebalance - SELL SGOV 15shs@USD100.153","USD",-15.0,1502.3,1500.8,-99.72,1495.79],["T","2023-05-15","2023-05-17","C00356735","SELL","CUKX","Rebalance - SELL CUKX 14shs@GBP143.023718","GBP",-14.0,2002.33,2002.33,-111.08,1555.12],["T","2022-09-09","2022-09-13","C00356735","BUY","EUXS","Rebalance - BUY EUXS 322shs@GBP8.6014","GBP",322.0,2769.65,-2772.42,8.6,-2769.65],["T","2023-05-15","2023-05-17","C00355634","SELL","VPL","Rebalance - SELL VPL 21shs@USD68.9632","USD",-21.0,1448.23,1448.23,-76.1,1598.04],["T","2021-02-22","2021-02-24","C00347223","SELL","VAPX","Sold VAPX 91shs@GBP22.4219 (Rebalance)","GBP",-91.0,2040.39,2040.39,-18.75,1706.27],["T","2023-05-15","2023-05-17","C00347223","SELL","IS15","Rebalance - SELL IS15 17shs@GBP97.477232","GBP",-17.0,1657.11,1657.11,-101.97,1733.48],["T","2022-10-06","2022-10-11","C00355634","SELL","SCHO","Rebalance - SELL SCHO 35shs@USD48.2362","USD",-35.0,1688.27,1686.58,-50.88,1780.85],["T","2021-11-29","2021-12-01","C00356735","SELL","EUXS","Sold EUXS 319shs@GBP6.4991","GBP",-319.0,2073.22,2073.22,-5.59,1783.85],["T","2023-05-15","2023-05-17","C00347223","BUY","XGIG","Rebalance - BUY XGIG 120shs@GBP24.199855","GBP",120.0,2903.98,-2903.98,24.2,-2903.98],["T","2021-02-19","2021-02-23","C00355634","SELL","VTI","Sold VTI 10shs@USD206.4701","USD",-10.0,2064.7,2064.7,-191.5,1914.98],["C","2022-07-31","2022-07-31","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2022 07","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2022-07-31","2022-07-31","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2022 07","USD",0.0,134.91,-134.91,0.0,0.0],["C","2022-07-31","2022-07-31","C00356735","Fee","Cash-GBP","Advisory Fee 2022 07","GBP",0.0,409.41,-409.41,0.0,0.0],["C","2022-07-31","2022-07-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 07","USD",0.0,5.23,-5.23,0.0,0.0],["C","2022-07-31","2022-07-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 07","USD",0.0,161.82,-161.82,0.0,0.0],["C","2022-07-31","2022-07-31","C00355633","Fee","Cash-USD","Advisory Fee 2022 07","USD",0.0,222.38,-222.38,0.0,0.0],["C","2022-07-31","2022-07-31","C00347223","Fee","Cash-GBP","Advisory Fee 2022 07","GBP",0.0,705.25,-705.25,0.0,0.0],["D","2022-07-31","2022-07-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1179per shs","USD",0.0,26.28,26.28,0.0,26.28],["D","2022-07-31","2022-07-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1179per shs","USD",0.0,20.99,20.99,0.0,20.99],["D","2022-07-31","2022-07-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.069047per shs","USD",0.0,7.52,7.52,0.0,7.52],["D","2022-07-31","2022-07-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.3739per shs","USD",0.0,111.4,111.4,0.0,111.4],["D","2022-07-31","2022-07-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.3739per shs","USD",0.0,88.61,88.61,0.0,88.61],["D","2022-07-31","2022-07-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.051per shs","USD",0.0,18.34,18.34,0.0,18.34],["D","2022-07-31","2022-07-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.051per shs","USD",0.0,14.67,14.67,0.0,14.67],["D","2022-07-31","2022-07-31","C00355634","Dividend","DBEU","CashDiv DBEU @USD0.51096per shs","USD",0.0,365.29,365.29,0.0,365.29],["D","2022-07-31","2022-07-31","C00355633","Dividend","DBEU","CashDiv DBEU @USD0.51096per shs","USD",0.0,912.53,912.53,0.0,912.53],["D","2022-07-31","2022-07-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0431per shs","USD",0.0,16.77,16.77,0.0,16.77],["D","2022-07-31","2022-07-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0431per shs","USD",0.0,9.9,9.9,0.0,9.9],["D","2022-07-31","2022-07-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.024836per shs","GBP",0.0,33.98,33.98,0.0,33.98],["D","2022-07-31","2022-07-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.024836per shs","GBP",0.0,78.55,78.55,0.0,78.55],["D","2022-07-31","2022-07-31","C00356735","Dividend","AGBP","CashDiv AGBP @GBP0.0365per shs","GBP",0.0,116.72,116.72,0.0,116.72],["D","2022-07-31","2022-07-31","C00347223","Dividend","AGBP","CashDiv AGBP @GBP0.0365per shs","GBP",0.0,326.46,326.46,0.0,326.46],["T","2022-10-06","2022-10-11","C00355634","BUY","VPL","Rebalance - BUY VPL 49shs@USD59.791","USD",49.0,2929.76,-2932.69,59.79,-2929.76],["C","2020-12-31","2020-12-31","C00355634","Fee","CASH-USD","Advisory Fee 2020 12 (Reverse)","USD",0.0,242.4,242.4,0.0,0.0],["C","2020-12-31","2020-12-31","C00355633","Fee","CASH-GBP","Advisory Fee 2020 12 (Reverse)","GBP",0.0,177.16,177.16,0.0,0.0],["C","2020-12-31","2020-12-31","C00347223","Fee","CASH-GBP","Advisory Fee 2020 12 (Reverse)","GBP",0.0,751.57,751.57,0.0,0.0],["C","2020-12-31","2020-12-31","C00355634","Fee","CASH-USD","Advisory Fee 2020 12","USD",0.0,242.4,-242.4,0.0,0.0],["C","2020-12-31","2020-12-31","C00355633","Fee","CASH-GBP","Advisory Fee 2020 12","GBP",0.0,177.16,-177.16,0.0,0.0],["C","2020-12-31","2020-12-31","C00347223","Fee","CASH-GBP","Advisory Fee 2020 12","GBP",0.0,751.57,-751.57,0.0,0.0],["T","2023-05-15","2023-05-17","C00355633","BUY","VPL","Rebalance - BUY VPL 43shs@USD68.9632","USD",43.0,2965.42,-2965.42,68.96,-2965.42],["T","2021-11-29","2021-12-01","C00356735","SELL","EMIM","Sold EMIM 72shs@GBP26.194","GBP",-72.0,1885.97,1885.97,-27.63,1989.36],["T","2023-05-15","2023-05-17","C00356735","BUY","IS15","Rebalance - BUY IS15 32shs@GBP97.477232","GBP",32.0,3119.27,-3119.27,97.48,-3119.27],["C","2022-06-30","2022-06-30","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2022 06","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2022-06-30","2022-06-30","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2022 06","USD",0.0,134.91,-134.91,0.0,0.0],["C","2022-06-30","2022-06-30","C00356735","Fee","Cash-GBP","Advisory Fee 2022 06","GBP",0.0,409.93,-409.93,0.0,0.0],["C","2022-06-30","2022-06-30","C00355634","Fee","Cash-USD","Advisory Fee 2022 06","USD",0.0,5.23,-5.23,0.0,0.0],["C","2022-06-30","2022-06-30","C00355634","Fee","Cash-USD","Advisory Fee 2022 06","USD",0.0,162.01,-162.01,0.0,0.0],["C","2022-06-30","2022-06-30","C00355633","Fee","Cash-USD","Advisory Fee 2022 06","USD",0.0,223.13,-223.13,0.0,0.0],["C","2022-06-30","2022-06-30","C00347223","Fee","Cash-GBP","Advisory Fee 2022 06","GBP",0.0,704.86,-704.86,0.0,0.0],["D","2022-06-30","2022-06-30","C00355634","Dividend","VYM","CashDiv VYM @USD0.8479per shs","USD",0.0,89.88,89.88,0.0,89.88],["D","2022-06-30","2022-06-30","C00355634","Dividend","VWO","CashDiv VWO @USD0.3057per shs","USD",0.0,104.86,104.86,0.0,104.86],["D","2022-06-30","2022-06-30","C00355633","Dividend","VWO","CashDiv VWO @USD0.3057per shs","USD",0.0,253.73,253.73,0.0,253.73],["D","2022-06-30","2022-06-30","C00355634","Dividend","VTI","CashDiv VTI @USD0.7491per shs","USD",0.0,226.23,226.23,0.0,226.23],["D","2022-06-30","2022-06-30","C00355633","Dividend","VTI","CashDiv VTI @USD0.7491per shs","USD",0.0,548.34,548.34,0.0,548.34],["D","2022-06-30","2022-06-30","C00355634","Dividend","VPL","CashDiv VPL @USD0.545per shs","USD",0.0,149.34,149.34,0.0,149.34],["D","2022-06-30","2022-06-30","C00355633","Dividend","VPL","CashDiv VPL @USD0.545per shs","USD",0.0,352.62,352.62,0.0,352.62],["D","2022-06-30","2022-06-30","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1159per shs","USD",0.0,25.85,25.85,0.0,25.85],["D","2022-06-30","2022-06-30","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1159per shs","USD",0.0,20.64,20.64,0.0,20.64],["D","2022-06-30","2022-06-30","C00356735","Dividend","VAPX","CashDiv VAPX @USD0.375291per shs","USD",0.0,775.35,775.35,0.0,775.35],["D","2022-06-30","2022-06-30","C00347223","Dividend","VAPX","CashDiv VAPX @USD0.375291per shs","USD",0.0,838.02,838.02,0.0,838.02],["D","2022-06-30","2022-06-30","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.041443per shs","USD",0.0,4.53,4.53,0.0,4.53],["D","2022-06-30","2022-06-30","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.6049per shs","USD",0.0,180.26,180.26,0.0,180.26],["D","2022-06-30","2022-06-30","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.6049per shs","USD",0.0,143.35,143.35,0.0,143.35],["D","2022-06-30","2022-06-30","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0332per shs","USD",0.0,11.95,11.95,0.0,11.95],["D","2022-06-30","2022-06-30","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0332per shs","USD",0.0,9.57,9.57,0.0,9.57],["D","2022-06-30","2022-06-30","C00355634","Dividend","LGLV","CashDiv LGLV @USD0.709094per shs","USD",0.0,88.64,88.64,0.0,88.64],["D","2022-06-30","2022-06-30","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0419per shs","USD",0.0,16.3,16.3,0.0,16.3],["D","2022-06-30","2022-06-30","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0419per shs","USD",0.0,9.64,9.64,0.0,9.64],["D","2022-06-30","2022-06-30","C00356735","Dividend","XGIG","CashDiv XGIG @GBP0.0298per shs","GBP",0.0,18.32,18.32,0.0,18.32],["D","2022-06-30","2022-06-30","C00347223","Dividend","XGIG","CashDiv XGIG @GBP0.0298per shs","GBP",0.0,47.86,47.86,0.0,47.86],["D","2022-06-30","2022-06-30","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.023485per shs","GBP",0.0,32.13,32.13,0.0,32.13],["D","2022-06-30","2022-06-30","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.028558per shs","GBP",0.0,39.07,39.07,0.0,39.07],["D","2022-06-30","2022-06-30","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.023485per shs","GBP",0.0,74.28,74.28,0.0,74.28],["D","2022-06-30","2022-06-30","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.028558per shs","GBP",0.0,90.33,90.33,0.0,90.33],["D","2022-06-30","2022-06-30","C00356735","Dividend","ERNS","CashDiv ERNS @GBP0.283per shs","GBP",0.0,93.11,93.11,0.0,93.11],["D","2022-06-30","2022-06-30","C00347223","Dividend","ERNS","CashDiv ERNS @GBP0.283per shs","GBP",0.0,218.18,218.18,0.0,218.18],["T","2023-05-15","2023-05-17","C00355633","BUY","SCHO","Rebalance - BUY SCHO 66shs@USD48.7381","USD",66.0,3216.7,-3216.7,48.74,-3216.71],["T","2023-05-15","2023-05-17","C00356735","SELL","IJPH","Rebalance - SELL IJPH 32shs@GBP80.611963","GBP",-32.0,2579.58,2579.58,-69.68,2229.76],["C","2022-05-31","2022-05-31","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2022 05","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2022-05-31","2022-05-31","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2022 05","USD",0.0,134.91,-134.91,0.0,0.0],["C","2022-05-31","2022-05-31","C00356735","Fee","Cash-GBP","Advisory Fee 2022 05","GBP",0.0,421.92,-421.92,0.0,0.0],["C","2022-05-31","2022-05-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 05","USD",0.0,5.23,-5.23,0.0,0.0],["C","2022-05-31","2022-05-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 05","USD",0.0,166.34,-166.34,0.0,0.0],["C","2022-05-31","2022-05-31","C00355633","Fee","Cash-USD","Advisory Fee 2022 05","USD",0.0,229.97,-229.97,0.0,0.0],["C","2022-05-31","2022-05-31","C00347223","Fee","Cash-GBP","Advisory Fee 2022 05","GBP",0.0,723.22,-723.22,0.0,0.0],["D","2022-05-31","2022-05-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1078per shs","USD",0.0,24.04,24.04,0.0,24.04],["D","2022-05-31","2022-05-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1078per shs","USD",0.0,19.18,19.18,0.0,19.18],["D","2022-05-31","2022-05-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.024564per shs","USD",0.0,2.69,2.69,0.0,2.69],["D","2022-05-31","2022-05-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.3843per shs","USD",0.0,114.52,114.52,0.0,114.52],["D","2022-05-31","2022-05-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.3843per shs","USD",0.0,91.08,91.08,0.0,91.08],["D","2022-05-31","2022-05-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0254per shs","USD",0.0,9.14,9.14,0.0,9.14],["D","2022-05-31","2022-05-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0254per shs","USD",0.0,7.31,7.31,0.0,7.31],["D","2022-05-31","2022-05-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0375per shs","USD",0.0,14.59,14.59,0.0,14.59],["D","2022-05-31","2022-05-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0375per shs","USD",0.0,8.62,8.62,0.0,8.62],["D","2022-05-31","2022-05-31","C00356735","Dividend","XGIG","CashDiv XGIG @GBP0.1151per shs","GBP",0.0,70.79,70.79,0.0,70.79],["D","2022-05-31","2022-05-31","C00347223","Dividend","XGIG","CashDiv XGIG @GBP0.1151per shs","GBP",0.0,184.84,184.84,0.0,184.84],["D","2022-05-31","2022-05-31","C00356735","Dividend","EUXS","CashDiv EUXS @GBP0.0367per shs","GBP",0.0,529.14,529.14,0.0,529.14],["D","2022-05-31","2022-05-31","C00347223","Dividend","EUXS","CashDiv EUXS @GBP0.0367per shs","GBP",0.0,483.63,483.63,0.0,483.63],["T","2021-01-15","2021-01-17","C00355633","BUY","EMIM","Bought EMIM 123shs@GBP27.6731","GBP",123.0,3403.8,-3403.8,27.67,-3403.41],["T","2020-11-16","2020-11-18","C00355633","BUY","EMIM","Bought EMIM 136shs@GBP25.0842","GBP",136.0,3411.45,-3411.45,25.08,-3411.45],["T","2021-02-22","2021-02-24","C00347223","BUY","ERNS","Bought ERNS 34shs@GBP100.5811 (Rebalance)","GBP",34.0,3419.76,-3419.76,100.58,-3419.72],["T","2020-12-16","2020-12-18","C00355633","BUY","EMIM","Bought EMIM 132shs@GBP25.9381","GBP",132.0,3423.83,-3423.83,25.94,-3424.08],["T","2021-05-11","2021-05-13","C00355633","SELL","CUKX","Sold CUKX 22shs@GBP119.14","GBP",-22.0,2621.08,2621.08,-109.93,2418.46],["T","2020-11-19","2020-11-23","C00347223","BUY","ERNS","Bought ERNS 35shs@GBP100.7855","GBP",35.0,3527.49,-3527.49,100.79,-3527.49],["C","2022-04-30","2022-04-30","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2022 04","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2022-04-30","2022-04-30","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2022 04","USD",0.0,134.91,-134.91,0.0,0.0],["C","2022-04-30","2022-04-30","C00356735","Fee","Cash-GBP","Advisory Fee 2022 04","GBP",0.0,443.8,-443.8,0.0,0.0],["C","2022-04-30","2022-04-30","C00355634","Fee","Cash-USD","Advisory Fee 2022 04","USD",0.0,5.24,-5.24,0.0,0.0],["C","2022-04-30","2022-04-30","C00355634","Fee","Cash-USD","Advisory Fee 2022 04","USD",0.0,174.72,-174.72,0.0,0.0],["C","2022-04-30","2022-04-30","C00355633","Fee","Cash-USD","Advisory Fee 2022 04","USD",0.0,243.07,-243.07,0.0,0.0],["C","2022-04-30","2022-04-30","C00347223","Fee","Cash-GBP","Advisory Fee 2022 04","GBP",0.0,751.81,-751.81,0.0,0.0],["D","2022-04-30","2022-04-30","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1064per shs","USD",0.0,23.73,23.73,0.0,23.73],["D","2022-04-30","2022-04-30","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1064per shs","USD",0.0,18.93,18.93,0.0,18.93],["D","2022-04-30","2022-04-30","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.018432per shs","USD",0.0,2.01,2.01,0.0,2.01],["D","2022-04-30","2022-04-30","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.2719per shs","USD",0.0,81.01,81.01,0.0,81.01],["D","2022-04-30","2022-04-30","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.2719per shs","USD",0.0,64.45,64.45,0.0,64.45],["D","2022-04-30","2022-04-30","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0235per shs","USD",0.0,8.46,8.46,0.0,8.46],["D","2022-04-30","2022-04-30","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0235per shs","USD",0.0,6.77,6.77,0.0,6.77],["D","2022-04-30","2022-04-30","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0379per shs","USD",0.0,14.75,14.75,0.0,14.75],["D","2022-04-30","2022-04-30","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0379per shs","USD",0.0,8.72,8.72,0.0,8.72],["D","2022-04-30","2022-04-30","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.022689per shs","GBP",0.0,31.04,31.04,0.0,31.04],["D","2022-04-30","2022-04-30","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.022689per shs","GBP",0.0,71.77,71.77,0.0,71.77],["T","2020-11-19","2020-11-23","C00347223","BUY","VGOV","Bought VGOV 139shs@GBP25.4790","GBP",139.0,3541.58,-3541.58,25.48,-3541.58],["T","2020-11-19","2020-11-23","C00347223","BUY","IS15","Bought IS15 33shs@GBP107.3313","GBP",33.0,3541.93,-3541.93,107.33,-3541.93],["T","2021-06-18","2021-06-22","C00355634","BUY","VCSH","Bought VCSH 44shs@USD82.56","USD",44.0,3632.64,-3632.64,82.56,-3632.64],["T","2021-06-18","2021-06-22","C00355634","BUY","SCHO","Bought SCHO 71shs@USD51.1827","USD",71.0,3633.97,-3633.97,51.18,-3633.97],["T","2023-05-15","2023-05-17","C00355634","SELL","DBEU","Rebalance - SELL DBEU 79shs@USD37.5413","USD",-79.0,2965.76,2965.76,-33.61,2655.42],["T","2022-09-09","2022-09-13","C00356735","SELL","CUKX","Rebalance - SELL CUKX 24shs@GBP127.2085","GBP",-24.0,3052.99,3049.94,-111.08,2665.92],["T","2021-06-18","2021-06-22","C00355634","BUY","SCHP","Bought SCHP 59shs@USD61.9436","USD",59.0,3654.67,-3654.67,61.94,-3654.67],["T","2021-06-18","2021-06-22","C00355634","BUY","VWO","Bought VWO 68shs@USD53.8156","USD",68.0,3659.46,-3659.46,53.82,-3659.46],["T","2023-05-15","2023-05-17","C00355633","BUY","VCSH","Rebalance - BUY VCSH 48shs@USD76.2495","USD",48.0,3659.99,-3659.99,76.25,-3659.98],["T","2023-05-15","2023-05-17","C00347223","SELL","ERNS","Rebalance - SELL ERNS 28shs@GBP101.946157","GBP",-28.0,2854.49,2854.49,-99.52,2786.54],["T","2022-09-09","2022-09-13","C00356735","SELL","ERNS","Rebalance - SELL ERNS 28shs@GBP99.2608","GBP",-28.0,2779.3,2776.52,-100.02,2800.57],["T","2022-09-09","2022-09-13","C00347223","SELL","CUKX","Rebalance - SELL CUKX 24shs@GBP127.2085","GBP",-24.0,3053.0,3049.95,-122.94,2950.6],["T","2023-05-15","2023-05-17","C00347223","SELL","IJPH","Rebalance - SELL IJPH 41shs@GBP80.611963","GBP",-41.0,3305.09,3305.09,-75.35,3089.51],["T","2022-09-09","2022-09-13","C00347223","SELL","CSH2","Rebalance - SELL CSH2 3shs@GBP1037.8943","GBP",-3.0,3113.68,3110.57,-1034.12,3102.37],["T","2021-01-15","2021-01-17","C00355633","BUY","EUXS","Bought EUXS 735shs@GBP5.6736","GBP",735.0,4170.06,-4170.06,5.67,-4167.45],["T","2020-12-16","2020-12-18","C00355633","BUY","EUXS","Bought EUXS 758shs@GBP5.5032","GBP",758.0,4171.42,-4171.42,5.5,-4169.0],["T","2020-11-16","2020-11-18","C00355633","BUY","EUXS","Bought EUXS 774shs@GBP5.3874","GBP",774.0,4169.88,-4169.88,5.39,-4169.85],["T","2021-02-05","2021-02-07","C00355633","SELL","CUKX","Sold CUKX 30shs@GBP109.9283","GBP",-30.0,3297.85,3297.85,-110.79,3323.61],["T","2021-06-18","2021-06-22","C00355634","BUY","BNDX","Bought BNDX 77shs@USD57.0852","USD",77.0,4395.56,-4395.56,57.09,-4395.56],["T","2021-06-18","2021-06-22","C00355634","BUY","VPL","Bought VPL 55shs@USD82.3815","USD",55.0,4530.98,-4530.98,82.38,-4530.98],["T","2021-03-18","2021-03-22","C00355633","BUY","VWO","Bought VWO 87shs@USD52.6581","USD",87.0,4581.25,-4581.25,52.66,-4581.25],["T","2021-02-16","2021-02-18","C00355633","BUY","VWO","Bought VWO 81shs@USD56.5781","USD",81.0,4582.83,-4582.83,56.58,-4582.98],["T","2023-05-15","2023-05-17","C00355633","BUY","SCHP","Rebalance - BUY SCHP 87shs@USD53.2637","USD",87.0,4633.95,-4633.95,53.26,-4633.94],["T","2021-02-22","2021-02-24","C00347223","SELL","IJPH","Sold IJPH 65shs@GBP69.6840 (Rebalance)","GBP",-65.0,4529.46,4529.46,-57.89,3762.93],["C","2022-03-31","2022-03-31","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2022 03","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2022-03-31","2022-03-31","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2022 03","USD",0.0,134.91,-134.91,0.0,0.0],["C","2022-03-31","2022-03-31","C00356735","Fee","Cash-GBP","Advisory Fee 2022 03","GBP",0.0,440.41,-440.41,0.0,0.0],["C","2022-03-31","2022-03-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 03","USD",0.0,5.24,-5.24,0.0,0.0],["C","2022-03-31","2022-03-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 03","USD",0.0,175.9,-175.9,0.0,0.0],["C","2022-03-31","2022-03-31","C00355633","Fee","Cash-USD","Advisory Fee 2022 03","USD",0.0,243.76,-243.76,0.0,0.0],["C","2022-03-31","2022-03-31","C00347223","Fee","Cash-GBP","Advisory Fee 2022 03","GBP",0.0,749.76,-749.76,0.0,0.0],["D","2022-03-31","2022-03-31","C00355634","Dividend","VYM","CashDiv VYM @USD0.662199per shs","USD",0.0,70.19,70.19,0.0,70.19],["D","2022-03-31","2022-03-31","C00355634","Dividend","VWO","CashDiv VWO @USD0.1339per shs","USD",0.0,45.93,45.93,0.0,45.93],["D","2022-03-31","2022-03-31","C00355633","Dividend","VWO","CashDiv VWO @USD0.1339per shs","USD",0.0,111.14,111.14,0.0,111.14],["D","2022-03-31","2022-03-31","C00355634","Dividend","VTI","CashDiv VTI @USD0.7082per shs","USD",0.0,213.87,213.87,0.0,213.87],["D","2022-03-31","2022-03-31","C00355633","Dividend","VTI","CashDiv VTI @USD0.7082per shs","USD",0.0,518.41,518.41,0.0,518.41],["D","2022-03-31","2022-03-31","C00355634","Dividend","VPL","CashDiv VPL @USD0.0523per shs","USD",0.0,14.34,14.34,0.0,14.34],["D","2022-03-31","2022-03-31","C00355633","Dividend","VPL","CashDiv VPL @USD0.0523per shs","USD",0.0,33.84,33.84,0.0,33.84],["D","2022-03-31","2022-03-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.0923per shs","USD",0.0,20.58,20.58,0.0,20.58],["D","2022-03-31","2022-03-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.0923per shs","USD",0.0,16.43,16.43,0.0,16.43],["D","2022-03-31","2022-03-31","C00356735","Dividend","VAPX","CashDiv VAPX @USD0.291044per shs","USD",0.0,601.29,601.29,0.0,601.29],["D","2022-03-31","2022-03-31","C00347223","Dividend","VAPX","CashDiv VAPX @USD0.291044per shs","USD",0.0,649.89,649.89,0.0,649.89],["D","2022-03-31","2022-03-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.008309per shs","USD",0.0,0.9,0.9,0.0,0.9],["D","2022-03-31","2022-03-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.1247per shs","USD",0.0,37.16,37.16,0.0,37.16],["D","2022-03-31","2022-03-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.1247per shs","USD",0.0,29.55,29.55,0.0,29.55],["D","2022-03-31","2022-03-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0153per shs","USD",0.0,5.51,5.51,0.0,5.51],["D","2022-03-31","2022-03-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0153per shs","USD",0.0,4.41,4.41,0.0,4.41],["D","2022-03-31","2022-03-31","C00355634","Dividend","LGLV","CashDiv LGLV @USD0.484814per shs","USD",0.0,60.6,60.6,0.0,60.6],["D","2022-03-31","2022-03-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0345per shs","USD",0.0,13.42,13.42,0.0,13.42],["D","2022-03-31","2022-03-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0345per shs","USD",0.0,7.94,7.94,0.0,7.94],["D","2022-03-31","2022-03-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.021269per shs","GBP",0.0,29.1,29.1,0.0,29.1],["D","2022-03-31","2022-03-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.022541per shs","GBP",0.0,30.83,30.83,0.0,30.83],["D","2022-03-31","2022-03-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.022541per shs","GBP",0.0,71.3,71.3,0.0,71.3],["D","2022-03-31","2022-03-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.021269per shs","GBP",0.0,67.28,67.28,0.0,67.28],["D","2022-03-31","2022-03-31","C00356735","Dividend","IS15","CashDiv IS15 @GBP0.8011per shs","GBP",0.0,245.94,245.94,0.0,245.94],["D","2022-03-31","2022-03-31","C00347223","Dividend","IS15","CashDiv IS15 @GBP0.8011per shs","GBP",0.0,583.21,583.21,0.0,583.21],["T","2022-09-09","2022-09-13","C00356735","SELL","IJPH","Rebalance - SELL IJPH 57shs@GBP70.2701","GBP",-57.0,4005.4,4001.39,-69.68,3971.76],["T","2022-09-09","2022-09-13","C00347223","SELL","IJPH","Rebalance - SELL IJPH 53shs@GBP70.2701","GBP",-53.0,3724.32,3720.6,-75.35,3993.76],["T","2021-06-18","2021-06-22","C00355634","BUY","DBEU","Bought DBEU 143shs@USD34.6248","USD",143.0,4951.34,-4951.34,34.62,-4951.35],["T","2021-02-22","2021-02-24","C00347223","SELL","CUKX","Sold CUKX 40shs@GBP111.0849 (Rebalance)","GBP",-40.0,4443.4,4443.4,-104.06,4162.47],["C","2022-02-28","2022-02-28","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2022 02","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2022-02-28","2022-02-28","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2022 02","USD",0.0,134.91,-134.91,0.0,0.0],["C","2022-02-28","2022-02-28","C00356735","Fee","Cash-GBP","Advisory Fee 2022 02","GBP",0.0,447.92,-447.92,0.0,0.0],["C","2022-02-28","2022-02-28","C00355634","Fee","Cash-USD","Advisory Fee 2022 02","USD",0.0,5.24,-5.24,0.0,0.0],["C","2022-02-28","2022-02-28","C00355634","Fee","Cash-USD","Advisory Fee 2022 02","USD",0.0,178.75,-178.75,0.0,0.0],["C","2022-02-28","2022-02-28","C00355633","Fee","Cash-USD","Advisory Fee 2022 02","USD",0.0,249.66,-249.66,0.0,0.0],["C","2022-02-28","2022-02-28","C00347223","Fee","Cash-GBP","Advisory Fee 2022 02","GBP",0.0,759.82,-759.82,0.0,0.0],["D","2022-02-28","2022-02-28","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.099per shs","USD",0.0,22.08,22.08,0.0,22.08],["D","2022-02-28","2022-02-28","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.099per shs","USD",0.0,17.61,17.61,0.0,17.61],["D","2022-02-28","2022-02-28","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.001801per shs","USD",0.0,0.2,0.2,0.0,0.2],["D","2022-02-28","2022-02-28","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.1166per shs","USD",0.0,34.75,34.75,0.0,34.75],["D","2022-02-28","2022-02-28","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.1166per shs","USD",0.0,27.64,27.64,0.0,27.64],["D","2022-02-28","2022-02-28","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.017per shs","USD",0.0,6.12,6.12,0.0,6.12],["D","2022-02-28","2022-02-28","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.017per shs","USD",0.0,4.9,4.9,0.0,4.9],["D","2022-02-28","2022-02-28","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0469per shs","USD",0.0,18.23,18.23,0.0,18.23],["D","2022-02-28","2022-02-28","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0469per shs","USD",0.0,10.79,10.79,0.0,10.79],["D","2022-02-28","2022-02-28","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.02585per shs","GBP",0.0,35.36,35.36,0.0,35.36],["D","2022-02-28","2022-02-28","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.02585per shs","GBP",0.0,81.75,81.75,0.0,81.75],["D","2022-02-28","2022-02-28","C00356735","Dividend","GSPX","CashDiv GSPX @GBP0.0432per shs","GBP",0.0,1694.31,1694.31,0.0,1694.31],["D","2022-02-28","2022-02-28","C00347223","Dividend","GSPX","CashDiv GSPX @GBP0.0432per shs","GBP",0.0,1555.51,1555.51,0.0,1555.51],["D","2022-02-28","2022-02-28","C00356735","Dividend","EUXS","CashDiv EUXS @GBP0.009per shs","GBP",0.0,129.76,129.76,0.0,129.76],["D","2022-02-28","2022-02-28","C00347223","Dividend","EUXS","CashDiv EUXS @GBP0.009per shs","GBP",0.0,118.6,118.6,0.0,118.6],["T","2021-04-15","2021-04-19","C00355633","BUY","VWO","Bought VWO 98shs@USD52.5243","USD",98.0,5147.38,-5147.38,52.52,-5147.38],["T","2023-05-15","2023-05-17","C00356735","BUY","VAPX","Rebalance - BUY VAPX 266shs@GBP19.925735","GBP",266.0,5300.25,-5300.25,19.93,-5300.25],["T","2022-09-09","2022-09-13","C00356735","BUY","VGOV","Rebalance - BUY VGOV 279shs@GBP19.0296","GBP",279.0,5309.26,-5314.57,19.03,-5309.26],["T","2020-11-19","2020-11-23","C00347223","BUY","GSPX","Bought GSPX 849shs@GBP6.2647","GBP",849.0,5318.7,-5318.7,6.26,-5318.73],["T","2023-05-15","2023-05-17","C00355633","BUY","VWO","Rebalance - BUY VWO 136shs@USD39.8924","USD",136.0,5425.38,-5425.38,39.89,-5425.37],["C","2022-01-31","2022-01-31","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2022 01","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2022-01-31","2022-01-31","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2022 01","USD",0.0,134.91,-134.91,0.0,0.0],["C","2022-01-31","2022-01-31","C00356735","Fee","Cash-GBP","Advisory Fee 2022 01","GBP",0.0,460.79,-460.79,0.0,0.0],["C","2022-01-31","2022-01-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 01","USD",0.0,5.25,-5.25,0.0,0.0],["C","2022-01-31","2022-01-31","C00355634","Fee","Cash-USD","Advisory Fee 2022 01","USD",0.0,183.26,-183.26,0.0,0.0],["C","2022-01-31","2022-01-31","C00355633","Fee","Cash-USD","Advisory Fee 2022 01","USD",0.0,256.1,-256.1,0.0,0.0],["C","2022-01-31","2022-01-31","C00347223","Fee","Cash-GBP","Advisory Fee 2022 01","GBP",0.0,778.36,-778.36,0.0,0.0],["D","2022-01-31","2022-01-31","C00355634","Dividend","ARKK","CashDiv ARKK @USD0.25768per shs","USD",0.0,35.82,35.82,0.0,35.82],["D","2022-01-31","2022-01-31","C00355634","Dividend","ARKK","CashDiv ARKK @USD0.52489per shs","USD",0.0,72.96,72.96,0.0,72.96],["D","2022-01-31","2022-01-31","C00356735","Dividend","ERNS","CashDiv ERNS @GBP0.1063per shs","GBP",0.0,34.97,34.97,0.0,34.97],["D","2022-01-31","2022-01-31","C00347223","Dividend","ERNS","CashDiv ERNS @GBP0.1063per shs","GBP",0.0,81.95,81.95,0.0,81.95],["D","2022-01-31","2022-01-31","C00356735","Dividend","AGBP","CashDiv AGBP @GBP0.0329per shs","GBP",0.0,105.21,105.21,0.0,105.21],["D","2022-01-31","2022-01-31","C00347223","Dividend","AGBP","CashDiv AGBP @GBP0.0329per shs","GBP",0.0,294.26,294.26,0.0,294.26],["T","2021-03-18","2021-03-22","C00355633","BUY","VPL","Bought VPL 68shs@USD83.2128","USD",68.0,5658.47,-5658.47,83.21,-5658.47],["T","2021-02-16","2021-02-18","C00355633","BUY","VPL","Bought VPL 67shs@USD84.7191","USD",67.0,5676.18,-5676.18,84.72,-5676.24],["T","2022-09-09","2022-09-13","C00347223","SELL","ERNS","Rebalance - SELL ERNS 48shs@GBP99.2608","GBP",-48.0,4764.52,4759.76,-100.39,4818.55],["C","2021-12-31","2021-12-31","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2021 12","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2021-12-31","2021-12-31","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2021 12","USD",0.0,134.91,-134.91,0.0,0.0],["C","2021-12-31","2021-12-31","C00356735","Fee","Cash-GBP","Advisory Fee 2021 12","GBP",0.0,467.74,-467.74,0.0,0.0],["C","2021-12-31","2021-12-31","C00355634","Fee","Cash-USD","Advisory Fee 2021 12","USD",0.0,5.25,-5.25,0.0,0.0],["C","2021-12-31","2021-12-31","C00355634","Fee","Cash-USD","Advisory Fee 2021 12","USD",0.0,186.15,-186.15,0.0,0.0],["C","2021-12-31","2021-12-31","C00355633","Fee","Cash-USD","Advisory Fee 2021 12","USD",0.0,258.79,-258.79,0.0,0.0],["C","2021-12-31","2021-12-31","C00347223","Fee","Cash-GBP","Advisory Fee 2021 12","GBP",0.0,790.01,-790.01,0.0,0.0],["D","2021-12-31","2021-12-31","C00355634","Dividend","VYM","CashDiv VYM @USD0.938599per shs","USD",0.0,99.49,99.49,0.0,99.49],["D","2021-12-31","2021-12-31","C00355634","Dividend","VWO","CashDiv VWO @USD0.478per shs","USD",0.0,163.95,163.95,0.0,163.95],["D","2021-12-31","2021-12-31","C00355633","Dividend","VWO","CashDiv VWO @USD0.478per shs","USD",0.0,396.74,396.74,0.0,396.74],["D","2021-12-31","2021-12-31","C00355634","Dividend","VTI","CashDiv VTI @USD0.8592per shs","USD",0.0,259.48,259.48,0.0,259.48],["D","2021-12-31","2021-12-31","C00355633","Dividend","VTI","CashDiv VTI @USD0.8592per shs","USD",0.0,628.94,628.94,0.0,628.94],["D","2021-12-31","2021-12-31","C00355634","Dividend","VPL","CashDiv VPL @USD1.4707per shs","USD",0.0,402.96,402.96,0.0,402.96],["D","2021-12-31","2021-12-31","C00355633","Dividend","VPL","CashDiv VPL @USD1.4707per shs","USD",0.0,951.55,951.55,0.0,951.55],["D","2021-12-31","2021-12-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.2816per shs","USD",0.0,62.8,62.8,0.0,62.8],["D","2021-12-31","2021-12-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.0988per shs","USD",0.0,22.04,22.04,0.0,22.04],["D","2021-12-31","2021-12-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.0988per shs","USD",0.0,17.58,17.58,0.0,17.58],["D","2021-12-31","2021-12-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.2816per shs","USD",0.0,50.12,50.12,0.0,50.12],["D","2021-12-31","2021-12-31","C00356735","Dividend","VAPX","CashDiv VAPX @USD0.263983per shs","USD",0.0,545.39,545.39,0.0,545.39],["D","2021-12-31","2021-12-31","C00347223","Dividend","VAPX","CashDiv VAPX @USD0.263983per shs","USD",0.0,589.47,589.47,0.0,589.47],["D","2021-12-31","2021-12-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.003464per shs","USD",0.0,0.36,0.36,0.0,0.36],["D","2021-12-31","2021-12-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.004798per shs","USD",0.0,0.52,0.52,0.0,0.52],["D","2021-12-31","2021-12-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.1386per shs","USD",0.0,41.31,41.31,0.0,41.31],["D","2021-12-31","2021-12-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.5256per shs","USD",0.0,156.63,156.63,0.0,156.63],["D","2021-12-31","2021-12-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.1386per shs","USD",0.0,32.86,32.86,0.0,32.86],["D","2021-12-31","2021-12-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.5256per shs","USD",0.0,124.57,124.57,0.0,124.57],["D","2021-12-31","2021-12-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0132per shs","USD",0.0,4.75,4.75,0.0,4.75],["D","2021-12-31","2021-12-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0131per shs","USD",0.0,4.72,4.72,0.0,4.72],["D","2021-12-31","2021-12-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0131per shs","USD",0.0,3.77,3.77,0.0,3.77],["D","2021-12-31","2021-12-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0132per shs","USD",0.0,3.81,3.81,0.0,3.81],["D","2021-12-31","2021-12-31","C00355634","Dividend","LGLV","CashDiv LGLV @USD0.626638per shs","USD",0.0,78.33,78.33,0.0,78.33],["D","2021-12-31","2021-12-31","C00355634","Dividend","DBEU","CashDiv DBEU @USD0.11248per shs","USD",0.0,80.42,80.42,0.0,80.42],["D","2021-12-31","2021-12-31","C00355633","Dividend","DBEU","CashDiv DBEU @USD0.11248per shs","USD",0.0,200.9,200.9,0.0,200.9],["D","2021-12-31","2021-12-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD1.2516per shs","USD",0.0,486.86,486.86,0.0,486.86],["D","2021-12-31","2021-12-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.3606per shs","USD",0.0,140.28,140.28,0.0,140.28],["D","2021-12-31","2021-12-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0059per shs","USD",0.0,2.29,2.29,0.0,2.29],["D","2021-12-31","2021-12-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0339per shs","USD",0.0,13.19,13.19,0.0,13.19],["D","2021-12-31","2021-12-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD1.2516per shs","USD",0.0,287.87,287.87,0.0,287.87],["D","2021-12-31","2021-12-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0059per shs","USD",0.0,1.36,1.36,0.0,1.36],["D","2021-12-31","2021-12-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.3606per shs","USD",0.0,82.94,82.94,0.0,82.94],["D","2021-12-31","2021-12-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0339per shs","USD",0.0,7.8,7.8,0.0,7.8],["D","2021-12-31","2021-12-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.020254per shs","GBP",0.0,27.71,27.71,0.0,27.71],["D","2021-12-31","2021-12-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.025123per shs","GBP",0.0,35.22,35.22,0.0,35.22],["D","2021-12-31","2021-12-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.025123per shs","GBP",0.0,79.46,79.46,0.0,79.46],["D","2021-12-31","2021-12-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.020254per shs","GBP",0.0,64.06,64.06,0.0,64.06],["T","2023-05-15","2023-05-17","C00355633","BUY","BNDX","Rebalance - BUY BNDX 124shs@USD48.8656","USD",124.0,6059.32,-6059.32,48.87,-6059.33],["T","2021-02-16","2021-02-18","C00355633","BUY","DBEU","Bought DBEU 196shs@USD31.4729","USD",196.0,6168.69,-6168.69,31.47,-6168.12],["T","2021-03-18","2021-03-22","C00355633","BUY","DBEU","Bought DBEU 192shs@USD32.1708","USD",192.0,6176.8,-6176.8,32.17,-6176.8],["T","2021-02-05","2021-02-07","C00355633","BUY","IJPH","Bought IJPH 91shs@GBP68.0112","GBP",91.0,6189.02,-6189.02,68.01,-6188.91],["T","2021-11-29","2021-12-01","C00356735","SELL","GSPX","Sold GSPX 832shs@GBP8.1322","GBP",-832.0,6765.99,6765.99,-6.74,5607.01],["T","2021-02-22","2021-02-24","C00347223","SELL","EMIM","Sold EMIM 247shs@GBP27.6300 (Rebalance)","GBP",-247.0,6824.62,6824.62,-22.99,5678.41],["C","2021-11-30","2021-11-30","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2021 11","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2021-11-30","2021-11-30","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2021 11","USD",0.0,134.91,-134.91,0.0,0.0],["C","2021-11-30","2021-11-30","C00356735","Fee","Cash-GBP","Advisory Fee 2021 11","GBP",0.0,470.41,-470.41,0.0,0.0],["C","2021-11-30","2021-11-30","C00355634","Fee","Cash-USD","Advisory Fee 2021 11","USD",0.0,2.28,-2.28,0.0,0.0],["C","2021-11-30","2021-11-30","C00355634","Fee","Cash-USD","Advisory Fee 2021 11","USD",0.0,189.7,-189.7,0.0,0.0],["C","2021-11-30","2021-11-30","C00355633","Fee","Cash-USD","Advisory Fee 2021 11","USD",0.0,262.6,-262.6,0.0,0.0],["C","2021-11-30","2021-11-30","C00347223","Fee","Cash-GBP","Advisory Fee 2021 11","GBP",0.0,792.59,-792.59,0.0,0.0],["D","2021-11-30","2021-11-30","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1009per shs","USD",0.0,22.5,22.5,0.0,22.5],["D","2021-11-30","2021-11-30","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1009per shs","USD",0.0,17.97,17.97,0.0,17.97],["D","2021-11-30","2021-11-30","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.002798per shs","USD",0.0,0.31,0.31,0.0,0.31],["D","2021-11-30","2021-11-30","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.175per shs","USD",0.0,52.14,52.14,0.0,52.14],["D","2021-11-30","2021-11-30","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.175per shs","USD",0.0,41.48,41.48,0.0,41.48],["D","2021-11-30","2021-11-30","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.013per shs","USD",0.0,4.68,4.68,0.0,4.68],["D","2021-11-30","2021-11-30","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.013per shs","USD",0.0,3.74,3.74,0.0,3.74],["D","2021-11-30","2021-11-30","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.039per shs","USD",0.0,15.17,15.17,0.0,15.17],["D","2021-11-30","2021-11-30","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.039per shs","USD",0.0,8.97,8.97,0.0,8.97],["D","2021-11-30","2021-11-30","C00356735","Dividend","EUXS","CashDiv EUXS @GBP0.0089per shs","GBP",0.0,131.16,131.16,0.0,131.16],["D","2021-11-30","2021-11-30","C00347223","Dividend","EUXS","CashDiv EUXS @GBP0.0089per shs","GBP",0.0,117.27,117.27,0.0,117.27],["T","2021-04-15","2021-04-19","C00355633","BUY","VPL","Bought VPL 76shs@USD84.1673","USD",76.0,6396.72,-6396.72,84.17,-6396.71],["T","2021-02-05","2021-02-07","C00355633","BUY","VAPX","Bought VAPX 283shs@GBP22.7241","GBP",283.0,6430.92,-6430.92,22.72,-6429.76],["T","2021-05-11","2021-05-13","C00355633","SELL","IJPH","Sold IJPH 88shs@GBP68.63","GBP",-88.0,6039.44,6039.44,-68.01,5984.88],["T","2021-02-22","2021-02-24","C00347223","SELL","EUXS","Sold EUXS 1167shs@GBP5.6787 (Rebalance)","GBP",-1167.0,6627.03,6627.03,-5.17,6036.81],["C","2021-11-30","2021-12-02","C00356735","FX Deposit","CASH-USD","FX Conversion GBP to USD @1.3368344","USD",0.0,734.0,734.0,0.0,0.0],["C","2021-11-30","2021-12-02","C00356735","FX Withdrawal","CASH-GBP","FX Conversion GBP to USD @1.3368344","GBP",0.0,550.16,-550.16,0.0,0.0],["T","2021-02-05","2021-02-07","C00355633","SELL","VAPX","Sold VAPX 291shs@GBP22.7241","GBP",-291.0,6612.71,6612.71,-21.61,6289.48],["T","2021-05-11","2021-05-13","C00355633","SELL","VAPX","Sold VAPX 281shs@GBP23.1507","GBP",-281.0,6505.35,6505.35,-22.42,6300.65],["C","2021-11-18","2021-11-18","C00355634","Deposit","CASH-USD","Initial Deposit (Fair Fund)","USD",0.0,7878.59,7878.59,0.0,0.0],["T","2021-04-15","2021-04-19","C00355633","BUY","DBEU","Bought DBEU 210shs@USD33.2359","USD",210.0,6979.54,-6979.54,33.24,-6979.54],["T","2021-02-05","2021-02-07","C00355633","SELL","IJPH","Sold IJPH 101shs@GBP68.0112","GBP",-101.0,6869.13,6869.13,-64.3,6493.95],["C","2021-10-31","2021-10-31","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2021 10","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2021-10-31","2021-10-31","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2021 10","USD",0.0,134.91,-134.91,0.0,0.0],["C","2021-10-31","2021-10-31","C00356735","Fee","Cash-GBP","Advisory Fee 2021 10","GBP",0.0,457.23,-457.23,0.0,0.0],["C","2021-10-31","2021-10-31","C00355634","Fee","Cash-USD","Advisory Fee 2021 10","USD",0.0,186.73,-186.73,0.0,0.0],["C","2021-10-31","2021-10-31","C00355633","Fee","Cash-USD","Advisory Fee 2021 10","USD",0.0,256.35,-256.35,0.0,0.0],["C","2021-10-31","2021-10-31","C00347223","Fee","Cash-GBP","Advisory Fee 2021 10","GBP",0.0,773.73,-773.73,0.0,0.0],["D","2021-10-31","2021-10-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1078per shs","USD",0.0,24.04,24.04,0.0,24.04],["D","2021-10-31","2021-10-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1078per shs","USD",0.0,19.18,19.18,0.0,19.18],["D","2021-10-31","2021-10-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.003087per shs","USD",0.0,0.33,0.33,0.0,0.33],["D","2021-10-31","2021-10-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.2945per shs","USD",0.0,87.78,87.78,0.0,87.78],["D","2021-10-31","2021-10-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.2945per shs","USD",0.0,69.79,69.79,0.0,69.79],["D","2021-10-31","2021-10-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0126per shs","USD",0.0,4.54,4.54,0.0,4.54],["D","2021-10-31","2021-10-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0126per shs","USD",0.0,3.63,3.63,0.0,3.63],["D","2021-10-31","2021-10-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0382per shs","USD",0.0,14.85,14.85,0.0,14.85],["D","2021-10-31","2021-10-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0382per shs","USD",0.0,8.79,8.79,0.0,8.79],["D","2021-10-31","2021-10-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.019755per shs","GBP",0.0,27.7,27.7,0.0,27.7],["D","2021-10-31","2021-10-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.019755per shs","GBP",0.0,62.5,62.5,0.0,62.5],["C","2021-10-28","2021-10-28","C00356735","Fee","CASH-USD","Bank Charge","USD",0.0,27.81,-27.81,0.0,0.0],["C","2021-10-28","2021-10-28","C00356735","Fee","CASH-USD","Trustee Fee","USD",0.0,1218.0,-1218.0,0.0,0.0],["C","2021-10-11","2021-10-13","C00356735","FX Withdrawal","CASH-USD","FX Conversion GBP to USD @1.3662158","USD",0.0,1055.82,-1055.82,0.0,0.0],["C","2021-10-11","2021-10-13","C00356735","FX Deposit","CASH-GBP","FX Conversion GBP to USD @1.3662158","GBP",0.0,772.81,772.81,0.0,0.0],["C","2021-10-11","2021-09-22","C00355634","Fee","CASH-GBP","Bank Charge","GBP",0.0,18.9,-18.9,0.0,0.0],["C","2021-10-11","2021-09-22","C00355634","Fee","CASH-GBP","Trustee Fee","GBP",0.0,1350.0,-1350.0,0.0,0.0],["C","2021-09-30","2021-09-30","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharges 2021 09","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2021-09-30","2021-09-30","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2021 09","USD",0.0,134.91,-134.91,0.0,0.0],["C","2021-09-30","2021-09-30","C00356735","Fee","CASH-GBP","Advisory Fee 2021 09","GBP",0.0,460.51,-460.51,0.0,0.0],["C","2021-09-30","2021-09-30","C00355634","Fee","CASH-USD","Advisory Fee 2021 09","USD",0.0,188.55,-188.55,0.0,0.0],["C","2021-09-30","2021-09-30","C00355633","Fee","CASH-USD","Advisory Fee 2021 09","USD",0.0,257.55,-257.55,0.0,0.0],["C","2021-09-30","2021-09-30","C00347223","Fee","CASH-GBP","Advisory Fee 2021 09","GBP",0.0,778.32,-778.32,0.0,0.0],["D","2021-09-30","2021-09-30","C00355634","Dividend","VYM","CashDiv VYM@USD0.7488per shs","USD",0.0,79.37,79.37,0.0,79.37],["D","2021-09-30","2021-09-30","C00355634","Dividend","VWO","CashDiv VWO@USD0.4727per shs","USD",0.0,162.13,162.13,0.0,162.13],["D","2021-09-30","2021-09-30","C00355633","Dividend","VWO","CashDiv VWO@USD0.4727per shs","USD",0.0,392.33,392.33,0.0,392.33],["D","2021-09-30","2021-09-30","C00355634","Dividend","VTI","CashDiv VTI@USD0.7242per shs","USD",0.0,218.71,218.71,0.0,218.71],["D","2021-09-30","2021-09-30","C00355633","Dividend","VTI","CashDiv VTI@USD0.7242per shs","USD",0.0,530.12,530.12,0.0,530.12],["D","2021-09-30","2021-09-30","C00355634","Dividend","VPL","CashDiv VPL@USD0.3634per shs","USD",0.0,99.57,99.57,0.0,99.57],["D","2021-09-30","2021-09-30","C00355633","Dividend","VPL","CashDiv VPL@USD0.3634per shs","USD",0.0,235.13,235.13,0.0,235.13],["D","2021-09-30","2021-09-30","C00355634","Dividend","VCSH","CashDiv VCSH@USD0.1058per shs","USD",0.0,23.6,23.6,0.0,23.6],["D","2021-09-30","2021-09-30","C00355633","Dividend","VCSH","CashDiv VCSH@USD0.1058per shs","USD",0.0,18.83,18.83,0.0,18.83],["D","2021-09-30","2021-09-30","C00356735","Dividend","VAPX","CashDiv VAPX@USD0.306325per shs","USD",0.0,649.72,649.72,0.0,649.72],["D","2021-09-30","2021-09-30","C00347223","Dividend","VAPX","CashDiv VAPX@USD0.306325per shs","USD",0.0,423.03,423.03,0.0,423.03],["D","2021-09-30","2021-09-30","C00355634","Dividend","SGOV","CashDiv SGOV@USD0.002514per shs","USD",0.0,0.27,0.27,0.0,0.27],["D","2021-09-30","2021-09-30","C00355634","Dividend","SCHP","CashDiv SCHP@USD0.4072per shs","USD",0.0,121.33,121.33,0.0,121.33],["D","2021-09-30","2021-09-30","C00355633","Dividend","SCHP","CashDiv SCHP@USD0.4072per shs","USD",0.0,96.49,96.49,0.0,96.49],["D","2021-09-30","2021-09-30","C00355634","Dividend","SCHO","CashDiv SCHO@USD0.0137per shs","USD",0.0,4.93,4.93,0.0,4.93],["D","2021-09-30","2021-09-30","C00355633","Dividend","SCHO","CashDiv SCHO@USD0.0137per shs","USD",0.0,3.94,3.94,0.0,3.94],["D","2021-09-30","2021-09-30","C00355634","Dividend","LGLV","CashDiv LGLV@USD0.498072per shs","USD",0.0,62.26,62.26,0.0,62.26],["D","2021-09-30","2021-09-30","C00355634","Dividend","BNDX","CashDiv BNDX@USD0.0401per shs","USD",0.0,15.6,15.6,0.0,15.6],["D","2021-09-30","2021-09-30","C00355633","Dividend","BNDX","CashDiv BNDX@USD0.0401per shs","USD",0.0,9.22,9.22,0.0,9.22],["D","2021-09-30","2021-09-30","C00356735","Dividend","VGOV","CashDiv VGOV@GBP0.020032per shs","GBP",0.0,28.08,28.08,0.0,28.08],["D","2021-09-30","2021-09-30","C00356735","Dividend","VGOV","CashDiv VGOV@GBP0.025092per shs","GBP",0.0,35.18,35.18,0.0,35.18],["D","2021-09-30","2021-09-30","C00347223","Dividend","VGOV","CashDiv VGOV@GBP0.025092per shs","GBP",0.0,123.49,123.49,0.0,123.49],["D","2021-09-30","2021-09-30","C00347223","Dividend","VGOV","CashDiv VGOV@GBP0.020032per shs","GBP",0.0,98.57,98.57,0.0,98.57],["D","2021-09-30","2021-09-30","C00356735","Dividend","IS15","CashDiv IS15@GBP0.8702per shs","GBP",0.0,274.11,274.11,0.0,274.11],["D","2021-09-30","2021-09-30","C00347223","Dividend","IS15","CashDiv IS15@GBP0.8702per shs","GBP",0.0,967.67,967.67,0.0,967.67],["T","2023-05-15","2023-05-17","C00347223","BUY","GSPX","Rebalance - BUY GSPX 1132shs@GBP7.039933","GBP",1132.0,7969.2,-7969.2,7.04,-7969.2],["T","2023-05-15","2023-05-17","C00347223","SELL","EUXS","Rebalance - SELL EUXS 1214shs@GBP6.538887","GBP",-1214.0,7938.21,7938.21,-6.4,7764.39],["T","2022-09-09","2022-09-13","C00347223","SELL","GSPX","Rebalance - SELL GSPX 1026shs@GBP5.63","GBP",-1026.0,5776.4,5770.62,-7.66,7862.85],["C","2021-09-15","2021-09-17","C00355634","FX Deposit","CASH-GBP","FX Conversion GBP to USD @1.384080","GBP",0.0,1370.0,1370.0,0.0,0.0],["C","2021-09-15","2021-09-17","C00355634","FX Withdrawal","CASH-USD","FX Conversion GBP to USD @1.384080","USD",0.0,1896.19,-1896.19,0.0,0.0],["T","2021-06-17","2021-06-21","C00355634","BUY","SGOV","Bought SGOV 88shs@USD100.02","USD",88.0,8801.76,-8801.76,100.02,-8801.76],["C","2021-09-08","2021-09-10","C00356735","FX Withdrawal","CASH-USD","FX Conversion USD to GBP @1.378577","USD",0.0,85.57,-85.57,0.0,0.0],["C","2021-09-08","2021-09-10","C00356735","FX Deposit","CASH-GBP","FX Conversion USD to GBP @1.378577","GBP",0.0,62.07,62.07,0.0,0.0],["C","2021-08-31","2021-08-31","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharges 2021 08","GBP",0.0,649.66,-649.66,0.0,0.0],["C","2021-08-31","2021-08-31","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2021 08","USD",0.0,134.91,-134.91,0.0,0.0],["C","2021-08-31","2021-08-31","C00356735","Fee","CASH-GBP","Advisory Fee 2021 08","GBP",0.0,458.75,-458.75,0.0,0.0],["C","2021-08-31","2021-08-31","C00355634","Fee","CASH-USD","Advisory Fee 2021 08","USD",0.0,188.75,-188.75,0.0,0.0],["C","2021-08-31","2021-08-31","C00355633","Fee","CASH-USD","Advisory Fee 2021 08","USD",0.0,256.72,-256.72,0.0,0.0],["C","2021-08-31","2021-08-31","C00347223","Fee","CASH-GBP","Advisory Fee 2021 08","GBP",0.0,779.19,-779.19,0.0,0.0],["D","2021-08-31","2021-08-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1082per shs","USD",0.0,24.13,24.13,0.0,24.13],["D","2021-08-31","2021-08-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1082per shs","USD",0.0,19.27,19.27,0.0,19.27],["D","2021-08-31","2021-08-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.001741per shs","USD",0.0,0.19,0.19,0.0,0.19],["D","2021-08-31","2021-08-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.3607per shs","USD",0.0,107.49,107.49,0.0,107.49],["D","2021-08-31","2021-08-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.3607per shs","USD",0.0,85.5,85.5,0.0,85.5],["D","2021-08-31","2021-08-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0167per shs","USD",0.0,6.02,6.02,0.0,6.02],["D","2021-08-31","2021-08-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0167per shs","USD",0.0,4.8,4.8,0.0,4.8],["D","2021-08-31","2021-08-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0405per shs","USD",0.0,15.76,15.76,0.0,15.76],["D","2021-08-31","2021-08-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0405per shs","USD",0.0,9.32,9.32,0.0,9.32],["D","2021-08-31","2021-08-31","C00356735","Dividend","GSPX","CashDiv GSPX @GBP0.0408per shs","GBP",0.0,1634.12,1634.12,0.0,1634.12],["D","2021-08-31","2021-08-31","C00347223","Dividend","GSPX","CashDiv GSPX @GBP0.0408per shs","GBP",0.0,1064.92,1064.92,0.0,1064.92],["D","2021-08-31","2021-08-31","C00356735","Dividend","EUXS","CashDiv EUXS @GBP0.0619per shs","GBP",0.0,912.22,912.22,0.0,912.22],["D","2021-08-31","2021-08-31","C00347223","Dividend","EUXS","CashDiv EUXS @GBP0.0619per shs","GBP",0.0,597.2,597.2,0.0,597.2],["T","2021-02-05","2021-02-07","C00355633","BUY","AGBP","Bought AGBP 1757shs@GBP5.2371","GBP",1757.0,9201.6,-9201.6,5.24,-9206.68],["T","2021-02-05","2021-02-07","C00355633","BUY","XGIG","Bought XGIG 333shs@GBP27.6512","GBP",333.0,9207.85,-9207.85,27.65,-9207.45],["C","2021-07-31","2021-07-31","C00356735","Fee","CASH-GBP","Advisory Fee 2021 07","GBP",0.0,455.41,-455.41,0.0,0.0],["C","2021-07-31","2021-07-31","C00355634","Fee","CASH-USD","Advisory Fee 2021 07","USD",0.0,187.39,-187.39,0.0,0.0],["C","2021-07-31","2021-07-31","C00355633","Fee","CASH-USD","Advisory Fee 2021 07","USD",0.0,254.24,-254.24,0.0,0.0],["C","2021-07-31","2021-07-31","C00347223","Fee","CASH-GBP","Advisory Fee 2021 07","GBP",0.0,773.91,-773.91,0.0,0.0],["C","2021-07-31","2021-07-31","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharges 2021 07","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2021-07-31","2021-07-31","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2021 07","USD",0.0,134.91,-134.91,0.0,0.0],["D","2021-07-31","2021-07-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1031per shs","USD",0.0,23.0,23.0,0.0,23.0],["D","2021-07-31","2021-07-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1031per shs","USD",0.0,18.35,18.35,0.0,18.35],["D","2021-07-31","2021-07-31","C00356735","Dividend","VAPX","CashDiv VAPX @USD0.175344per shs","USD",0.0,371.9,371.9,0.0,371.9],["D","2021-07-31","2021-07-31","C00347223","Dividend","VAPX","CashDiv VAPX @USD0.175344per shs","USD",0.0,242.15,242.15,0.0,242.15],["D","2021-07-31","2021-07-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.001904per shs","USD",0.0,0.2,0.2,0.0,0.2],["D","2021-07-31","2021-07-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.3182per shs","USD",0.0,94.82,94.82,0.0,94.82],["D","2021-07-31","2021-07-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.3182per shs","USD",0.0,75.4,75.4,0.0,75.4],["D","2021-07-31","2021-07-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.0162per shs","USD",0.0,5.83,5.83,0.0,5.83],["D","2021-07-31","2021-07-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.0162per shs","USD",0.0,4.66,4.66,0.0,4.66],["D","2021-07-31","2021-07-31","C00355634","Dividend","DBEU","CashDiv DBEU @USD0.56873per shs","USD",0.0,406.64,406.64,0.0,406.64],["D","2021-07-31","2021-07-31","C00355633","Dividend","DBEU","CashDiv DBEU @USD0.56873per shs","USD",0.0,1015.75,1015.75,0.0,1015.75],["D","2021-07-31","2021-07-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0415per shs","USD",0.0,16.15,16.15,0.0,16.15],["D","2021-07-31","2021-07-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0415per shs","USD",0.0,9.54,9.54,0.0,9.54],["D","2021-07-31","2021-07-31","C00356735","Dividend","VGOV","CashDiv VGOV @GBP0.020441per shs","GBP",0.0,28.66,28.66,0.0,28.66],["D","2021-07-31","2021-07-31","C00347223","Dividend","VGOV","CashDiv VGOV @GBP0.020441per shs","GBP",0.0,100.58,100.58,0.0,100.58],["D","2021-07-31","2021-07-31","C00356735","Dividend","ERNS","CashDiv ERNS @GBP0.1705per shs","GBP",0.0,57.46,57.46,0.0,57.46],["D","2021-07-31","2021-07-31","C00347223","Dividend","ERNS","CashDiv ERNS @GBP0.1705per shs","GBP",0.0,202.9,202.9,0.0,202.9],["D","2021-07-31","2021-07-31","C00356735","Dividend","AGBP","CashDiv AGBP @GBP0.0317per shs","GBP",0.0,103.98,103.98,0.0,103.98],["D","2021-07-31","2021-07-31","C00347223","Dividend","AGBP","CashDiv AGBP @GBP0.0317per shs","GBP",0.0,274.14,274.14,0.0,274.14],["C","2021-07-27","2021-07-27","C00355633","Fee","CASH-GBP","Bank Charge","GBP",0.0,20.0,-20.0,0.0,0.0],["C","2021-07-27","2021-07-27","C00355633","Fee","CASH-GBP","Trustee Fee","GBP",0.0,510.0,-510.0,0.0,0.0],["C","2021-07-20","2021-07-22","C00355633","FX Deposit","CASH-GBP","FX Conversion GBP to USD@1.36546","GBP",0.0,200.0,200.0,0.0,0.0],["C","2021-07-20","2021-07-22","C00355633","FX Withdrawal","CASH-USD","FX Conversion GBP to USD@1.36546","USD",0.0,273.09,-273.09,0.0,0.0],["T","2021-02-05","2021-02-07","C00355633","BUY","EMIM","Bought EMIM 366shs@GBP28.0780","GBP",366.0,10276.53,-10276.53,28.08,-10277.28],["T","2021-05-11","2021-05-13","C00355633","SELL","AGBP","Sold AGBP 1759shs@GBP5.1423","GBP",-1759.0,9045.28,9045.28,-5.24,9217.04],["C","2021-06-30","2021-06-30","C00356735","Fee","CASH-GBP","Advisory Fee 2021 06","GBP",0.0,450.45,-450.45,0.0,0.0],["C","2021-06-30","2021-06-30","C00355634","Fee","CASH-USD","Advisory Fee 2021 06","USD",0.0,185.79,-185.79,0.0,0.0],["C","2021-06-30","2021-06-30","C00355633","Fee","CASH-USD","Advisory Fee 2021 06","USD",0.0,253.09,-253.09,0.0,0.0],["C","2021-06-30","2021-06-30","C00347223","Fee","CASH-GBP","Advisory Fee 2021 06","GBP",0.0,767.0,-767.0,0.0,0.0],["C","2021-06-30","2021-06-30","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharges 2021 06","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2021-06-30","2021-06-30","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2021 06","USD",0.0,134.91,-134.91,0.0,0.0],["T","2023-05-15","2023-05-17","C00356735","BUY","EMIM","Rebalance - BUY EMIM 443shs@GBP23.588232","GBP",443.0,10449.58,-10449.58,23.59,-10449.59],["T","2021-05-11","2021-05-13","C00355633","SELL","XGIG","Sold XGIG 337shs@GBP27.4176","GBP",-337.0,9239.72,9239.72,-27.64,9315.65],["T","2020-12-16","2020-12-18","C00355634","BUY","SPYG","Bought SPYG 196shs@USD54.3530","USD",196.0,10653.18,-10653.18,54.35,-10652.6],["C","2021-05-24","2021-05-24","C00355634","BUY","IAU","Stock Split 2 for 1","USD",302.0,10671.95,-10671.95,35.34,-10672.68],["T","2020-12-16","2020-12-18","C00355634","BUY","IAU","Bought IAU 604shs@USD17.6688","USD",604.0,10671.95,-10671.95,17.67,-10672.68],["T","2021-02-22","2021-02-24","C00347223","BUY","VGOV","Bought VGOV 441shs@GBP24.2842 (Rebalance)","GBP",441.0,10709.34,-10709.34,24.28,-10707.48],["D","2021-06-30","2021-06-30","C00355634","Dividend","VYM","Dividend-VYM @USD0.752300per shs","USD",0.0,79.74,79.74,0.0,79.74],["D","2021-06-30","2021-06-30","C00355633","Dividend","VWO","Dividend-VWO @USD0.280300per shs","USD",0.0,232.65,232.65,0.0,232.65],["D","2021-06-30","2021-06-30","C00355634","Dividend","VWO","Dividend-VWO @USD0.280300per shs","USD",0.0,96.15,96.15,0.0,96.15],["D","2021-06-30","2021-06-30","C00355633","Dividend","VTI","Dividend-VTI @USD0.675300per shs","USD",0.0,494.32,494.32,0.0,494.32],["D","2021-06-30","2021-06-30","C00355634","Dividend","VTI","Dividend-VTI @USD0.675300per shs","USD",0.0,203.94,203.94,0.0,203.94],["D","2021-06-30","2021-06-30","C00355633","Dividend","VPL","Dividend-VPL @USD0.495200per shs","USD",0.0,320.39,320.39,0.0,320.39],["D","2021-06-30","2021-06-30","C00355634","Dividend","VPL","Dividend-VPL @USD0.495200per shs","USD",0.0,135.69,135.69,0.0,135.69],["D","2021-06-30","2021-06-30","C00347223","Dividend","VGOV","Dividend-VGOV @GBP0.020723per shs","GBP",0.0,101.98,101.98,0.0,101.98],["D","2021-06-30","2021-06-30","C00356735","Dividend","VGOV","Dividend-VGOV @GBP0.020723per shs","GBP",0.0,29.05,29.05,0.0,29.05],["D","2021-06-30","2021-06-30","C00355634","Dividend","LGLV","Dividend-LGLV @USD0.639371per shs","USD",0.0,85.04,85.04,0.0,85.04],["D","2021-06-30","2021-06-30","C00355634","Dividend","VCSH","Dividend-VCSH @USD0.109800per shs","USD",0.0,38.43,38.43,0.0,38.43],["D","2021-06-30","2021-06-30","C00355633","Dividend","BNDX","Dividend-BNDX @USD0.040800per shs","USD",0.0,9.38,9.38,0.0,9.38],["D","2021-06-30","2021-06-30","C00355633","Dividend","SCHO","Dividend-SCHO @USD0.016600per shs","USD",0.0,4.78,4.78,0.0,4.78],["D","2021-06-30","2021-06-30","C00355633","Dividend","SCHP","Dividend-SCHP @USD0.266400per shs","USD",0.0,63.14,63.14,0.0,63.14],["D","2021-06-30","2021-06-30","C00355633","Dividend","VCSH","Dividend-VCSH @USD0.109800per shs","USD",0.0,19.55,19.55,0.0,19.55],["D","2021-06-30","2021-06-30","C00355634","Dividend","BNDX","Dividend-BNDX @USD0.040800per shs","USD",0.0,15.46,15.46,0.0,15.46],["D","2021-06-30","2021-06-30","C00355634","Dividend","SCHO","Dividend-SCHO @USD0.016600per shs","USD",0.0,9.39,9.39,0.0,9.39],["D","2021-06-30","2021-06-30","C00355634","Dividend","SGOV","Dividend-SGOV @USD0.001553per shs","USD",0.0,0.34,0.34,0.0,0.34],["D","2021-06-30","2021-06-30","C00355634","Dividend","SCHP","Dividend-SCHP @USD0.266400per shs","USD",0.0,125.74,125.74,0.0,125.74],["D","2021-06-30","2021-06-30","C00356735","Dividend","VGOV","Dividend-VGOV @GBP0.025416per shs","GBP",0.0,35.63,35.63,0.0,35.63],["D","2021-06-30","2021-06-30","C00347223","Dividend","VGOV","Dividend-VGOV @GBP0.025416per shs","GBP",0.0,125.07,125.07,0.0,125.07],["T","2021-06-18","2021-06-22","C00355634","BUY","VYM","Bought VYM 106shs@USD103.3759","USD",106.0,10957.84,-10957.84,103.38,-10957.85],["T","2021-06-18","2021-06-22","C00355634","BUY","IAU","Bought IAU 325shs@USD33.7891","USD",325.0,10981.47,-10981.47,33.79,-10981.46],["T","2020-12-16","2020-12-18","C00355634","BUY","VWO","Bought VWO 225shs@USD49.6505","USD",225.0,11171.35,-11171.35,49.65,-11171.25],["T","2021-02-05","2021-02-07","C00355633","BUY","EUXS","Bought EUXS 1985shs@GBP5.7090","GBP",1985.0,11332.45,-11332.45,5.71,-11334.35],["C","2021-05-31","2021-05-31","C00356735","Fee","CASH-GBP","Advisory Fee 2021 05","GBP",0.0,443.08,-443.08,0.0,0.0],["C","2021-05-31","2021-05-31","C00355634","Fee","CASH-USD","Advisory Fee 2021 05","USD",0.0,183.67,-183.67,0.0,0.0],["C","2021-05-31","2021-05-31","C00355633","Fee","CASH-USD","Advisory Fee 2021 05","USD",0.0,247.69,-247.69,0.0,0.0],["C","2021-05-31","2021-05-31","C00347223","Fee","CASH-GBP","Advisory Fee 2021 05","GBP",0.0,759.29,-759.29,0.0,0.0],["C","2021-05-31","2021-05-31","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharges 2021 05","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2021-05-31","2021-05-31","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2021 05","USD",0.0,134.91,-134.91,0.0,0.0],["T","2021-05-11","2021-05-13","C00355633","SELL","EMIM","Sold EMIM 359shs@GBP26.0118","GBP",-359.0,9338.22,9338.22,-28.08,10080.72],["D","2021-05-31","2021-05-31","C00355634","Dividend","VCSH","VCSH Cash Div @USD0.107300per shs","USD",0.0,37.56,37.56,0.0,37.56],["D","2021-05-31","2021-05-31","C00355634","Dividend","SGOV","SGOV Cash Div @USD0.003612per shs","USD",0.0,0.79,0.79,0.0,0.79],["D","2021-05-31","2021-05-31","C00355634","Dividend","SCHP","SCHP Cash Div @USD0.181400per shs","USD",0.0,85.62,85.62,0.0,85.62],["D","2021-05-31","2021-05-31","C00355634","Dividend","SCHO","SCHO Cash Div @USD0.019500per shs","USD",0.0,11.03,11.03,0.0,11.03],["D","2021-05-31","2021-05-31","C00355634","Dividend","BNDX","BNDX Cash Div @USD0.038800per shs","USD",0.0,14.7,14.7,0.0,14.7],["D","2021-05-31","2021-05-31","C00355633","Dividend","VCSH","VCSH Cash Div @USD0.107300per shs","USD",0.0,2.25,2.25,0.0,2.25],["D","2021-05-31","2021-05-31","C00355633","Dividend","SCHP","SCHP Cash Div @USD0.181400per shs","USD",0.0,5.07,5.07,0.0,5.07],["D","2021-05-31","2021-05-31","C00355633","Dividend","SCHO","SCHO Cash Div @USD0.019500per shs","USD",0.0,0.65,0.65,0.0,0.65],["D","2021-05-31","2021-05-31","C00355633","Dividend","EUXS","EUXS Cash Div @GBP0.026100per shs","GBP",0.0,51.2,51.2,0.0,51.2],["D","2021-05-31","2021-05-31","C00355633","Dividend","XGIG","XGIG Cash Div @GBP0.133300per shs","GBP",0.0,44.92,44.92,0.0,44.92],["D","2021-05-31","2021-05-31","C00356735","Dividend","XGIG","XGIG Cash Div @GBP0.133300per shs","GBP",0.0,83.85,83.85,0.0,83.85],["D","2021-05-31","2021-05-31","C00356735","Dividend","EUXS","EUXS Cash Div @GBP0.026100per shs","GBP",0.0,384.64,384.64,0.0,384.64],["D","2021-05-31","2021-05-31","C00347223","Dividend","XGIG","XGIG Cash Div @GBP0.133300per shs","GBP",0.0,221.15,221.15,0.0,221.15],["D","2021-05-31","2021-05-31","C00347223","Dividend","EUXS","EUXS Cash Div @GBP0.026100per shs","GBP",0.0,251.81,251.81,0.0,251.81],["T","2021-02-05","2021-02-07","C00355633","SELL","EMIM","Sold EMIM 391shs@GBP28.0780","GBP",-391.0,10978.48,10978.48,-26.19,10238.94],["C","2021-04-30","2021-04-30","C00356735","Fee","CASH-GBP","Advisory Fee 2021 04","GBP",0.0,442.0,-442.0,0.0,0.0],["C","2021-04-30","2021-04-30","C00355634","Fee","CASH-USD","Advisory Fee 2021 04","USD",0.0,184.56,-184.56,0.0,0.0],["C","2021-04-30","2021-04-30","C00355633","Fee","CASH-USD","Advisory Fee 2021 04","USD",0.0,244.17,-244.17,0.0,0.0],["C","2021-04-30","2021-04-30","C00347223","Fee","CASH-GBP","Advisory Fee 2021 04","GBP",0.0,758.6,-758.6,0.0,0.0],["T","2021-06-18","2021-06-22","C00355634","SELL","SPYG","Sold SPYG 196shs@USD61.1501","USD",-196.0,11985.42,11985.42,-54.1,10604.42],["T","2021-06-18","2021-06-22","C00355634","SELL","IAU","Sold IAU 302shs@USD33.7891","USD",-302.0,10204.32,10204.32,-35.34,10672.68],["C","2021-05-24","2021-05-24","C00355634","SELL","IAU","Stock Split 2 for 1","USD",-604.0,10671.95,10671.95,-17.67,10672.68],["T","2021-06-17","2021-06-21","C00355634","SELL","VWO","Sold VWO 218shs@USD54.1512","USD",-218.0,11804.96,11804.96,-49.28,10743.2],["C","2021-05-11","2021-05-13","C00355633","FX Deposit","CASH-USD","FX Conversion GBP to USD@ 1.409239","USD",0.0,260991.13,260991.13,0.0,0.0],["C","2021-05-11","2021-05-13","C00355633","FX Withdrawal","CASH-GBP","FX Conversion GBP to USD@ 1.409239","GBP",0.0,185200.0,-185200.0,0.0,0.0],["T","2022-09-09","2022-09-13","C00347223","BUY","VGOV","Rebalance - BUY VGOV 649shs@GBP19.0296","GBP",649.0,12350.21,-12362.56,19.03,-12350.21],["T","2020-11-09","2020-11-11","C00355633","BUY","CSH2","Bought CSH2 12shs@GBP1033.2700","GBP",12.0,12399.24,-12399.24,1033.27,-12399.24],["C","2021-04-30","2021-04-30","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharges 2021 04","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2021-04-30","2021-04-30","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2021 04","USD",0.0,134.91,-134.91,0.0,0.0],["T","2021-05-11","2021-05-13","C00355633","SELL","EUXS","Sold EUXS 1962shs@GBP6.0789","GBP",-1962.0,11926.74,11926.74,-5.7,11189.2],["D","2021-04-30","2021-04-30","C00347223","Dividend","VAPX","VAPX Cash Div @USD0.297776per shs","USD",0.0,411.23,411.23,0.0,411.23],["D","2021-04-30","2021-04-30","C00356735","Dividend","VAPX","VAPX Cash Div @USD0.297776per shs","USD",0.0,631.58,631.58,0.0,631.58],["D","2021-04-30","2021-04-30","C00355633","Dividend","SCHO","SCHO Cash Div @USD0.023100per shs","USD",0.0,0.5,0.5,0.0,0.5],["D","2021-04-30","2021-04-30","C00355633","Dividend","VCSH","VCSH Cash Div @USD0.116200per shs","USD",0.0,1.63,1.63,0.0,1.63],["D","2021-04-30","2021-04-30","C00355633","Dividend","SCHP","SCHP Cash Div @USD0.093500per shs","USD",0.0,1.68,1.68,0.0,1.68],["D","2021-04-30","2021-04-30","C00355633","Dividend","VAPX","VAPX Cash Div @USD0.297776per shs","USD",0.0,83.67,83.67,0.0,83.67],["D","2021-04-30","2021-04-30","C00355634","Dividend","VCSH","VCSH Cash Div @USD0.116200per shs","USD",0.0,40.67,40.67,0.0,40.67],["D","2021-04-30","2021-04-30","C00355634","Dividend","SGOV","SGOV Cash Div @USD0.000906per shs","USD",0.0,0.2,0.2,0.0,0.2],["D","2021-04-30","2021-04-30","C00355634","Dividend","SCHP","SCHP Cash Div @USD0.093500per shs","USD",0.0,44.14,44.14,0.0,44.14],["D","2021-04-30","2021-04-30","C00355634","Dividend","SCHO","SCHO Cash Div @USD0.023100per shs","USD",0.0,13.07,13.07,0.0,13.07],["D","2021-04-30","2021-04-30","C00355634","Dividend","BNDX","BNDX Cash Div @USD0.041300per shs","USD",0.0,15.65,15.65,0.0,15.65],["D","2021-04-30","2021-04-30","C00356735","Dividend","VGOV","VGOV Cash Div @GBP0.020788per shs","GBP",0.0,29.14,29.14,0.0,29.14],["D","2021-04-30","2021-04-30","C00356735","Dividend","VGOV","VGOV Cash Div @GBP0.020271per shs","GBP",0.0,28.42,28.42,0.0,28.42],["D","2021-04-30","2021-04-30","C00347223","Dividend","VGOV","VGOV Cash Div @GBP0.020271per shs","GBP",0.0,99.76,99.76,0.0,99.76],["D","2021-04-30","2021-04-30","C00347223","Dividend","VGOV","VGOV Cash Div @GBP0.020788per shs","GBP",0.0,102.3,102.3,0.0,102.3],["D","2021-04-30","2021-04-30","C00355633","Dividend","VGOV","VGOV Cash Div @GBP0.020271per shs","GBP",0.0,20.3,20.3,0.0,20.3],["D","2021-04-30","2021-04-30","C00355633","Dividend","VGOV","VGOV Cash Div @GBP0.020788per shs","GBP",0.0,20.81,20.81,0.0,20.81],["T","2021-09-23","2021-09-27","C00347223","SELL","CUKX","Sold CUKX 110shs@GBP122.9418","GBP",-110.0,13523.59,13523.59,-104.06,11446.79],["T","2023-05-15","2023-05-17","C00356735","SELL","GSPX","Rebalance - SELL GSPX 1750shs@GBP7.039933","GBP",-1750.0,12319.88,12319.88,-6.6,11551.4],["T","2023-05-15","2023-05-17","C00355633","SELL","VTI","Rebalance - SELL VTI 56shs@USD204.137","USD",-56.0,11431.67,11431.67,-206.39,11557.94],["T","2020-11-09","2020-11-11","C00355633","BUY","XGIG","Bought XGIG 470shs@GBP27.5894","GBP",470.0,12967.03,-12967.03,27.59,-12967.3],["T","2020-11-09","2020-11-11","C00355633","BUY","AGBP","Bought AGBP 2449shs@GBP5.2977","GBP",2449.0,12974.05,-12974.05,5.3,-12979.7],["T","2021-05-11","2021-05-13","C00355633","BUY","VCSH","Bought VCSH 157shs@USD82.6903","USD",157.0,12982.38,-12982.38,82.69,-12982.38],["T","2020-12-16","2020-12-18","C00355633","BUY","GSPX","Bought GSPX 1994shs@GBP6.5223","GBP",1994.0,13005.52,-13005.52,6.52,-13000.88],["T","2021-01-15","2021-01-17","C00355633","BUY","GSPX","Bought GSPX 1950shs@GBP6.6673","GBP",1950.0,13001.24,-13001.24,6.67,-13006.5],["T","2020-11-16","2020-11-18","C00355633","BUY","GSPX","Bought GSPX 2044shs@GBP6.3648","GBP",2044.0,13009.66,-13009.66,6.36,-13009.65],["T","2021-05-11","2021-05-13","C00355633","BUY","SCHP","Bought SCHP 209shs@USD62.2587","USD",209.0,13012.06,-13012.06,62.26,-13012.07],["T","2021-05-11","2021-05-13","C00355633","BUY","SCHO","Bought SCHO 254shs@USD51.3","USD",254.0,13030.2,-13030.2,51.3,-13030.2],["T","2021-05-11","2021-05-13","C00355633","BUY","BNDX","Bought BNDX 230shs@USD56.7501","USD",230.0,13052.53,-13052.53,56.75,-13052.52],["T","2021-06-18","2021-06-22","C00355634","BUY","VTI","Bought VTI 60shs@USD217.7883","USD",60.0,13067.3,-13067.3,217.79,-13067.3],["C","2021-03-31","2021-03-31","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharges 2021 03","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2021-03-31","2021-03-31","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2021 03","USD",0.0,134.91,-134.91,0.0,0.0],["D","2021-03-31","2021-03-31","C00355634","Dividend","SCHO","SCHO Cash Div @USD0.023000per shs","USD",0.0,13.02,13.02,0.0,13.02],["D","2021-03-31","2021-03-31","C00355633","Dividend","SCHO","SCHO Cash Div @USD0.023000per shs","USD",0.0,0.25,0.25,0.0,0.25],["D","2021-03-31","2021-03-31","C00355633","Dividend","VCSH","VCSH Cash Div @USD0.108500per shs","USD",0.0,0.76,0.76,0.0,0.76],["D","2021-03-31","2021-03-31","C00355633","Dividend","VPL","VPL Cash Div @USD0.156600per shs","USD",0.0,20.98,20.98,0.0,20.98],["D","2021-03-31","2021-03-31","C00355633","Dividend","VTI","VTI Cash Div @USD0.671600per shs","USD",0.0,105.44,105.44,0.0,105.44],["D","2021-03-31","2021-03-31","C00355633","Dividend","VWO","VWO Cash Div @USD0.068400per shs","USD",0.0,11.49,11.49,0.0,11.49],["D","2021-03-31","2021-03-31","C00355634","Dividend","BNDX","BNDX Cash Div @USD0.045100per shs","USD",0.0,17.1,17.1,0.0,17.1],["D","2021-03-31","2021-03-31","C00355634","Dividend","LGLV","LGLV Cash Div @USD0.725413per shs","USD",0.0,96.2,96.2,0.0,96.2],["D","2021-03-31","2021-03-31","C00355634","Dividend","SPYG","SPYG Cash Div @USD0.114768per shs","USD",0.0,22.49,22.49,0.0,22.49],["D","2021-03-31","2021-03-31","C00355634","Dividend","VCSH","VCSH Cash Div @USD0.108500per shs","USD",0.0,37.98,37.98,0.0,37.98],["D","2021-03-31","2021-03-31","C00355634","Dividend","VPL","VPL Cash Div @USD0.156600per shs","USD",0.0,28.19,28.19,0.0,28.19],["D","2021-03-31","2021-03-31","C00355634","Dividend","VTI","VTI Cash Div @USD0.671600per shs","USD",0.0,141.7,141.7,0.0,141.7],["D","2021-03-31","2021-03-31","C00355634","Dividend","VWO","VWO Cash Div @USD0.068400per shs","USD",0.0,14.91,14.91,0.0,14.91],["D","2021-03-31","2021-03-31","C00355634","Dividend","LGLV","LGLV Cash Div @USD0.725413per shs","USD",0.0,0.28,0.28,0.0,0.28],["D","2021-03-31","2021-03-31","C00355633","Dividend","IS15","IS15 Cash Div @GBP0.939200per shs","GBP",0.0,212.26,212.26,0.0,212.26],["D","2021-03-31","2021-03-31","C00355633","Dividend","VGOV","VGOV Cash Div @GBP0.020983per shs","GBP",0.0,20.52,20.52,0.0,20.52],["D","2021-03-31","2021-03-31","C00356735","Dividend","IS15","IS15 Cash Div @GBP0.939200per shs","GBP",0.0,295.85,295.85,0.0,295.85],["D","2021-03-31","2021-03-31","C00347223","Dividend","VGOV","VGOV Cash Div @GBP0.020983per shs","GBP",0.0,94.01,94.01,0.0,94.01],["D","2021-03-31","2021-03-31","C00347223","Dividend","IS15","IS15 Cash Div @GBP0.939200per shs","GBP",0.0,1044.39,1044.39,0.0,1044.39],["T","2020-12-16","2020-12-18","C00355634","BUY","VPL","Bought VPL 177shs@USD78.9137","USD",177.0,13967.72,-13967.72,78.91,-13967.07],["T","2021-02-05","2021-02-07","C00355633","SELL","CSH2","Sold CSH2 12shs@GBP1033.6200","GBP",-12.0,12403.44,12403.44,-1033.27,12399.24],["T","2021-02-05","2021-02-07","C00355633","SELL","EUXS","Sold EUXS 2267shs@GBP5.7090","GBP",-2267.0,12942.41,12942.41,-5.52,12506.3],["T","2023-05-15","2023-05-17","C00355633","SELL","DBEU","Rebalance - SELL DBEU 402shs@USD37.5413","USD",-402.0,15091.61,15091.61,-31.55,12684.45],["T","2023-05-15","2023-05-17","C00356735","SELL","EUXS","Rebalance - SELL EUXS 2333shs@GBP6.538887","GBP",-2333.0,15255.22,15255.22,-5.5,12832.27],["T","2021-02-05","2021-02-07","C00355633","SELL","AGBP","Sold AGBP 2449shs@GBP5.2371","GBP",-2449.0,12825.68,12825.68,-5.27,12896.68],["T","2021-02-05","2021-02-07","C00355633","SELL","XGIG","Sold XGIG 470shs@GBP27.6512","GBP",-470.0,12996.07,12996.07,-27.59,12967.3],["T","2021-06-17","2021-06-21","C00355634","BUY","SCHP","Bought SCHP 239shs@USD61.8967","USD",239.0,14793.3,-14793.3,61.9,-14793.31],["T","2021-06-17","2021-06-21","C00355634","BUY","VCSH","Bought VCSH 179shs@USD82.6621","USD",179.0,14796.52,-14796.52,82.66,-14796.52],["T","2021-06-17","2021-06-21","C00355634","BUY","SCHO","Bought SCHO 289shs@USD51.2353","USD",289.0,14807.01,-14807.01,51.24,-14807.0],["T","2021-06-17","2021-06-21","C00355634","SELL","VPL","Sold VPL 180shs@USD83.7439","USD",-180.0,15073.91,15073.91,-77.97,14034.43],["T","2021-06-17","2021-06-21","C00355634","BUY","VWO","Bought VWO 275shs@USD54.1512","USD",275.0,14891.58,-14891.58,54.15,-14891.58],["T","2020-08-13","2020-08-17","C00347223","BUY","CUKX","Bought CUKX 146shs @GBP103.991","GBP",146.0,15182.7,-15182.7,103.99,-15182.7],["C","2021-02-28","2021-02-28","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharges 2021 02","GBP",0.0,422.28,-422.28,0.0,0.0],["C","2021-02-28","2021-02-28","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2021 02","USD",0.0,134.91,-134.91,0.0,0.0],["T","2021-06-18","2021-06-22","C00355634","SELL","ARKK","Sold ARKK 127shs@USD118.786","USD",-127.0,15085.82,15085.82,-122.07,15502.35],["C","2020-12-31","2020-12-31","C00355634","Fee","CASH-USD","Advisory Fee 2020 12","USD",0.0,239.17,-239.17,0.0,0.0],["C","2020-12-31","2020-12-31","C00355633","Fee","CASH-GBP","Advisory Fee 2020 12","GBP",0.0,174.5,-174.5,0.0,0.0],["C","2020-12-31","2020-12-31","C00347223","Fee","CASH-GBP","Advisory Fee 2020 12","GBP",0.0,743.22,-743.22,0.0,0.0],["T","2020-12-16","2020-12-18","C00355634","BUY","ARKK","Bought ARKK 127shs@USD124.1135","USD",127.0,15762.42,-15762.42,124.11,-15761.97],["T","2020-12-16","2020-12-18","C00355634","BUY","LGLV","Bought LGLV 133shs@USD119.7592","USD",133.0,15927.97,-15927.97,119.76,-15928.08],["T","2021-06-18","2021-06-22","C00355634","SELL","LGLV","Sold LGLV 133shs@USD131.2508","USD",-133.0,17456.36,17456.36,-118.07,15703.37],["T","2021-06-17","2021-06-21","C00355634","SELL","DBEU","Sold DBEU 528shs@USD35.0286","USD",-528.0,18495.11,18495.11,-29.92,15799.92],["T","2021-02-16","2021-02-18","C00355633","BUY","VTI","Bought VTI 78shs@USD208.1180","USD",78.0,16233.2,-16233.2,208.12,-16233.36],["T","2021-03-18","2021-03-22","C00355633","BUY","VTI","Bought VTI 79shs@USD207.2901","USD",79.0,16375.92,-16375.92,207.29,-16375.92],["T","2021-06-18","2021-06-22","C00355634","BUY","LGLV","Bought LGLV 125shs@USD131.2508","USD",125.0,16406.36,-16406.36,131.25,-16406.35],["T","2021-06-18","2021-06-22","C00355634","BUY","ARKK","Bought ARKK 139shs@USD118.786","USD",139.0,16511.26,-16511.26,118.79,-16511.25],["D","2021-02-28","2021-02-28","C00355634","Dividend","BNDX","BNDX Cash Div @USD0.045000per shs","USD",0.0,16.38,16.38,0.0,16.38],["D","2021-02-28","2021-02-28","C00355634","Dividend","VCSH","VCSH Cash Div @USD0.124500per shs","USD",0.0,42.45,42.45,0.0,42.45],["D","2021-02-28","2021-02-28","C00355634","Dividend","SCHO","SCHO Cash Div @USD0.030300per shs","USD",0.0,16.73,16.73,0.0,16.73],["D","2021-02-28","2021-02-28","C00355634","Dividend","SGOV","SGOV Cash Div @USD0.004968per shs","USD",0.0,1.05,1.05,0.0,1.05],["D","2021-02-28","2021-02-28","C00355633","Dividend","VGOV","VGOV Cash Div @GBP0.025771per shs","GBP",0.0,21.62,21.62,0.0,21.62],["D","2021-02-28","2021-02-28","C00355633","Dividend","EUXS","EUXS Cash Div @GBP0.006100per shs","GBP",0.0,13.82,13.82,0.0,13.82],["D","2021-02-28","2021-02-28","C00355633","Dividend","GSPX","GSPX Cash Div @GBP0.039700per shs","GBP",0.0,213.78,213.78,0.0,213.78],["D","2021-02-28","2021-02-28","C00347223","Dividend","GSPX","GSPX Cash Div @GBP0.039700per shs","GBP",0.0,1167.14,1167.14,0.0,1167.14],["D","2021-02-28","2021-02-28","C00347223","Dividend","EUXS","EUXS Cash Div @GBP0.006100per shs","GBP",0.0,65.97,65.97,0.0,65.97],["D","2021-02-28","2021-02-28","C00347223","Dividend","VGOV","VGOV Cash Div @GBP0.025771per shs","GBP",0.0,115.45,115.45,0.0,115.45],["T","2021-02-22","2021-02-24","C00356735","BUY","AGBP","Bought AGBP 3280shs@GBP5.1823 ","GBP",3280.0,16997.82,-16997.82,5.18,-16990.4],["T","2021-02-22","2021-02-24","C00356735","BUY","XGIG","Bought XGIG 629shs@GBP27.0457 ","GBP",629.0,17011.75,-17011.75,27.05,-17014.45],["T","2020-12-16","2020-12-18","C00355634","BUY","DBEU","Bought DBEU 575shs@USD30.2590","USD",575.0,17398.92,-17398.92,30.26,-17399.5],["T","2021-02-05","2021-02-07","C00355633","BUY","CSH2","Bought CSH2 17shs@GBP1033.6200","GBP",17.0,17571.54,-17571.54,1033.62,-17571.54],["T","2021-06-17","2021-06-21","C00355634","BUY","BNDX","Bought BNDX 312shs@USD56.9637","USD",312.0,17772.67,-17772.67,56.96,-17772.67],["T","2021-05-11","2021-05-13","C00355633","SELL","CSH2","Sold CSH2 18shs@GBP1033.87","GBP",-18.0,18609.66,18609.66,-1033.62,18605.2],["T","2021-04-15","2021-04-19","C00355633","BUY","VTI","Bought VTI 85shs@USD215.6722","USD",85.0,18332.14,-18332.14,215.67,-18332.14],["T","2021-06-17","2021-06-21","C00355634","BUY","VPL","Bought VPL 219shs@USD83.7439","USD",219.0,18339.92,-18339.92,83.74,-18339.91],["T","2021-02-22","2021-02-24","C00356735","BUY","CUKX","Bought CUKX 167shs@GBP111.0818 ","GBP",167.0,18550.66,-18550.66,111.08,-18550.36],["T","2021-02-22","2021-02-24","C00347223","SELL","GSPX","Sold GSPX 3298shs@GBP6.7890 (Rebalance)","GBP",-3298.0,22390.02,22390.02,-5.95,19627.21],["T","2021-09-23","2021-09-27","C00347223","BUY","CUKX","Bought CUKX 155shs@GBP122.9418","GBP",155.0,19055.97,-19055.97,122.94,-19055.98],["T","2021-02-05","2021-02-07","C00355633","SELL","ERNS","Sold ERNS 214shs@GBP100.5500","GBP",-214.0,21517.7,21517.7,-100.47,21501.39],["T","2021-02-05","2021-02-07","C00355633","SELL","IS15","Sold IS15 201shs@GBP107.7467","GBP",-201.0,21657.08,21657.08,-107.1,21527.1],["T","2021-02-05","2021-02-07","C00355633","SELL","VGOV","Sold VGOV 839shs@GBP25.0693","GBP",-839.0,21033.1,21033.1,-25.72,21577.3],["T","2021-06-17","2021-06-21","C00355634","SELL","SGOV","Sold SGOV 218shs@USD100.02","USD",-218.0,21804.36,21804.36,-100.01,21803.13],["T","2021-06-17","2021-06-21","C00355634","BUY","DBEU","Bought DBEU 572shs@USD35.0286","USD",572.0,20036.37,-20036.37,35.03,-20036.36],["T","2021-06-17","2021-06-21","C00355634","SELL","BNDX","Sold BNDX 379shs@USD56.9637","USD",-379.0,21589.24,21589.24,-58.15,22038.51],["T","2020-12-16","2020-12-18","C00355634","BUY","SGOV","Bought SGOV 212shs@USD100.0300","USD",212.0,21206.36,-21206.36,100.03,-21206.36],["T","2020-12-16","2020-12-18","C00355634","BUY","BNDX","Bought BNDX 364shs@USD58.4892","USD",364.0,21290.06,-21290.06,58.49,-21290.36],["T","2020-11-09","2020-11-11","C00355633","BUY","IS15","Bought IS15 201shs@GBP107.0971","GBP",201.0,21526.52,-21526.52,107.1,-21527.1],["T","2020-11-09","2020-11-11","C00355633","BUY","ERNS","Bought ERNS 214shs@GBP100.7779","GBP",214.0,21566.46,-21566.46,100.78,-21566.92],["T","2021-05-11","2021-05-13","C00355633","SELL","IS15","Sold IS15 226shs@GBP106.6974","GBP",-226.0,24113.62,24113.62,-106.81,24139.24],["T","2021-05-11","2021-05-13","C00355633","SELL","ERNS","Sold ERNS 242shs@GBP100.5126","GBP",-242.0,24324.04,24324.04,-100.55,24333.1],["T","2020-11-09","2020-11-11","C00355633","BUY","VGOV","Bought VGOV 839shs@GBP25.7558","GBP",839.0,21609.13,-21609.13,25.76,-21612.64],["T","2021-05-11","2021-05-13","C00355633","SELL","VGOV","Sold VGOV 1001shs@GBP23.967","GBP",-1001.0,23990.92,23990.92,-24.97,24993.65],["T","2021-09-23","2021-09-27","C00347223","SELL","IJPH","Sold IJPH 432shs@GBP75.354","GBP",-432.0,32552.92,32552.92,-57.89,25009.04],["C","2021-02-12","2021-02-12","C00356735","SR","CASH-GBP","Surrender Rebate","GBP",0.0,50674.14,50674.14,0.0,0.0],["C","2021-02-12","2021-02-12","C00356735","Deposit","CASH-GBP","Initial Deposit","GBP",0.0,632137.32,632137.32,0.0,0.0],["T","2021-09-23","2021-09-27","C00347223","SELL","VAPX","Sold VAPX 1381shs@GBP21.8774","GBP",-1381.0,30212.71,30212.71,-18.28,25240.7],["C","2021-01-31","2021-01-31","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2021 01","USD",0.0,134.91,-134.91,0.0,0.0],["C","2021-02-05","2021-02-09","C00355633","FX Deposit","CASH-USD","FX Conversion GBP to USD @ 1.367741","USD",0.0,107838.16,107838.16,0.0,0.0],["C","2021-02-05","2021-02-09","C00355633","FX Withdrawal","CASH-GBP","FX Conversion GBP to USD @ 1.367741","GBP",0.0,78844.0,-78844.0,0.0,0.0],["D","2021-01-31","2021-01-31","C00355633","Dividend","AGBP","AGBP Cash Div @GBP0.033900per shs","GBP",0.0,83.02,83.02,0.0,83.02],["D","2021-01-31","2021-01-31","C00347223","Dividend","AGBP","AGBP Cash Div @GBP0.033900per shs","GBP",0.0,281.13,281.13,0.0,281.13],["T","2021-02-05","2021-02-07","C00355633","BUY","IS15","Bought IS15 227shs@GBP107.7467","GBP",227.0,24458.49,-24458.49,107.75,-24459.25],["T","2021-02-05","2021-02-07","C00355633","BUY","VGOV","Bought VGOV 978shs@GBP25.0693","GBP",978.0,24517.73,-24517.73,25.07,-24518.46],["T","2021-02-05","2021-02-07","C00355633","BUY","ERNS","Bought ERNS 244shs@GBP100.5500","GBP",244.0,24534.2,-24534.2,100.55,-24534.2],["C","2020-12-31","2020-12-31","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2020 12","USD",0.0,134.91,-134.91,0.0,0.0],["C","2021-01-08","2021-01-08","C00355634","Fee","CASH-USD","Bank Charge","USD",0.0,20.0,-20.0,0.0,0.0],["C","2021-01-08","2021-01-08","C00355634","Withdrawal","CASH-USD","Withdrawal - PCLS","USD",0.0,89444.65,-89444.65,0.0,0.0],["D","2020-12-31","2020-12-31","C00347223","Dividend","VAPX","VAPX Cash Div @USD0.092648per shs","USD",0.0,136.38,136.38,0.0,136.38],["D","2020-12-31","2020-12-31","C00355634","Dividend","ARKK","ARKK Cash Div @USD1.627740per shs","USD",0.0,206.72,206.72,0.0,206.72],["D","2020-12-31","2020-12-31","C00355633","Dividend","VAPX","VAPX Cash Div @USD0.092648per shs","USD",0.0,18.44,18.44,0.0,18.44],["D","2020-12-31","2020-12-31","C00355634","Dividend","ARKK","ARKK Cash Div @USD0.416570per shs","USD",0.0,52.9,52.9,0.0,52.9],["D","2020-12-31","2020-12-31","C00355634","Dividend","VPL","VPL Cash Div @USD0.882200per shs","USD",0.0,156.15,156.15,0.0,156.15],["D","2020-12-31","2020-12-31","C00355634","Dividend","BNDX","BNDX Cash Div @USD0.089400per shs","USD",0.0,32.54,32.54,0.0,32.54],["D","2020-12-31","2020-12-31","C00355634","Dividend","BNDX","BNDX Cash Div @USD0.046100per shs","USD",0.0,16.78,16.78,0.0,16.78],["D","2020-12-31","2020-12-31","C00355634","Dividend","DBEU","DBEU Cash Div @USD0.335920per shs","USD",0.0,193.15,193.15,0.0,193.15],["D","2020-12-31","2020-12-31","C00355634","Dividend","LGLV","LGLV Cash Div @USD0.964129per shs","USD",0.0,128.23,128.23,0.0,128.23],["D","2020-12-31","2020-12-31","C00355634","Dividend","SCHO","SCHO Cash Div @USD0.029300per shs","USD",0.0,16.17,16.17,0.0,16.17],["D","2020-12-31","2020-12-31","C00355634","Dividend","SCHP","SCHP Cash Div @USD0.126100per shs","USD",0.0,57.88,57.88,0.0,57.88],["D","2020-12-31","2020-12-31","C00355634","Dividend","SGOV","SGOV Cash Div @USD0.006180per shs","USD",0.0,1.31,1.31,0.0,1.31],["D","2020-12-31","2020-12-31","C00355634","Dividend","VCSH","VCSH Cash Div @USD0.130900per shs","USD",0.0,44.64,44.64,0.0,44.64],["D","2020-12-31","2020-12-31","C00355634","Dividend","VTI","VTI Cash Div @USD0.781800per shs","USD",0.0,172.78,172.78,0.0,172.78],["D","2020-12-31","2020-12-31","C00355634","Dividend","VWO","VWO Cash Div @USD0.300900per shs","USD",0.0,67.7,67.7,0.0,67.7],["D","2020-12-31","2020-12-31","C00355634","Dividend","SPYG","SPYG Cash Div @USD0.131055per shs","USD",0.0,25.69,25.69,0.0,25.69],["D","2020-12-31","2020-12-31","C00347223","Dividend","VGOV","VGOV Cash Div @GBP0.021059per shs","GBP",0.0,91.42,91.42,0.0,91.42],["D","2020-12-31","2020-12-31","C00347223","Dividend","ERNS","ERNS Cash Div @GBP0.306200per shs","GBP",0.0,353.97,353.97,0.0,353.97],["D","2020-12-31","2020-12-31","C00347223","Dividend","VGOV","VGOV Cash Div @GBP0.021059per shs","GBP",0.0,94.35,94.35,0.0,94.35],["D","2020-12-31","2020-12-31","C00355633","Dividend","ERNS","ERNS Cash Div @GBP0.306200per shs","GBP",0.0,65.53,65.53,0.0,65.53],["D","2020-12-31","2020-12-31","C00355633","Dividend","VGOV","VGOV Cash Div @GBP0.021059per shs","GBP",0.0,17.67,17.67,0.0,17.67],["D","2020-12-31","2020-12-31","C00355633","Dividend","VGOV","VGOV Cash Div @GBP0.021059per shs","GBP",0.0,17.67,17.67,0.0,17.67],["T","2021-02-22","2021-02-24","C00347223","BUY","CSH2","Bought CSH2 26shs@GBP1033.6600 (Rebalance)","GBP",26.0,26875.16,-26875.16,1033.66,-26875.16],["T","2020-08-13","2020-08-17","C00347223","BUY","VAPX","Bought VAPX 1431shs @GBP18.947","GBP",1431.0,27113.54,-27113.54,18.95,-27113.54],["T","2020-08-13","2020-08-17","C00347223","BUY","IJPH","Bought IJPH 483shs @GBP57.785","GBP",483.0,27910.15,-27910.15,57.79,-27910.15],["T","2020-12-16","2020-12-18","C00355634","BUY","VCSH","Bought VCSH 341shs@USD83.1253","USD",341.0,28345.71,-28345.71,83.13,-28347.33],["T","2020-12-16","2020-12-18","C00355634","BUY","SCHO","Bought SCHO 552shs@USD51.4170","USD",552.0,28382.19,-28382.19,51.42,-28383.84],["T","2020-12-16","2020-12-18","C00355634","BUY","SCHP","Bought SCHP 459shs@USD61.8616","USD",459.0,28394.48,-28394.48,61.86,-28393.74],["T","2021-05-11","2021-05-13","C00355633","BUY","VWO","Bought VWO 564shs@USD51.9764","USD",564.0,29314.68,-29314.68,51.98,-29314.69],["C","2020-11-30","2020-11-30","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2020 11","USD",0.0,134.91,-134.91,0.0,0.0],["T","2021-06-17","2021-06-21","C00355634","SELL","VCSH","Sold VCSH 350shs@USD82.6621","USD",-350.0,28931.74,28931.74,-82.55,28891.66],["T","2021-06-17","2021-06-21","C00355634","SELL","SCHP","Sold SCHP 472shs@USD61.8967","USD",-472.0,29215.23,29215.23,-61.45,29004.3],["T","2021-06-17","2021-06-21","C00355634","SELL","SCHO","Sold SCHO 566shs@USD51.2353","USD",-566.0,28999.19,28999.19,-51.3,29033.0],["D","2020-11-30","2020-11-30","C00347223","Dividend","EUXS","EUXS Cash Div @GBP0.005900per shs","GBP",0.0,61.93,61.93,0.0,61.93],["D","2020-11-30","2020-11-30","C00347223","Dividend","VGOV","VGOV Cash Div @GBP0.021048per shs","GBP",0.0,91.37,91.37,0.0,91.37],["T","2023-05-15","2023-05-17","C00356735","BUY","GILS","Rebalance - BUY GILS 318shs@GBP103.931855","GBP",318.0,33050.33,-33050.33,103.93,-33050.33],["T","2021-02-22","2021-02-24","C00356735","BUY","ERNS","Bought ERNS 337shs@GBP100.5811 ","GBP",337.0,33895.83,-33895.83,100.58,-33895.46],["T","2021-02-22","2021-02-24","C00356735","BUY","IS15","Bought IS15 315shs@GBP107.6583 ","GBP",315.0,33912.36,-33912.36,107.66,-33912.9],["T","2021-02-22","2021-02-24","C00356735","BUY","VGOV","Bought VGOV 1402shs@GBP24.2842 ","GBP",1402.0,34046.48,-34046.48,24.28,-34040.56],["C","2020-10-31","2020-10-31","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2020 10","USD",0.0,134.91,-134.91,0.0,0.0],["D","2020-10-31","2020-10-07","C00347223","Dividend","VAPX","VAPX Cash Div.@USD0.1534per shs","USD",0.0,219.57,219.57,0.0,219.57],["D","2020-10-31","2020-11-04","C00347223","Dividend","VGOV","VGOV Cash Div.@GBP0.0212per shs","GBP",0.0,92.08,92.08,0.0,92.08],["D","2020-10-31","2020-09-30","C00347223","Dividend","IS15","IS15 Cash Div.@GBP0.9700per shs","GBP",0.0,1022.38,1022.38,0.0,1022.38],["T","2021-05-11","2021-05-13","C00355633","BUY","VPL","Bought VPL 437shs@USD82.395","USD",437.0,36006.63,-36006.63,82.4,-36006.62],["T","2021-02-05","2021-02-07","C00355633","BUY","GSPX","Bought GSPX 5385shs@GBP6.8343","GBP",5385.0,36802.48,-36802.48,6.83,-36779.55],["C","2020-10-28","2020-10-28","C00355633","Deposit","CASH-GBP","Initial Deposit","GBP",0.0,260051.64,260051.64,0.0,0.0],["C","2020-09-30","2020-09-30","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharges 2020 09","USD",0.0,134.91,-134.91,0.0,0.0],["D","2020-09-30","2020-09-02","C00347223","Dividend","VGOV","VGOV Cash Div.@GBP0.0216per shs","GBP",0.0,93.67,93.67,0.0,93.67],["T","2021-05-11","2021-05-13","C00355633","BUY","DBEU","Bought DBEU 1189shs@USD33.1754","USD",1189.0,39445.59,-39445.59,33.18,-39445.55],["C","2020-09-23","2020-09-23","C00355634","SR","CASH-USD","Surrender Rebate","USD",0.0,16189.73,16189.73,0.0,0.0],["C","2020-09-23","2020-09-23","C00355634","Deposit","CASH-USD","Initial Deposit","USD",0.0,341108.85,341108.85,0.0,0.0],["T","2020-08-13","2020-08-17","C00347223","BUY","XGIG","Bought XGIG 1536shs @GBP27.647","GBP",1536.0,42466.06,-42466.06,27.65,-42466.06],["T","2020-08-13","2020-08-17","C00347223","BUY","AGBP","Bought AGBP 8041shs @GBP5.282","GBP",8041.0,42471.16,-42471.16,5.28,-42471.16],["T","2020-12-16","2020-12-18","C00355634","BUY","VTI","Bought VTI 221shs@USD192.2762","USD",221.0,42493.05,-42493.05,192.28,-42493.88],["C","2020-08-31","2020-08-31","C00347223","Fee","CASH-GBP","Advisory Fee 2020 08","GBP",0.0,505.27,-505.27,0.0,0.0],["T","2020-08-13","2020-08-17","C00347223","BUY","EMIM","Bought EMIM 1956shs @GBP22.936","GBP",1956.0,44862.41,-44862.41,22.94,-44862.41],["T","2021-09-23","2021-09-27","C00347223","BUY","CSH2","Bought CSH2 44shs@GBP1034.1225","GBP",44.0,45501.39,-45501.39,1034.12,-45501.39],["T","2021-02-22","2021-02-24","C00356735","BUY","IJPH","Bought IJPH 658shs@GBP69.6833 ","GBP",658.0,45851.61,-45851.61,69.68,-45849.44],["T","2021-09-23","2021-09-27","C00347223","BUY","AGBP","Bought AGBP 8944shs@GBP5.1983","GBP",8944.0,46494.01,-46494.01,5.2,-46493.6],["T","2021-09-23","2021-09-27","C00347223","BUY","XGIG","Bought XGIG 1606shs@GBP28.9982","GBP",1606.0,46571.09,-46571.09,29.0,-46571.11],["T","2021-09-23","2021-09-27","C00347223","BUY","IJPH","Bought IJPH 627shs@GBP75.354","GBP",627.0,47246.94,-47246.94,75.35,-47246.96],["T","2021-02-22","2021-02-24","C00356735","BUY","VAPX","Bought VAPX 2121shs@GBP22.4219 ","GBP",2121.0,47556.84,-47556.84,22.42,-47552.82],["T","2021-09-23","2021-09-27","C00347223","BUY","VAPX","Bought VAPX 2233shs@GBP21.8774","GBP",2233.0,48852.26,-48852.26,21.88,-48852.23],["C","2020-08-10","2020-08-10","C00347223","Deposit","CASH-GBP","Initial Deposit","GBP",0.0,853201.93,853201.93,0.0,0.0],["T","2021-06-17","2021-06-21","C00355634","BUY","VTI","Bought VTI 242shs@USD219.629","USD",242.0,53150.21,-53150.21,219.63,-53150.22],["T","2020-08-13","2020-08-17","C00347223","BUY","EUXS","Bought EUXS 10497shs @GBP5.173","GBP",10497.0,54296.31,-54296.31,5.17,-54296.31],["T","2020-08-13","2020-08-17","C00347223","BUY","CSH2","Bought CSH2 61shs @GBP1032.95","GBP",61.0,63009.95,-63009.95,1032.95,-63009.95],["T","2021-05-11","2021-05-13","C00355633","SELL","GSPX","Sold GSPX 5308shs@GBP7.3067","GBP",-5308.0,38783.86,38783.86,-6.79,36039.86],["T","2023-05-15","2023-05-17","C00356735","SELL","VGOV","Rebalance - SELL VGOV 1647shs@GBP17.191432","GBP",-1647.0,28314.29,28314.29,-22.8,37551.51],["T","2023-05-15","2023-05-17","C00347223","BUY","GILS","Rebalance - BUY GILS 681shs@GBP103.931855","GBP",681.0,70777.59,-70777.59,103.93,-70777.59],["T","2021-02-05","2021-02-07","C00355633","SELL","GSPX","Sold GSPX 5988shs@GBP6.8343","GBP",-5988.0,40923.54,40923.54,-6.52,39017.03],["T","2021-02-22","2021-02-24","C00356735","BUY","EMIM","Bought EMIM 2749shs@GBP27.6325 ","GBP",2749.0,75961.79,-75961.79,27.63,-75954.87],["T","2021-09-23","2021-09-27","C00347223","BUY","IS15","Bought IS15 728shs@GBP106.4211","GBP",728.0,77474.53,-77474.53,106.42,-77474.56],["T","2021-09-23","2021-09-27","C00347223","BUY","ERNS","Bought ERNS 771shs@GBP100.7758","GBP",771.0,77698.13,-77698.13,100.78,-77698.14],["T","2021-06-17","2021-06-21","C00355634","SELL","VTI","Sold VTI 211shs@USD219.629","USD",-211.0,46341.71,46341.71,-190.83,40264.42],["T","2021-09-23","2021-09-27","C00347223","BUY","EMIM","Bought EMIM 2920shs@GBP26.6976","GBP",2920.0,77956.91,-77956.91,26.7,-77956.99],["T","2021-09-23","2021-09-27","C00347223","BUY","VGOV","Bought VGOV 3163shs@GBP24.668","GBP",3163.0,78024.88,-78024.88,24.67,-78024.88],["T","2021-09-23","2021-09-27","C00347223","SELL","EMIM","Sold EMIM 1765shs@GBP26.6976","GBP",-1765.0,47121.22,47121.22,-22.99,40576.46],["T","2021-02-22","2021-02-24","C00356735","BUY","EUXS","Bought EUXS 14737shs@GBP5.6799 ","GBP",14737.0,83704.07,-83704.07,5.68,-83706.16],["T","2021-09-23","2021-09-27","C00347223","BUY","EUXS","Bought EUXS 13178shs@GBP6.556","GBP",13178.0,86394.97,-86394.97,6.56,-86394.97],["T","2021-05-11","2021-05-13","C00355633","BUY","VTI","Bought VTI 490shs@USD213.8812","USD",490.0,104801.8,-104801.8,213.88,-104801.79],["T","2021-09-23","2021-09-27","C00347223","SELL","AGBP","Sold AGBP 8648shs@GBP5.1983","GBP",-8648.0,44955.3,44955.3,-5.21,45089.64],["T","2021-09-23","2021-09-27","C00347223","SELL","XGIG","Sold XGIG 1659shs@GBP28.9982","GBP",-1659.0,48107.99,48107.99,-27.48,45590.78],["C","2023-07-31","2023-07-31","C00356735","Fee","Cash-GBP","Advisory Fee 2023 07","GBP",0.0,436.0,-436.0,0.0,0.0],["C","2023-07-31","2023-07-31","C00355634","Fee","Cash-USD","Advisory Fee 2023 07","USD",0.0,5.18,-5.18,0.0,0.0],["C","2023-07-31","2023-07-31","C00355634","Fee","Cash-USD","Advisory Fee 2023 07","USD",0.0,172.27,-172.27,0.0,0.0],["C","2023-07-31","2023-07-31","C00355633","Fee","Cash-USD","Advisory Fee 2023 07","USD",0.0,246.99,-246.99,0.0,0.0],["C","2023-07-31","2023-07-31","C00347223","Fee","Cash-GBP","Advisory Fee 2023 07","GBP",0.0,734.41,-734.41,0.0,0.0],["C","2023-07-31","2023-07-31","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharge 2023 07","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2023-07-31","2023-07-31","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharge 2023 07","USD",0.0,134.91,-134.91,0.0,0.0],["D","2023-07-31","2023-07-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1923per shs","USD",0.0,42.3,42.3,0.0,42.3],["D","2023-07-31","2023-07-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1923per shs","USD",0.0,43.45,43.45,0.0,43.45],["D","2023-07-31","2023-07-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.416645per shs","USD",0.0,41.66,41.66,0.0,41.66],["D","2023-07-31","2023-07-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.2249per shs","USD",0.0,70.84,70.84,0.0,70.84],["D","2023-07-31","2023-07-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.2249per shs","USD",0.0,72.86,72.86,0.0,72.86],["D","2023-07-31","2023-07-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.1568per shs","USD",0.0,53.94,53.94,0.0,53.94],["D","2023-07-31","2023-07-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.1568per shs","USD",0.0,55.5,55.5,0.0,55.5],["D","2023-07-31","2023-07-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.078per shs","USD",0.0,32.14,32.14,0.0,32.14],["D","2023-07-31","2023-07-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.078per shs","USD",0.0,27.6,27.6,0.0,27.6],["D","2023-07-31","2023-07-31","C00356735","Dividend","AGBP","CashDiv AGBP @GBP0.0487per shs","GBP",0.0,177.91,177.91,0.0,177.91],["D","2023-07-31","2023-07-31","C00347223","Dividend","AGBP","CashDiv AGBP @GBP0.0487per shs","GBP",0.0,457.24,457.24,0.0,457.24],["T","2021-09-23","2021-09-27","C00347223","SELL","EUXS","Sold EUXS 9648shs@GBP6.556","GBP",-9648.0,63252.29,63252.29,-5.08,48993.46],["T","2020-08-13","2020-08-17","C00347223","BUY","VGOV","Bought VGOV 4341shs @GBP26.01","GBP",4341.0,112911.43,-112911.43,26.01,-112911.43],["T","2020-08-13","2020-08-17","C00347223","BUY","ERNS","Bought ERNS 1121shs @GBP100.761","GBP",1121.0,112952.93,-112952.93,100.76,-112952.93],["T","2020-08-13","2020-08-17","C00347223","BUY","IS15","Bought IS15 1054shs @GBP107.242","GBP",1054.0,113033.57,-113033.57,107.24,-113033.57],["T","2020-08-13","2020-08-17","C00347223","BUY","GSPX","Bought GSPX 28550shs @GBP5.942","GBP",28550.0,169641.92,-169641.92,5.94,-169641.92],["D","2023-08-31","2023-08-31","C00347223","Dividend","EUXS","CashDiv EUXS @GBP0.0953per shs","GBP",0.0,1139.6,1139.6,0.0,1139.6],["D","2023-08-31","2023-08-31","C00347223","Dividend","GSPX","CashDiv GSPX @GBP0.0468per shs","GBP",0.0,1690.08,1690.08,0.0,1690.08],["D","2023-08-31","2023-08-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.1717per shs","USD",0.0,59.06,59.06,0.0,59.06],["D","2023-08-31","2023-08-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0816per shs","USD",0.0,33.6,33.6,0.0,33.6],["D","2023-08-31","2023-08-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.1629per shs","USD",0.0,51.31,51.31,0.0,51.31],["D","2023-08-31","2023-08-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.441547per shs","USD",0.0,44.16,44.16,0.0,44.16],["D","2023-08-31","2023-08-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.1983per shs","USD",0.0,43.63,43.63,0.0,43.63],["D","2023-08-31","2023-08-31","C00356735","Dividend","EUXS","CashDiv EUXS @GBP0.0953per shs","GBP",0.0,1182.4,1182.4,0.0,1182.4],["D","2023-08-31","2023-08-31","C00356735","Dividend","GSPX","CashDiv GSPX @GBP0.0468per shs","GBP",0.0,1753.5,1753.5,0.0,1753.5],["D","2023-08-31","2023-08-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.1983per shs","USD",0.0,44.82,44.82,0.0,44.82],["D","2023-08-31","2023-08-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.1717per shs","USD",0.0,60.78,60.78,0.0,60.78],["D","2023-08-31","2023-08-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0816per shs","USD",0.0,28.89,28.89,0.0,28.89],["D","2023-08-31","2023-08-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.1629per shs","USD",0.0,52.79,52.79,0.0,52.79],["C","2023-08-31","2023-08-31","C00355633","Fee","Cash-USD","Advisory Fee 2023 08","USD",0.0,243.87,-243.87,0.0,0.0],["C","2023-08-31","2023-08-31","C00355634","Fee","Cash-USD","Advisory Fee 2023 08","USD",0.0,170.1,-170.1,0.0,0.0],["C","2023-08-31","2023-08-31","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharge 2023 08","USD",0.0,134.91,-134.91,0.0,0.0],["C","2023-08-31","2023-08-31","C00355634","Fee","Cash-USD","Advisory Fee 2023 08","USD",0.0,5.18,-5.18,0.0,0.0],["C","2023-08-31","2023-08-31","C00356735","Fee","Cash-GBP","Advisory Fee 2023 08","GBP",0.0,430.43,-430.43,0.0,0.0],["C","2023-08-31","2023-08-31","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharge 2023 08","GBP",0.0,649.67,-649.67,0.0,0.0],["T","2023-05-15","2023-05-17","C00347223","SELL","VGOV","Rebalance - SELL VGOV 3812shs@GBP17.191432","GBP",-3812.0,65533.74,65533.74,-23.19,88388.1],["T","2021-09-23","2021-09-27","C00347223","SELL","CSH2","Sold CSH2 87shs@GBP1034.1225","GBP",-87.0,89968.66,89968.66,-1033.16,89885.11],["C","2023-08-31","2023-08-31","C00347223","Fee","Cash-GBP","Advisory Fee 2023 08","GBP",0.0,727.75,-727.75,0.0,0.0],["T","2021-09-23","2021-09-27","C00347223","SELL","IS15","Sold IS15 1112shs@GBP106.4211","GBP",-1112.0,118340.22,118340.22,-105.4,117200.23],["T","2021-09-23","2021-09-27","C00347223","SELL","ERNS","Sold ERNS 1190shs@GBP100.7758","GBP",-1190.0,119923.19,119923.19,-100.29,119343.28],["T","2021-09-23","2021-09-27","C00347223","SELL","VGOV","Sold VGOV 4921shs@GBP24.668","GBP",-4921.0,121391.23,121391.23,-25.6,125958.45],["T","2021-02-22","2021-02-24","C00356735","BUY","GSPX","Bought GSPX 40052shs@GBP6.7845 ","GBP",40052.0,271732.27,-271732.27,6.78,-271552.56],["T","2021-09-23","2021-09-27","C00347223","BUY","GSPX","Bought GSPX 36007shs@GBP7.7558","GBP",36007.0,279262.15,-279262.15,7.76,-279263.09],["T","2021-09-23","2021-09-27","C00347223","SELL","GSPX","Sold GSPX 26101shs@GBP7.7558","GBP",-26101.0,202433.45,202433.45,-5.87,153101.39],["C","2023-09-30","2023-09-30","C00347223","Fee","Cash-GBP","Advisory Fee 2023 09","GBP",0.0,730.89,-730.89,0.0,0.0],["D","2023-09-30","2023-09-30","C00347223","Dividend","VAPX","CashDiv VAPX @USD0.212329per shs","USD",0.0,474.98,474.98,0.0,474.98],["D","2023-09-30","2023-09-30","C00347223","Dividend","IS15","CashDiv IS15 @GBP1.7744per shs","GBP",0.0,1288.23,1288.23,0.0,1288.23],["D","2023-09-30","2023-09-30","C00347223","Dividend","XGIG","CashDiv XGIG @GBP0.0402per shs","GBP",0.0,70.64,70.64,0.0,70.64],["C","2023-09-30","2023-09-30","C00355633","Fee","Cash-USD","Advisory Fee 2023 09","USD",0.0,242.49,-242.49,0.0,0.0],["D","2023-09-30","2023-09-30","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.1516per shs","USD",0.0,53.68,53.68,0.0,53.68],["D","2023-09-30","2023-09-30","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.1608per shs","USD",0.0,52.11,52.11,0.0,52.11],["D","2023-09-30","2023-09-30","C00355633","Dividend","VWO","CashDiv VWO @USD0.3275per shs","USD",0.0,316.37,316.37,0.0,316.37],["D","2023-09-30","2023-09-30","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.2095per shs","USD",0.0,47.36,47.36,0.0,47.36],["D","2023-09-30","2023-09-30","C00355633","Dividend","VPL","CashDiv VPL @USD0.2784per shs","USD",0.0,192.09,192.09,0.0,192.09],["D","2023-09-30","2023-09-30","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0793per shs","USD",0.0,28.07,28.07,0.0,28.07],["D","2023-09-30","2023-09-30","C00355633","Dividend","VTI","CashDiv VTI @USD0.7984per shs","USD",0.0,539.72,539.72,0.0,539.72],["C","2023-09-30","2023-09-30","C00355634","SR Fee","CASH-USD","Surrender Rebate Recharge 2023 09","USD",0.0,134.91,-134.91,0.0,0.0],["D","2023-09-30","2023-09-30","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.2095per shs","USD",0.0,46.1,46.1,0.0,46.1],["D","2023-09-30","2023-09-30","C00355634","Dividend","VWO","CashDiv VWO @USD0.3275per shs","USD",0.0,138.53,138.53,0.0,138.53],["D","2023-09-30","2023-09-30","C00355634","Dividend","LGLV","CashDiv LGLV @USD0.690592per shs","USD",0.0,86.32,86.32,0.0,86.32],["D","2023-09-30","2023-09-30","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.430575per shs","USD",0.0,43.04,43.04,0.0,43.04],["D","2023-09-30","2023-09-30","C00355634","Dividend","VPL","CashDiv VPL @USD0.2784per shs","USD",0.0,84.08,84.08,0.0,84.08],["D","2023-09-30","2023-09-30","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.1608per shs","USD",0.0,50.65,50.65,0.0,50.65],["D","2023-09-30","2023-09-30","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0793per shs","USD",0.0,32.69,32.69,0.0,32.69],["C","2023-09-30","2023-09-30","C00355634","Fee","Cash-USD","Advisory Fee 2023 09","USD",0.0,168.96,-168.96,0.0,0.0],["D","2023-09-30","2023-09-30","C00355634","Dividend","VYM","CashDiv VYM @USD0.784601per shs","USD",0.0,83.17,83.17,0.0,83.17],["D","2023-09-30","2023-09-30","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.1516per shs","USD",0.0,52.13,52.13,0.0,52.13],["D","2023-09-30","2023-09-30","C00355634","Dividend","VTI","CashDiv VTI @USD0.7984per shs","USD",0.0,236.33,236.33,0.0,236.33],["C","2023-09-30","2023-09-30","C00355634","Fee","Cash-USD","Advisory Fee 2023 09","USD",0.0,5.18,-5.18,0.0,0.0],["C","2023-09-30","2023-09-30","C00356735","Fee","Cash-GBP","Advisory Fee 2023 09","GBP",0.0,432.38,-432.38,0.0,0.0],["C","2023-09-30","2023-09-30","C00356735","SR Fee","CASH-GBP","Surrender Rebate Recharge 2023 09","GBP",0.0,649.67,-649.67,0.0,0.0],["D","2023-09-30","2023-09-30","C00356735","Dividend","VAPX","CashDiv VAPX @USD0.212329per shs","USD",0.0,492.81,492.81,0.0,492.81],["D","2023-09-30","2023-09-30","C00356735","Dividend","XGIG","CashDiv XGIG @GBP0.0402per shs","GBP",0.0,27.5,27.5,0.0,27.5],["D","2023-09-30","2023-09-30","C00356735","Dividend","IS15","CashDiv IS15 @GBP1.7744per shs","GBP",0.0,601.52,601.52,0.0,601.52],["D","2023-10-31","2023-10-31","C00355633","Dividend","BNDX","CashDiv BNDX @USD0.0793per shs","USD",0.0,28.07,28.07,0.0,28.07],["D","2023-10-31","2023-10-31","C00355634","Dividend","BNDX","CashDiv BNDX @USD0.0793per shs","USD",0.0,32.69,32.69,0.0,32.69],["D","2023-10-31","2023-10-31","C00355633","Dividend","SCHO","CashDiv SCHO @USD0.1626per shs","USD",0.0,57.56,57.56,0.0,57.56],["D","2023-10-31","2023-10-31","C00355634","Dividend","SCHO","CashDiv SCHO @USD0.1626per shs","USD",0.0,55.94,55.94,0.0,55.94],["D","2023-10-31","2023-10-31","C00355633","Dividend","SCHP","CashDiv SCHP @USD0.1289per shs","USD",0.0,41.76,41.76,0.0,41.76],["D","2023-10-31","2023-10-31","C00355634","Dividend","SCHP","CashDiv SCHP @USD0.1289per shs","USD",0.0,40.62,40.62,0.0,40.62],["D","2023-10-31","2023-10-31","C00355634","Dividend","SGOV","CashDiv SGOV @USD0.411757per shs","USD",0.0,41.17,41.17,0.0,41.17],["D","2023-10-31","2023-10-31","C00355633","Dividend","VCSH","CashDiv VCSH @USD0.2147per shs","USD",0.0,48.52,48.52,0.0,48.52],["D","2023-10-31","2023-10-31","C00355634","Dividend","VCSH","CashDiv VCSH @USD0.2147per shs","USD",0.0,47.24,47.24,0.0,47.24],["C","2023-10-31","2023-10-31","C00347223","Fee","Cash-GBP","Advisory Fee 2023 10","GBP",0.0,715.52,-715.52,0.0,0.0],["C","2023-10-31","2023-10-31","C00355633","Fee","Cash-USD","Advisory Fee 2023 10","USD",0.0,235.31,-235.31,0.0,0.0],["C","2023-10-31","2023-10-31","C00355634","Fee","Cash-USD","Advisory Fee 2023 10","USD",0.0,164.52,-164.52,0.0,0.0],["C","2023-10-31","2023-10-31","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2023 10","USD",0.0,134.91,-134.91,0.0,0.0],["C","2023-10-31","2023-10-31","C00355634","Fee","Cash-USD","Advisory Fee 2023 10","USD",0.0,5.17,-5.17,0.0,0.0],["C","2023-10-31","2023-10-31","C00356735","Fee","Cash-GBP","Advisory Fee 2023 10","GBP",0.0,420.58,-420.58,0.0,0.0],["C","2023-10-31","2023-10-31","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2023 10","GBP",0.0,649.67,-649.67,0.0,0.0],["D","2023-11-06","2023-11-06","C00355633","Dividend","BNDX","Cash Dividend BNDX  @USD0.08 per share","USD",0.0,29.88,29.88,0.0,0.0],["D","2023-11-06","2023-11-06","C00355634","Dividend","BNDX","Cash Dividend BNDX  @USD0.08 per share","USD",0.0,34.77,34.77,0.0,0.0],["D","2023-11-14","2023-11-14","C00356735","Dividend","EUXS","Cash Dividend EUXS  @GBP0.01 per share","GBP",0.0,88.09,88.09,0.0,0.0],["D","2023-11-14","2023-11-14","C00347223","Dividend","EUXS","Cash Dividend EUXS  @GBP0.01 per share","GBP",0.0,84.9,84.9,0.0,0.0],["D","2023-11-07","2023-11-07","C00355634","Dividend","SCHO","Cash Dividend SCHO  @USD0.17 per share","USD",0.0,56.83,56.83,0.0,0.0],["D","2023-11-07","2023-11-07","C00355633","Dividend","SCHO","Cash Dividend SCHO  @USD0.17 per share","USD",0.0,58.48,58.48,0.0,0.0],["D","2023-11-07","2023-11-07","C00355633","Dividend","SCHP","Cash Dividend SCHP  @USD0.18 per share","USD",0.0,58.97,58.97,0.0,0.0],["D","2023-11-07","2023-11-07","C00355634","Dividend","SCHP","Cash Dividend SCHP  @USD0.18 per share","USD",0.0,57.33,57.33,0.0,0.0],["D","2023-11-07","2023-11-07","C00355634","Dividend","SGOV","Cash Dividend SGOV  @USD0.43 per share","USD",0.0,42.7,42.7,0.0,0.0],["D","2023-11-06","2023-11-06","C00355633","Dividend","VCSH","Cash Dividend VCSH  @USD0.23 per share","USD",0.0,51.23,51.23,0.0,0.0],["D","2023-11-06","2023-11-06","C00355634","Dividend","VCSH","Cash Dividend VCSH  @USD0.23 per share","USD",0.0,49.87,49.87,0.0,0.0],["D","2023-11-30","2023-11-30","C00356735","Dividend","XGIG","Cash Dividend XGIG  @GBP0.05 per share","GBP",0.0,30.99,30.99,0.0,0.0],["D","2023-11-30","2023-11-30","C00347223","Dividend","XGIG","Cash Dividend XGIG  @GBP0.05 per share","GBP",0.0,79.59,79.59,0.0,0.0],["D","2023-11-06","2023-11-06","C00355633","Fee","BNDX","W/H Tax BNDX","USD",0.0,8.96,-8.96,0.0,0.0],["D","2023-11-06","2023-11-06","C00355634","Fee","BNDX","W/H Tax BNDX","USD",0.0,10.43,-10.43,0.0,0.0],["D","2023-11-14","2023-11-14","C00356735","Fee","EUXS","W/H Tax EUXS","GBP",0.0,26.43,-26.43,0.0,0.0],["D","2023-11-14","2023-11-14","C00347223","Fee","EUXS","W/H Tax EUXS","GBP",0.0,25.47,-25.47,0.0,0.0],["D","2023-11-07","2023-11-07","C00355634","Fee","SCHO","W/H Tax SCHO","USD",0.0,17.05,-17.05,0.0,0.0],["D","2023-11-07","2023-11-07","C00355633","Fee","SCHO","W/H Tax SCHO","USD",0.0,17.54,-17.54,0.0,0.0],["D","2023-11-07","2023-11-07","C00355633","Fee","SCHP","W/H Tax SCHP","USD",0.0,17.69,-17.69,0.0,0.0],["D","2023-11-07","2023-11-07","C00355634","Fee","SCHP","W/H Tax SCHP","USD",0.0,17.2,-17.2,0.0,0.0],["D","2023-11-07","2023-11-07","C00355634","Fee","SGOV","W/H Tax SGOV","USD",0.0,12.81,-12.81,0.0,0.0],["D","2023-11-06","2023-11-06","C00355633","Fee","VCSH","W/H Tax VCSH","USD",0.0,15.37,-15.37,0.0,0.0],["D","2023-11-06","2023-11-06","C00355634","Fee","VCSH","W/H Tax VCSH","USD",0.0,14.96,-14.96,0.0,0.0],["D","2023-11-30","2023-11-30","C00356735","Fee","XGIG","W/H Tax XGIG","GBP",0.0,9.3,-9.3,0.0,0.0],["D","2023-11-30","2023-11-30","C00347223","Fee","XGIG","W/H Tax XGIG","GBP",0.0,23.88,-23.88,0.0,0.0],["C","2023-11-30","2023-11-30","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2023 11","USD",0.0,134.91,-134.91,0.0,0.0],["C","2023-11-30","2023-11-30","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2023 11","GBP",0.0,649.67,-649.67,0.0,0.0],["C","2023-11-30","2023-11-30","C00347223","Fee","Cash-GBP","Advisory Fee 2023 11","GBP",0.0,743.34,-743.34,0.0,0.0],["C","2023-11-30","2023-11-30","C00355633","Fee","Cash-USD","Advisory Fee 2023 11","USD",0.0,248.22,-248.22,0.0,0.0],["C","2023-11-30","2023-11-30","C00355634","Fee","Cash-USD","Advisory Fee 2023 11","USD",0.0,173.09,-173.09,0.0,0.0],["C","2023-11-30","2023-11-30","C00355634","Fee","Cash-USD","Advisory Fee 2023 11","USD",0.0,5.17,-5.17,0.0,0.0],["C","2023-11-30","2023-11-30","C00356735","Fee","Cash-GBP","Advisory Fee 2023 11","GBP",0.0,438.48,-438.48,0.0,0.0],["C","2023-12-13","2023-12-13","C00355634","SR Fee","Cash-USD","Surrender Rebate Recharges 2023 12 01-13","USD",0.0,56.58,-56.58,0.0,0.0],["C","2023-12-13","2023-12-13","C00356735","SR Fee","Cash-GBP","Surrender Rebate Recharges 2023 12 01-13","GBP",0.0,272.44,-272.44,0.0,0.0],["D","2023-12-06","2023-12-06","C00355633","Dividend","BNDX","Cash Dividend BNDX @USD0.09 per share","USD",0.0,30.9,30.9,0.0,0.0],["D","2023-12-06","2023-12-06","C00355634","Dividend","BNDX","Cash Dividend BNDX @USD0.09 per share","USD",0.0,35.97,35.97,0.0,0.0],["D","2023-12-07","2023-12-07","C00355634","Dividend","SCHO","Cash Dividend SCHO @USD0.18 per share","USD",0.0,62.16,62.16,0.0,0.0],["D","2023-12-07","2023-12-07","C00355633","Dividend","SCHO","Cash Dividend SCHO @USD0.18 per share","USD",0.0,63.97,63.97,0.0,0.0],["D","2023-12-07","2023-12-07","C00355634","Dividend","SCHP","Cash Dividend SCHP @USD0.16 per share","USD",0.0,49.93,49.93,0.0,0.0],["D","2023-12-07","2023-12-07","C00355633","Dividend","SCHP","Cash Dividend SCHP @USD0.16 per share","USD",0.0,51.35,51.35,0.0,0.0],["D","2023-12-07","2023-12-07","C00355634","Dividend","SGOV","Cash Dividend SGOV @USD0.44 per share","USD",0.0,44.32,44.32,0.0,0.0],["D","2023-12-06","2023-12-06","C00355633","Dividend","VCSH","Cash Dividend VCSH @USD0.22 per share","USD",0.0,48.91,48.91,0.0,0.0],["D","2023-12-06","2023-12-06","C00355634","Dividend","VCSH","Cash Dividend VCSH @USD0.22 per share","USD",0.0,47.61,47.61,0.0,0.0],["C","2023-12-13","2023-12-13","C00347223","Fee","Cash-GBP","Advisory Fee 2023 12 01-13","GBP",0.0,325.72,-325.72,0.0,0.0],["C","2023-12-13","2023-12-13","C00355633","Fee","Cash-USD","Advisory Fee 2023 12 01-13","USD",0.0,110.11,-110.11,0.0,0.0],["C","2023-12-13","2023-12-13","C00355634","Fee","Cash-USD","Advisory Fee 2023 12 01-13","USD",0.0,76.66,-76.66,0.0,0.0],["C","2023-12-13","2023-12-13","C00355634","Fee","Cash-USD","Advisory Fee 2023 12 01-13","USD",0.0,2.24,-2.24,0.0,0.0],["C","2023-12-13","2023-12-13","C00356735","Fee","Cash-GBP","Advisory Fee 2023 12 01-13","GBP",0.0,192.42,-192.42,0.0,0.0],["D","2023-12-13","2023-12-13","C00355634","Dividend","BNDX","Dividend Adjustment - BNDX","USD",0.0,0.08,0.08,0.0,0.08],["D","2023-12-13","2023-12-13","C00355634","Dividend","DBEU","Dividend Adjustment - DBEU","USD",0.0,0.08,0.08,0.0,0.08],["D","2023-12-13","2023-12-13","C00355634","Dividend","LGLV","Dividend Adjustment - LGLV","USD",0.0,0.01,-0.01,0.0,0.01],["D","2023-12-13","2023-12-13","C00355634","Dividend","SCHO","Dividend Adjustment - SCHO","USD",0.0,16.09,-16.09,0.0,16.09],["D","2023-12-13","2023-12-13","C00355634","Dividend","SCHP","Dividend Adjustment - SCHP","USD",0.0,57.88,-57.88,0.0,57.88],["D","2023-12-13","2023-12-13","C00355634","Dividend","SGOV","Dividend Adjustment - SGOV","USD",0.0,1.22,-1.22,0.0,1.22],["D","2023-12-13","2023-12-13","C00355634","Dividend","SPYG","Dividend Adjustment - SPYG","USD",0.0,20.71,20.71,0.0,20.71],["D","2023-12-13","2023-12-13","C00355634","Dividend","VCSH","Dividend Adjustment - VCSH","USD",0.0,0.02,-0.02,0.0,0.02],["D","2023-12-13","2023-12-13","C00355634","Dividend","VPL","Dividend Adjustment - VPL","USD",0.0,27.23,-27.23,0.0,27.23],["D","2023-12-13","2023-12-13","C00355634","Dividend","VTI","Dividend Adjustment - VTI","USD",0.0,0.02,0.02,0.0,0.02],["D","2023-12-13","2023-12-13","C00355634","Dividend","VWO","Dividend Adjustment - VWO","USD",0.0,19.05,-19.05,0.0,19.05],["D","2023-12-13","2023-12-13","C00355634","Dividend","VYM","Dividend Adjustment - VYM","USD",0.0,79.73,-79.73,0.0,79.73],["D","2023-12-13","2023-12-13","C00355633","Dividend","BNDX","Dividend Adjustment - BNDX","USD",0.0,0.15,0.15,0.0,0.15],["D","2023-12-13","2023-12-13","C00355633","Dividend","DBEU","Dividend Adjustment - DBEU","USD",0.0,0.05,0.05,0.0,0.05],["D","2023-12-13","2023-12-13","C00355633","Dividend","EUXS","Dividend Adjustment - EUXS","GBP",0.0,0.02,0.02,0.0,0.02],["D","2023-12-13","2023-12-13","C00355633","Dividend","SCHO","Dividend Adjustment - SCHO","USD",0.0,0.13,0.13,0.0,0.13],["D","2023-12-13","2023-12-13","C00355633","Dividend","SCHP","Dividend Adjustment - SCHP","USD",0.0,0.04,0.04,0.0,0.04],["D","2023-12-13","2023-12-13","C00355633","Dividend","VAPX","Dividend Adjustment - VAPX","USD",0.0,8.98,-8.98,0.0,8.98],["D","2023-12-13","2023-12-13","C00355633","Dividend","VCSH","Dividend Adjustment - VCSH","USD",0.0,0.02,-0.02,0.0,0.02],["D","2023-12-13","2023-12-13","C00355633","Dividend","VGOV","Dividend Adjustment - VGOV","GBP",0.0,0.01,-0.01,0.0,0.01],["D","2023-12-13","2023-12-13","C00355633","Dividend","VTI","Dividend Adjustment - VTI","USD",0.0,0.01,0.01,0.0,0.01],["D","2023-12-13","2023-12-13","C00355633","Dividend","VWO","Dividend Adjustment - VWO","USD",0.0,0.01,0.01,0.0,0.01],["D","2023-12-13","2023-12-13","C00356735","Dividend","AGBP","Dividend Adjustment - AGBP","GBP",0.0,0.01,0.01,0.0,0.01],["D","2023-12-13","2023-12-13","C00356735","Dividend","ERNS","Dividend Adjustment - ERNS","GBP",0.0,0.02,0.02,0.0,0.02],["D","2023-12-13","2023-12-13","C00356735","Dividend","EUXS","Dividend Adjustment - EUXS","GBP",0.0,0.2,0.2,0.0,0.2],["D","2023-12-13","2023-12-13","C00356735","Dividend","GSPX","Dividend Adjustment - GSPX","GBP",0.0,0.02,0.02,0.0,0.02],["D","2023-12-13","2023-12-13","C00356735","Dividend","IS15","Dividend Adjustment - IS15","GBP",0.0,0.02,0.02,0.0,0.02],["D","2023-12-13","2023-12-13","C00356735","Dividend","VAPX","Dividend Adjustment - VAPX","USD",0.0,0.04,0.04,0.0,0.04],["D","2023-12-13","2023-12-13","C00356735","Dividend","VGOV","Dividend Adjustment - VGOV","GBP",0.0,0.16,0.16,0.0,0.16],["D","2023-12-13","2023-12-13","C00356735","Dividend","XGIG","Dividend Adjustment - XGIG","GBP",0.0,0.04,0.04,0.0,0.04],["D","2023-12-13","2023-12-13","C00347223","Dividend","AGBP","Dividend Adjustment - AGBP","GBP",0.0,0.01,0.01,0.0,0.01],["D","2023-12-13","2023-12-13","C00347223","Dividend","ERNS","Dividend Adjustment - ERNS","GBP",0.0,0.06,0.06,0.0,0.06],["D","2023-12-13","2023-12-13","C00347223","Dividend","EUXS","Dividend Adjustment - EUXS","GBP",0.0,0.15,0.15,0.0,0.15],["D","2023-12-13","2023-12-13","C00347223","Dividend","GSPX","Dividend Adjustment - GSPX","GBP",0.0,0.05,0.05,0.0,0.05],["D","2023-12-13","2023-12-13","C00347223","Dividend","IS15","Dividend Adjustment - IS15","GBP",0.0,0.01,-0.01,0.0,0.01],["D","2023-12-13","2023-12-13","C00347223","Dividend","VAPX","Dividend Adjustment - VAPX","USD",0.0,0.02,0.02,0.0,0.02],["D","2023-12-13","2023-12-13","C00347223","Dividend","VGOV","Dividend Adjustment - VGOV","GBP",0.0,24.18,24.18,0.0,24.18],["D","2023-12-13","2023-12-13","C00347223","Dividend","XGIG","Dividend Adjustment - XGIG","GBP",0.0,0.15,0.15,0.0,0.15],["D","2023-12-13","2023-12-13","C00355634","FEE","CASH-USD","W/H TAX REVERSAL","USD",0.0,72.45,72.45,0.0,0.0],["D","2023-12-13","2023-12-13","C00355633","FEE","CASH-USD","W/H TAX REVERSAL","USD",0.0,59.57,59.57,0.0,0.0],["D","2023-12-13","2023-12-13","C00356735","FEE","CASH-GBP","W/H TAX REVERSAL","GBP",0.0,35.72,35.72,0.0,0.0],["D","2023-12-13","2023-12-13","C00347223","FEE","CASH-GBP","W/H TAX REVERSAL","GBP",0.0,49.35,49.35,0.0,0.0]];

const TXNS = RAW_TXNS.map((r, i) => ({
  id: i,
  selector: r[0] === 'T' ? 'Trade' : r[0] === 'C' ? 'Cashflow' : r[0] === 'D' ? 'Dividend' : 'CorpAct',
  tradedate: r[1], settdate: r[2], clientId: r[3],
  txtype: r[4], ticker: r[5], description: r[6],
  ccy: r[7], qty: r[8], consideration: r[9],
  netamt: r[10], costprice: r[11], costvalue: r[12],
}));

// ─── CLIENT DATA ─────────────────────────────────────────────────────
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
    {id:2,date:"2023-11-15",type:"email",subject:"Trustee Fee Invoice",summary:"Sent invoice for annual trustee fee of £1,160.",user:"Admin"},
  ],
  C00355634:[
    {id:1,date:"2024-03-20",type:"email",subject:"New Investment Options",summary:"Sent research note on ARKK recovery. Client interested in increasing position.",user:"Sarah Johnson"},
    {id:2,date:"2024-01-05",type:"call",subject:"New Year Review",summary:"Discussed 2024 outlook. Client wants to reduce DBEU exposure.",user:"James White"},
  ],
  C00347223:[
    {id:1,date:"2024-04-01",type:"meeting",subject:"Quarterly Review",summary:"GSPX remains largest holding. Client flagged interest in increasing fixed income allocation.",user:"James White"},
    {id:2,date:"2023-07-20",type:"email",subject:"Rebalance Notification",summary:"Notified of rebalance — sold ERNS and CUKX, bought IS15 and GSPX.",user:"Sarah Johnson"},
  ],
};

const BLOOMBERG_NEWS = [
  {id:1,time:"09:32",category:"Markets",headline:"FTSE 100 rises 0.4% as energy stocks lead gains amid oil price rally",source:"Bloomberg",tag:"FTSE"},
  {id:2,time:"09:18",category:"Fixed Income",headline:"UK gilt yields fall to 3-month low following softer CPI data",source:"Bloomberg",tag:"GILTS"},
  {id:3,time:"08:55",category:"US Markets",headline:"S&P 500 futures point higher ahead of Fed minutes release",source:"Bloomberg",tag:"SPX"},
  {id:4,time:"08:41",category:"FX",headline:"Sterling climbs to 1.2650 vs dollar on strong retail sales data",source:"Bloomberg",tag:"GBP"},
  {id:5,time:"08:22",category:"Asia",headline:"Nikkei 225 closes up 1.1% as yen weakens; BOJ signals policy pause",source:"Bloomberg",tag:"NKY"},
  {id:6,time:"07:58",category:"Commodities",headline:"Gold holds above $2,300/oz as dollar softens on rate cut expectations",source:"Bloomberg",tag:"XAU"},
  {id:7,time:"07:33",category:"ETFs",headline:"GSPX: iShares S&P 500 GBP-hedged sees record inflows of £420M in May",source:"Bloomberg",tag:"GSPX"},
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

// ─── HELPERS ───────────────────────────────────────────────────────
const fmt = (n, dp=2) => n==null?"—":Math.abs(n).toLocaleString("en-GB",{minimumFractionDigits:dp,maximumFractionDigits:dp});
const fmtC = (n, ccy, selectedCcy) => {
  if (n==null) return "—";
  const sym = CCY_SYMBOLS[selectedCcy] || "$";
  const converted = convertAmount(n, ccy, selectedCcy);
  return `${sym}${fmt(converted)}`;
};
const pct = (n) => n==null?"—":`${n>=0?"+":""}${fmt(n)}%`;
const calcPL = (cost, val) => val - cost;
const calcPct = (cost, val) => cost===0?0:((val-cost)/Math.abs(cost))*100;

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

// ─── STYLED ATOMS ─────────────────────────────────────────────────
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
    secondary:{background:"transparent",color:C.navy,border:`1.5px solid ${C.navy}`},
    ghost:{background:"transparent",color:C.teal,border:`1.5px solid ${C.teal}`},
    danger:{background:C.red,color:C.white,border:"none"},
    dark:{background:C.navy,color:C.white,border:"none"},
  };
  return <button onClick={onClick} style={{...s[variant],fontFamily:"'Inter',sans-serif",fontSize:small?11:13,fontWeight:500,padding:small?"5px 11px":"8px 15px",borderRadius:6,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5}}>{children}</button>;
};

const Modal=({title,onClose,children,wide})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:C.white,borderRadius:12,padding:28,width:wide?700:520,maxWidth:"97vw",maxHeight:"90vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,color:C.navy}}>{title}</div>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:C.faint,lineHeight:1}}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const FldInput=({label,value,onChange,placeholder,type="text"})=>(
  <div style={{marginBottom:13}}>
    <label style={{fontSize:11,fontWeight:600,color:C.text,display:"block",marginBottom:4}}>{label}</label>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"8px 11px",border:`1.5px solid ${C.silverMid}`,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",outline:"none",boxSizing:"border-box",color:C.navy}}/>
  </div>
);

const FldSelect=({label,value,onChange,options})=>(
  <div style={{marginBottom:13}}>
    <label style={{fontSize:11,fontWeight:600,color:C.text,display:"block",marginBottom:4}}>{label}</label>
    <select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"8px 11px",border:`1.5px solid ${C.silverMid}`,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",outline:"none",color:C.navy,background:C.white}}>
      {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const StatCard=({label,value,sub,trend,dark})=>(
  <div style={{background:dark?C.navyMid:C.white,border:`0.5px solid ${dark?"rgba(255,255,255,0.08)":C.silver}`,borderRadius:10,padding:"15px 17px"}}>
    <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:dark?"rgba(255,255,255,0.38)":C.faint,marginBottom:5}}>{label}</div>
    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,color:dark?C.white:C.navy,letterSpacing:-0.4,lineHeight:1.2}}>{value}</div>
    {sub&&<div style={{fontSize:12,color:trend==="up"?C.green:trend==="down"?C.red:(dark?"rgba(255,255,255,0.38)":C.faint),marginTop:3}}>{sub}</div>}
  </div>
);

// ─── SORTABLE TABLE ───────────────────────────────────────────────
const SortIcon=({dir})=><span style={{fontSize:9,marginLeft:4,opacity:0.6}}>{dir==="asc"?"▲":dir==="desc"?"▼":"⇅"}</span>;

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

// ─── LOGO SVG (i-Convergence wordmark) ──────────────────────────
const Logo=({size=28})=>(
  <svg width={size*5.2} height={size} viewBox="0 0 156 30" fill="none" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="22" fontFamily="Space Grotesk, sans-serif" fontWeight="700" fontSize="20" letterSpacing="-0.5">
      <tspan fill="#00B8B0">i-</tspan><tspan fill="#FFFFFF">Convergence</tspan>
    </text>
  </svg>
);

// ─── NAVIGATION ──────────────────────────────────────────────────
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
    {key:"dashboard",label:"Dashboard",icon:"⊞"},
    {key:"clients",label:"Clients",icon:"👥"},
    {key:"alerts",label:"Alerts",icon:"🔔"},
    {key:"pricing",label:"Pricing",icon:"◈"},
    {key:"ai",label:"AI Insights",icon:"✦"},
    {key:"news",label:"News",icon:"📡"},
    {key:"connect",label:"Connect",icon:"⚡"},
    {key:"users",label:"Users",icon:"👤"},
  ];
  const handleNav=(key)=>{setSection(key);setMenuOpen(false);};
  return(
    <>
      <div style={{background:C.navy,display:"flex",alignItems:"center",padding:"0 16px",height:54,position:"sticky",top:0,zIndex:200,flexShrink:0,borderBottom:"1px solid rgba(0,184,176,0.15)"}}>
        <div style={{marginRight:isMobile?10:20,flexShrink:0}}>
          <Logo size={isMobile?19:24}/>
        </div>
        {!isMobile&&items.map(i=>(
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
            {items.map(i=>(
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
            <span style={{fontSize:19,lineHeight:1}}>☰</span>
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
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:700,color:C.navy,letterSpacing:-0.5}}>Aggregate dashboard</div>
          <div style={{fontSize:12,color:C.faint}}>Reporting in <strong style={{color:C.navy}}>{selectedCcy}</strong> · {sym}{fmt(FX[`GBPUSD`]??"1.26")} = £1.00</div>
        </div>
      </div>

      <div style={{background:C.navy,borderRadius:12,padding:"22px 26px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:18}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:5}}>Total AUM ({selectedCcy})</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:34,fontWeight:700,color:C.white,letterSpacing:-1}}>{sym}{fmt(totalAUM,0)}</div>
          <div style={{fontSize:13,color:totalPL>=0?"#34D399":"#F87171",marginTop:3}}>
            {totalPL>=0?"▲":"▼"} {sym}{fmt(Math.abs(totalPL),0)} · {pct(calcPct(totalCost,totalAUM))} overall return
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <StatCard label="Active clients" value="4" dark/>
          <StatCard label="Total transactions" value={totalTxns.toLocaleString()} dark/>
          <StatCard label="Lifetime dividends" value={`${sym}${fmt(totalDivs,0)}`} dark/>
          <StatCard label="Compliance" value="100%" sub="4/4 verified" trend="up" dark/>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
        {CLIENTS.map(c=>{
          const t=clientTotals(c.id,selectedCcy);
          return(
            <div key={c.id} onClick={()=>{setSelectedClient(c.id);setSection("clients");}} style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:10,padding:16,cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=C.teal}
              onMouseLeave={e=>e.currentTarget.style.borderColor=C.silver}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <div>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:14,fontWeight:600,color:C.navy}}>{c.name}</div>
                  <div style={{fontSize:10,color:C.faint}}>{c.code}</div>
                </div>
                <Badge color={c.verified?"success":"warning"}>{c.verified?"✓":"Pending"}</Badge>
              </div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:700,color:C.navy}}>{sym}{fmt(t.totalValue,0)}</div>
              <div style={{display:"flex",gap:10,marginTop:6}}>
                <span style={{fontSize:12,color:t.pl>=0?C.green:C.red,fontWeight:600}}>{t.pl>=0?"+":""}{sym}{fmt(Math.abs(t.pl),0)}</span>
                <span style={{fontSize:12,color:t.pctReturn>=0?C.green:C.red}}>{pct(t.pctReturn)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <div style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:10,padding:18}}>
          <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",marginBottom:14}}>AUM by client ({selectedCcy})</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={CLIENTS.map(c=>({name:c.name.split(" ")[0],val:Math.round(clientTotals(c.id,selectedCcy).totalValue/1000)}))}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.silver}/>
              <XAxis dataKey="name" tick={{fontSize:11,fill:C.faint}}/>
              <YAxis tick={{fontSize:10,fill:C.faint}}/>
              <Tooltip formatter={v=>[`${sym}${v}k`,"AUM"]}/>
              <Bar dataKey="val" fill={C.teal} radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:10,padding:18}}>
          <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Market snapshot</div>
          {MARKET_DATA.indices.map(i=>(
            <div key={i.ticker} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`0.5px solid ${C.silver}`}}>
              <span style={{fontSize:12,fontWeight:600,color:C.navy}}>{i.name}</span>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:600,color:C.navy}}>{i.value.toLocaleString()}</span>
                <span style={{fontSize:12,color:i.direction==="up"?C.green:C.red,fontWeight:600}}>{i.direction==="up"?"▲":"▼"} {Math.abs(i.pct).toFixed(2)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── GOOGLE SHEETS CONFIG ────────────────────────────────────────
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

// ─── SESSION STORAGE FOR WITHDRAWAL REQUESTS ─────────────────────
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

// ─── RISK & SUITABILITY DATA ──────────────────────────────────────
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

// ─── DEFAULT DOCS ────────────────────────────────────────────────
const DEFAULT_DOCS = {
  "C00355633":[
    {id:1,name:"KYC Verification — Lightfoot.pdf",type:"KYC",date:"2020-10-01",size:"1.2 MB",uploader:"Admin"},
    {id:2,name:"Suitability Letter 2024.pdf",type:"Suitability",date:"2024-01-10",size:"320 KB",uploader:"James White"},
    {id:3,name:"Investment Mandate — Moderate.pdf",type:"Mandate",date:"2020-10-01",size:"245 KB",uploader:"Admin"},
  ],
  "C00356735":[
    {id:1,name:"KYC — Starkie Verified.pdf",type:"KYC",date:"2021-02-15",size:"980 KB",uploader:"Admin"},
    {id:2,name:"Suitability Assessment 2024.pdf",type:"Suitability",date:"2024-02-20",size:"410 KB",uploader:"James White"},
    {id:3,name:"Risk Disclosure Statement.pdf",type:"Risk Disclosure",date:"2021-02-15",size:"190 KB",uploader:"Admin"},
  ],
  "C00355634":[
    {id:1,name:"KYC — Chris Pauls.pdf",type:"KYC",date:"2020-10-01",size:"1.1 MB",uploader:"Admin"},
    {id:2,name:"Moderate Growth Mandate.pdf",type:"Mandate",date:"2020-10-01",size:"260 KB",uploader:"Admin"},
    {id:3,name:"Authorisation Letter 2024.pdf",type:"Authorisation",date:"2024-01-05",size:"155 KB",uploader:"James White"},
  ],
  "C00347223":[
    {id:1,name:"KYC — Hash Murji.pdf",type:"KYC",date:"2020-09-01",size:"1.4 MB",uploader:"Admin"},
    {id:2,name:"Balanced Mandate Agreement.pdf",type:"Mandate",date:"2020-09-01",size:"290 KB",uploader:"Admin"},
    {id:3,name:"Suitability Review Q1 2024.pdf",type:"Suitability",date:"2024-04-01",size:"375 KB",uploader:"James White"},
    {id:4,name:"Risk Disclosure — Signed.pdf",type:"Risk Disclosure",date:"2020-09-01",size:"185 KB",uploader:"Admin"},
  ],
};

// ─── DEFAULT ALERTS ──────────────────────────────────────────────
const buildDefaultAlerts = () => [
  {id:1,clientId:"C00347223",client:"Hash Murji",type:"Concentration",severity:"warning",msg:"GSPX represents 14.3% of total portfolio — above 10% single-position threshold",triggered:"2024-06-01",status:"open"},
  {id:2,clientId:"C00347223",client:"Hash Murji",type:"Mandate",severity:"error",msg:"Equity allocation 23% below balanced mandate minimum of 20%",triggered:"2024-05-28",status:"open"},
  {id:3,clientId:"C00356735",client:"Lyndsey Starkie",type:"Cash",severity:"warning",msg:"Cash position 47.5% of portfolio — exceeds balanced mandate cash limit of 25%",triggered:"2024-06-01",status:"open"},
  {id:4,clientId:"C00355634",client:"Chris Pauls",type:"Performance",severity:"info",msg:"DBEU down 15.3% from cost — consider reviewing European hedged position",triggered:"2024-05-20",status:"open"},
  {id:5,clientId:"C00355633",client:"Michael Lightfoot",type:"Review",severity:"info",msg:"Annual suitability review due — last reviewed 10 Jan 2024",triggered:"2024-06-01",status:"open"},
];

// ─── CLIENT DETAIL ─────────────────────────────────────────────────
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
    const row=[reqId,dateStr,clientId,client.name,wdType,parseFloat(wdAmount).toFixed(2),wdCcy,wdNotes||"—","JW","Pending"];
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
  const typeIcon={KYC:"🪪","Suitability":"✅","Mandate":"📋","Risk Disclosure":"⚠️","Authorisation":"✍️"};

  return(
    <div style={{padding:isMobile?"12px 10px":24}}>
      {/* ── HEADER ── */}
      <button onClick={onBack} style={{background:"none",border:"none",color:C.teal,fontSize:13,cursor:"pointer",marginBottom:14,padding:0,display:"flex",alignItems:"center",gap:4}}>← All clients</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:isMobile?14:20,flexWrap:"wrap",gap:14}}>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:50,height:50,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:17,fontWeight:700,flexShrink:0}}>{initials}</div>
          <div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,color:C.navy}}>{client.name}</div>
            <div style={{fontSize:12,color:C.faint,marginTop:2}}>{client.code} · {client.email}</div>
            <div style={{marginTop:5,display:"flex",gap:5,flexWrap:"wrap"}}><Badge color="success">Verified</Badge><Badge color="navy">{client.jurisdiction}</Badge></div>
          </div>
        </div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          <Btn onClick={()=>setShowEmail(true)} variant="ghost" small={isMobile}>✉ Email</Btn>
          <Btn onClick={()=>setShowLog(true)} variant="secondary" small={isMobile}>+ Log</Btn>
          <Btn onClick={()=>setShowWD(true)} variant="dark" small={isMobile}>↓ Withdrawal</Btn>
          {setPreviewClientId&&<Btn onClick={()=>setPreviewClientId(clientId)} variant="secondary" small={isMobile}>👁 Client view</Btn>}
          <Btn onClick={()=>setShowDocs(true)} variant="secondary" small={isMobile}>📁 Docs</Btn>
        </div>
      </div>

      {/* ── SUMMARY STATS ── */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMobile?8:10,marginBottom:isMobile?14:18}}>
        <div style={{background:C.navy,border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"15px 17px"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:5}}>Inception value</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,color:C.white,letterSpacing:-0.4}}>{sym}{fmt(totals.totalCost,0)}</div>
        </div>
        <div style={{background:C.navy,border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"15px 17px"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:5}}>Current value</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,color:C.white,letterSpacing:-0.4}}>{sym}{fmt(totals.totalValue,0)}</div>
        </div>
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"15px 17px"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.faint,marginBottom:5}}>Unrealised P&L</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,color:totals.pl>=0?C.green:C.red,letterSpacing:-0.4}}>{totals.pl>=0?"+":"-"}{sym}{fmt(Math.abs(totals.pl),0)}</div>
          <div style={{fontSize:12,color:totals.pctReturn>=0?C.green:C.red,marginTop:3}}>{pct(totals.pctReturn)}</div>
        </div>
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"15px 17px"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.faint,marginBottom:5}}>Risk profile</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:21,fontWeight:600,color:RISK_COLOURS[score]||C.teal,letterSpacing:-0.4}}>{score}/10</div>
          <div style={{fontSize:12,color:C.faint,marginTop:3}}>{RISK_LABELS[score]}</div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{display:"flex",gap:0,borderBottom:"1px solid "+C.silver,marginBottom:18,overflowX:"auto"}}>
        {[["valuation","Valuation"],["transactions","Transactions"],["risk","Risk & Rebalance"],["crm","CRM"]].map(([t,label])=>(
          <button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",borderBottom:tab===t?"2px solid "+C.teal:"2px solid transparent",color:tab===t?C.teal:C.faint,fontSize:13,fontWeight:tab===t?600:400,cursor:"pointer",padding:"9px 16px",marginBottom:-1,whiteSpace:"nowrap",fontFamily:"'Inter',sans-serif"}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── VALUATION TAB ── */}
      {tab==="valuation"&&(
        <div>
          <div style={{background:C.navy,borderRadius:10,padding:"18px 22px",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:3}}>Portfolio value · {selectedCcy}</div>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={chartData}>
                <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.teal} stopOpacity={0.3}/><stop offset="95%" stopColor={C.teal} stopOpacity={0}/></linearGradient></defs>
                <XAxis dataKey="date" tick={{fontSize:10,fill:"rgba(255,255,255,0.35)"}}/>
                <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,0.35)"}} tickFormatter={v=>sym+Math.round(v/1000)+"k"}/>
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
                      <tr key={i} style={{borderBottom:"0.5px solid "+C.silver,background:i%2===0?C.white:"#FAFBFC"}}>
                        <td style={{padding:"9px 13px",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,color:C.navy}}>{h.ticker}</td>
                        <td style={{padding:"9px 13px",color:C.text,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</td>
                        <td style={{padding:"9px 13px"}}><Badge color={h.ccy==="GBP"?"navy":"info"}>{h.ccy}</Badge></td>
                        <td style={{padding:"9px 13px",textAlign:"right",color:C.text}}>{h.isCash?"—":fmt(h.qty,0)}</td>
                        <td style={{padding:"9px 13px",textAlign:"right",color:C.text}}>{sym}{fmt(cc)}</td>
                        <td style={{padding:"9px 13px",textAlign:"right",fontWeight:600,color:C.navy}}>{sym}{fmt(cv)}</td>
                        <td style={{padding:"9px 13px",textAlign:"right",color:pl>=0?C.green:C.red,fontWeight:600}}>{h.isCash?"—":(pl>=0?"+":"-")+sym+fmt(Math.abs(pl))}</td>
                        <td style={{padding:"9px 13px",textAlign:"right",color:ret>=0?C.green:C.red}}>{h.isCash?"—":pct(ret)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr style={{background:C.navy}}>
                  <td colSpan={4} style={{padding:"9px 13px",color:C.white,fontWeight:600}}>Total</td>
                  <td style={{padding:"9px 13px",textAlign:"right",color:"rgba(255,255,255,0.5)"}}>{sym}{fmt(totals.totalCost,0)}</td>
                  <td style={{padding:"9px 13px",textAlign:"right",color:C.white,fontWeight:700,fontFamily:"'Space Grotesk',sans-serif"}}>{sym}{fmt(totals.totalValue,0)}</td>
                  <td style={{padding:"9px 13px",textAlign:"right",color:totals.pl>=0?"#34D399":"#F87171",fontWeight:600}}>{totals.pl>=0?"+":"-"}{sym}{fmt(Math.abs(totals.pl),0)}</td>
                  <td style={{padding:"9px 13px",textAlign:"right",color:totals.pctReturn>=0?"#34D399":"#F87171",fontWeight:600}}>{pct(totals.pctReturn)}</td>
                </tr></tfoot>
              </table>
            </div>
          </div>

          {/* ── PENDING WITHDRAWALS on valuation tab ── */}
          {wdRequests.length>0&&(
            <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,overflow:"hidden",marginTop:14}}>
              <div style={{padding:"12px 16px",borderBottom:"0.5px solid "+C.silver,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFBFC"}}>
                <div style={{fontSize:13,fontWeight:600,color:C.navy}}>Withdrawal requests</div>
                <Badge color={wdRequests.filter(r=>r.status==="Pending").length>0?"warning":"success"}>{wdRequests.filter(r=>r.status==="Pending").length} pending</Badge>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:C.silver}}>{["ID","Date","Type","Amount","CCY","Status"].map(h=><th key={h} style={{padding:"7px 13px",textAlign:"left",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                <tbody>
                  {wdRequests.map((r,i)=>(
                    <tr key={r.id} style={{borderBottom:"0.5px solid "+C.silver,background:i%2===0?C.white:"#FAFBFC"}}>
                      <td style={{padding:"8px 13px",fontFamily:"monospace",fontSize:10,color:C.faint}}>{r.id}</td>
                      <td style={{padding:"8px 13px",color:C.text}}>{r.date}</td>
                      <td style={{padding:"8px 13px",fontWeight:600,color:C.navy}}>{r.type}</td>
                      <td style={{padding:"8px 13px",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,color:C.navy,textAlign:"right"}}>{r.ccy==="GBP"?"£":"$"}{fmt(r.amount)}</td>
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

      {/* ── TRANSACTIONS TAB ── */}
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
                      <tr key={i} style={{borderBottom:"0.5px solid "+C.silver,background:i%2===0?C.white:"#FAFBFC"}}>
                        <td style={{padding:"6px 11px",color:C.text,whiteSpace:"nowrap"}}>{t.tradedate}</td>
                        <td style={{padding:"6px 11px"}}><Badge color={tc}>{t.txtype}</Badge></td>
                        <td style={{padding:"6px 11px",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,color:C.navy}}>{t.ticker}</td>
                        <td style={{padding:"6px 11px",color:C.text,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td>
                        <td style={{padding:"6px 11px"}}><Badge color={t.ccy==="GBP"?"navy":"info"}>{t.ccy}</Badge></td>
                        <td style={{padding:"6px 11px",textAlign:"right",color:C.text}}>{t.qty!==0?fmt(Math.abs(t.qty),0):"—"}</td>
                        <td style={{padding:"6px 11px",textAlign:"right",fontWeight:600,color:C.navy}}>{fmt(t.consideration)}</td>
                        <td style={{padding:"6px 11px",textAlign:"right",color:t.netamt>=0?C.green:C.red}}>{fmt(t.netamt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {txSorted.length>300&&<div style={{padding:"8px 14px",fontSize:11,color:C.faint,borderTop:"0.5px solid "+C.silver}}>Showing 300 of {txSorted.length} rows — use filters to narrow</div>}
          </div>
        </div>
      )}

      {/* ── RISK & REBALANCE TAB ── */}
      {tab==="risk"&&(
        <div>
          {/* Risk profile card */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14,marginBottom:14}}>
            <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase"}}>Risk profile</div>
                <Btn small variant="ghost" onClick={()=>setEditingRisk(true)}>Edit</Btn>
              </div>
              <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:14}}>
                <div style={{width:52,height:52,borderRadius:"50%",background:RISK_COLOURS[score]||C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:700,flexShrink:0}}>{score}</div>
                <div>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:600,color:C.navy}}>{RISK_LABELS[score]}</div>
                  <div style={{fontSize:11,color:C.faint,marginTop:2}}>Equity {RISK_MANDATES[score].equity[0]}-{RISK_MANDATES[score].equity[1]}% · FI {RISK_MANDATES[score].fi[0]}-{RISK_MANDATES[score].fi[1]}%</div>
                  <div style={{fontSize:11,color:C.faint}}>Reviewed: {(profile&&profile.reviewed)||"Never"}</div>
                </div>
              </div>
              <div style={{fontSize:12,color:C.text,lineHeight:1.6,fontStyle:"italic"}}>{(profile&&profile.notes)||"No suitability notes."}</div>
              {/* Compliance flags */}
              <div style={{marginTop:14,paddingTop:14,borderTop:"0.5px solid "+C.silver}}>
                <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Compliance flags</div>
                {comp&&comp.flags&&comp.flags.length===0&&<div style={{color:C.green,fontSize:13,fontWeight:500}}>&#10003; No breaches detected</div>}
                {comp&&comp.flags&&comp.flags.length>0&&comp.flags.map((f,fi)=>(
                  <div key={fi} style={{display:"flex",gap:8,marginBottom:6,padding:"7px 10px",background:f.type==="error"?C.redBg:C.amberBg,borderRadius:6}}>
                    <span>{f.type==="error"?"🔴":"🟡"}</span>
                    <span style={{fontSize:12,color:C.text,lineHeight:1.5}}>{f.msg}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Allocation bars */}
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

              {/* Rebalance trades */}
              {comp&&(()=>{
                const total=holdings.reduce((s,h)=>s+convertAmount(h.value,h.ccy,selectedCcy),0);
                const trades=["Equity","Fixed Income","Cash","Commodity"].map(ac=>{
                  const cur=(comp.byClass[ac]||0);
                  const m=RISK_MANDATES[score][ac==="Equity"?"equity":ac==="Fixed Income"?"fi":ac==="Cash"?"cash":"commodity"];
                  const tgt=total*(m[0]+m[1])/2/100;
                  return {ac,diff:tgt-cur};
                }).filter(t=>Math.abs(t.diff)>500);
                if(trades.length===0) return <div style={{marginTop:14,color:C.green,fontSize:13,fontWeight:500}}>&#10003; Portfolio within mandate — no rebalance needed</div>;
                return(
                  <div style={{marginTop:14,paddingTop:14,borderTop:"0.5px solid "+C.silver}}>
                    <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Suggested trades</div>
                    {trades.map((t,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:t.diff>=0?C.greenBg:C.redBg,borderRadius:6,marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:600,color:C.navy}}>{t.ac}</span>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <Badge color={t.diff>=0?"success":"error"}>{t.diff>=0?"BUY":"SELL"}</Badge>
                          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:13,color:t.diff>=0?C.green:C.red}}>{sym}{fmt(Math.abs(t.diff),0)}</span>
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

      {/* ── CRM TAB ── */}
      {tab==="crm"&&(
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 2fr",gap:14}}>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:18}}>
            <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Client profile</div>
            {[["Full name",client.name],["Email",client.email],["Phone",client.phone||"—"],["Address",client.address],["Jurisdiction",client.jurisdiction],["Client since",client.joined],["Status","Verified"]].map(([l,v])=>(
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
                <Btn small onClick={()=>setShowEmail(true)} variant="ghost">✉ Email</Btn>
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

      {/* ── MODALS ── */}
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
          <div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:14,fontWeight:600,color:C.white}}>{client.name}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.45)"}}>{client.id}</div></div>
        </div>
        <FldSelect label="Withdrawal type" value={wdType} onChange={setWdType} options={[
          {value:"PCLS",label:"PCLS — Pension Commencement Lump Sum"},
          {value:"Regular Withdrawal",label:"Regular withdrawal"},
          {value:"Drawdown",label:"Drawdown"},
          {value:"Flexi-Access Drawdown",label:"Flexi-access drawdown"},
          {value:"UFPLS",label:"UFPLS — Uncrystallised Fund Pension Lump Sum"},
          {value:"Full Surrender",label:"Full surrender"},
          {value:"Partial Surrender",label:"Partial surrender"},
          {value:"Ad Hoc",label:"Ad hoc withdrawal"},
        ]}/>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
          <FldInput label="Amount" value={wdAmount} onChange={setWdAmount} placeholder="5000.00" type="number"/>
          <FldSelect label="CCY" value={wdCcy} onChange={setWdCcy} options={[{value:"GBP",label:"GBP £"},{value:"USD",label:"USD $"},{value:"EUR",label:"EUR €"},{value:"CNY",label:"CNY ¥"}]}/>
        </div>
        <div style={{marginBottom:14}}><label style={{fontSize:11,fontWeight:600,color:C.text,display:"block",marginBottom:4}}>Notes (optional)</label><textarea value={wdNotes} onChange={e=>setWdNotes(e.target.value)} rows={3} placeholder="e.g. Transfer to Barclays account ending 4821" style={{width:"100%",padding:"8px 11px",border:"1.5px solid "+C.silverMid,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",resize:"vertical",boxSizing:"border-box"}}/></div>
        <div style={{background:C.silver,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:C.text,lineHeight:1.7}}>Request will be logged with status <strong>Pending</strong> and written to the Google Sheets back-office log.</div>
        {wdError&&<div style={{background:C.amberBg,border:"1px solid "+C.gold,borderRadius:6,padding:"10px 12px",fontSize:12,color:C.amber,marginBottom:12}}>{wdError}</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>{setShowWD(false);setWdError("");}}>Cancel</Btn><Btn onClick={submitWithdrawal} variant="dark">{wdSubmitting?"Submitting...":"Submit request"}</Btn></div>
      </Modal>}

      {showDocs&&<Modal title={"Documents — "+client.name} onClose={()=>setShowDocs(false)}>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
          {clientDocs.map(doc=>(
            <div key={doc.id} style={{display:"flex",gap:12,alignItems:"center",padding:"10px 14px",background:C.silver,borderRadius:8}}>
              <span style={{fontSize:22,flexShrink:0}}>{typeIcon[doc.type]||"📄"}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:C.navy}}>{doc.name}</div>
                <div style={{display:"flex",gap:6,marginTop:4}}><Badge color={typeColour[doc.type]||"info"}>{doc.type}</Badge></div>
                <div style={{fontSize:11,color:C.faint,marginTop:3}}>{doc.date} · {doc.size} · {doc.uploader}</div>
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
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:14,fontWeight:600,color:C.navy,marginBottom:14}}>{client.name}</div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:11,fontWeight:600,color:C.text,display:"block",marginBottom:6}}>Risk score: <strong>{editScore} — {RISK_LABELS[editScore]}</strong></label>
          <input type="range" min={1} max={10} value={editScore} onChange={e=>setEditScore(+e.target.value)} style={{width:"100%"}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.faint,marginTop:4}}><span>1 Very Cautious</span><span>5 Moderate</span><span>10 Speculative</span></div>
        </div>
        <div style={{background:C.silver,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.text,marginBottom:14}}>
          Mandate: Equity {RISK_MANDATES[editScore].equity[0]}-{RISK_MANDATES[editScore].equity[1]}% · Fixed Income {RISK_MANDATES[editScore].fi[0]}-{RISK_MANDATES[editScore].fi[1]}% · Cash max {RISK_MANDATES[editScore].cash[1]}%
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
  const addClient=()=>{const id=`C00${Date.now().toString().slice(-6)}`;setClients([...clients,{...newC,id,code:`${id.slice(1)}-${newC.name.split(" ")[1]||"New"}`,verified:false,phone:"",joined:new Date().toISOString().slice(0,10)}]);setShowAdd(false);setNewC({name:"",email:"",address:"",jurisdiction:"US"});};
  return(
    <div style={{padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div><div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>CRM</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>Clients</div></div>
        <div style={{display:"flex",gap:7}}><Btn variant="secondary">↑ Upload CSV</Btn><Btn onClick={()=>setShowAdd(true)}>+ Add client</Btn></div>
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, email or ID..." style={{width:"100%",padding:"9px 13px",border:`1.5px solid ${C.silver}`,borderRadius:7,fontSize:13,fontFamily:"'Inter',sans-serif",marginBottom:14,boxSizing:"border-box",outline:"none"}}/>
      <div style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:10,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:C.silver}}>{["Client","ID","Email","Jurisdiction","Verified","Portfolio","P&L",""].map(h=><th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map((c,i)=>{const t=clientTotals(c.id,selectedCcy);return(
              <tr key={c.id} style={{borderBottom:`0.5px solid ${C.silver}`,background:i%2===0?C.white:"#FAFBFC",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=C.tealLight} onMouseLeave={e=>e.currentTarget.style.background=i%2===0?C.white:"#FAFBFC"}>
                <td style={{padding:"11px 14px"}}><div style={{display:"flex",gap:9,alignItems:"center"}}><div style={{width:33,height:33,borderRadius:"50%",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:12,fontWeight:700,flexShrink:0}}>{c.name.split(" ").map(n=>n[0]).join("")}</div><div><div style={{fontSize:13,fontWeight:600,color:C.navy}}>{c.name}</div><div style={{fontSize:11,color:C.faint}}>{c.address}</div></div></div></td>
                <td style={{padding:"11px 14px",fontFamily:"monospace",fontSize:11,color:C.faint}}>{c.id}</td>
                <td style={{padding:"11px 14px",fontSize:12,color:C.text}}>{c.email}</td>
                <td style={{padding:"11px 14px"}}><Badge color="navy">{c.jurisdiction}</Badge></td>
                <td style={{padding:"11px 14px"}}><Badge color={c.verified?"success":"warning"}>{c.verified?"Yes":"No"}</Badge></td>
                <td style={{padding:"11px 14px",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,color:C.navy}}>{sym}{fmt(t.totalValue,0)}</td>
                <td style={{padding:"11px 14px",fontWeight:600,color:t.pl>=0?C.green:C.red}}>{t.pl>=0?"+":"-"}{sym}{fmt(Math.abs(t.pl),0)}</td>
                <td style={{padding:"11px 14px"}}><Btn small variant="ghost" onClick={()=>setSelectedClient(c.id)}>View →</Btn></td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
      {showAdd&&<Modal title="Add client" onClose={()=>setShowAdd(false)}><FldInput label="Full name" value={newC.name} onChange={v=>setNewC({...newC,name:v})} placeholder="Jane Smith"/><FldInput label="Email" value={newC.email} onChange={v=>setNewC({...newC,email:v})} placeholder="jane@example.com"/><FldInput label="Address" value={newC.address} onChange={v=>setNewC({...newC,address:v})} placeholder="1 Main Street"/><FldSelect label="Jurisdiction" value={newC.jurisdiction} onChange={v=>setNewC({...newC,jurisdiction:v})} options={[{value:"US",label:"United States"},{value:"UK",label:"United Kingdom"},{value:"EU",label:"European Union"},{value:"Other",label:"Other"}]}/><div style={{display:"flex",gap:7,justifyContent:"flex-end",marginTop:6}}><Btn variant="secondary" onClick={()=>setShowAdd(false)}>Cancel</Btn><Btn onClick={addClient}>Add client</Btn></div></Modal>}
    </div>
  );
};

// ─── TRANSACTIONS (ALL 1283) ───────────────────────────────────────
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
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>All transactions</div>
          <div style={{fontSize:12,color:C.faint,marginTop:2}}>{allTxns.length.toLocaleString()} records · Trades, Dividends, Cashflows, FX, Fees, Deposits, Withdrawals</div>
        </div>
        <div style={{display:"flex",gap:7}}><Btn variant="secondary">↑ Upload CSV</Btn><Btn onClick={()=>setShowAdd(true)}>+ Add transaction</Btn></div>
      </div>

      <div style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:10,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:`0.5px solid ${C.silver}`,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",background:"#FAFBFC"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search descriptions, tickers, refs..." style={{flex:1,minWidth:200,padding:"6px 10px",border:`1.5px solid ${C.silver}`,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
          <select onChange={e=>setFilter("clientId",e.target.value)} style={{padding:"6px 9px",border:`1.5px solid ${C.silver}`,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none",color:C.navy,background:C.white}}>
            <option value="all">All clients</option>
            {CLIENTS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select onChange={e=>setFilter("selector",e.target.value)} style={{padding:"6px 9px",border:`1.5px solid ${C.silver}`,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none",color:C.navy,background:C.white}}>
            <option value="all">All categories</option>
            {selectors.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <select onChange={e=>setFilter("txtype",e.target.value)} style={{padding:"6px 9px",border:`1.5px solid ${C.silver}`,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none",color:C.navy,background:C.white}}>
            <option value="all">All types</option>
            {txTypes.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <select onChange={e=>setFilter("ccy",e.target.value)} style={{padding:"6px 9px",border:`1.5px solid ${C.silver}`,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none",color:C.navy,background:C.white}}>
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
                  <tr key={t.id||i} style={{borderBottom:`0.5px solid ${C.silver}`,background:i%2===0?C.white:"#FAFBFC"}}>
                    <td style={{padding:"6px 10px",color:C.text,whiteSpace:"nowrap"}}>{t.tradedate}</td>
                    <td style={{padding:"6px 10px",color:C.faint,whiteSpace:"nowrap"}}>{t.settdate}</td>
                    <td style={{padding:"6px 10px",fontSize:11,fontWeight:500,color:C.navy,whiteSpace:"nowrap"}}>{clientName}</td>
                    <td style={{padding:"6px 10px"}}><Badge color="navy">{t.selector}</Badge></td>
                    <td style={{padding:"6px 10px"}}><Badge color={typeColor}>{t.txtype}</Badge></td>
                    <td style={{padding:"6px 10px",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,color:C.navy,whiteSpace:"nowrap"}}>{t.ticker}</td>
                    <td style={{padding:"6px 10px",color:C.text,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</td>
                    <td style={{padding:"6px 10px"}}><Badge color={t.ccy==="GBP"?"navy":"info"}>{t.ccy}</Badge></td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.text}}>{t.qty!==0?fmt(Math.abs(t.qty),4):"—"}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600,color:C.navy}}>{fmt(t.consideration)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:t.netamt>=0?C.green:C.red,fontWeight:500}}>{fmt(t.netamt)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.faint}}>{t.costprice!==0?fmt(t.costprice,4):"—"}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.faint}}>{t.costvalue!==0?fmt(t.costvalue):"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {result.length>600&&<div style={{padding:"9px 14px",fontSize:11,color:C.faint,borderTop:`0.5px solid ${C.silver}`,background:"#FAFBFC"}}>Showing 600 of {result.length} matching rows. Use filters or search to narrow results.</div>}
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

// ─── PRICING ───────────────────────────────────────────────────────
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
        <div><div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>Market data</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>Price file</div></div>
        <div style={{display:"flex",gap:7}}><Btn variant="secondary">↑ Upload CSV</Btn><Btn onClick={()=>setShowAdd(true)}>+ Add price</Btn></div>
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ticker or name..." style={{width:"100%",padding:"9px 13px",border:`1.5px solid ${C.silver}`,borderRadius:7,fontSize:13,fontFamily:"'Inter',sans-serif",marginBottom:14,boxSizing:"border-box",outline:"none"}}/>
      <div style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:10,overflow:"hidden"}}>
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
              <tr key={i} style={{borderBottom:`0.5px solid ${C.silver}`,background:i%2===0?C.white:"#FAFBFC"}}>
                <td style={{padding:"9px 14px",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,color:C.navy}}>{p.ticker}</td>
                <td style={{padding:"9px 14px",color:C.text}}>{p.name}</td>
                <td style={{padding:"9px 14px"}}><Badge color={p.ccy==="GBP"?"navy":p.type==="FX"?"gold":"info"}>{p.ccy}</Badge></td>
                <td style={{padding:"9px 14px"}}><Badge color="info">{p.type}</Badge></td>
                <td style={{padding:"9px 14px",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,color:C.navy,textAlign:"right"}}>
                  {p.type==="FX"?`${fmt(p.price,5)}`:`${p.ccy==="GBP"?"£":"$"}${fmt(p.price)}`}
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

// ─── VALUATIONS ────────────────────────────────────────────────────
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
      <div style={{marginBottom:18}}><div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>Calculated</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>Valuations <span style={{fontSize:14,fontWeight:400,color:C.faint}}>in {selectedCcy}</span></div></div>
      <div style={{background:C.navy,borderRadius:10,padding:"18px 22px",marginBottom:14,display:"flex",gap:32,alignItems:"center",flexWrap:"wrap"}}>
        <div><div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:4}}>Total AUM</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:30,fontWeight:700,color:C.white}}>{sym}{fmt(totalAUM,0)}</div></div>
        <div style={{height:40,width:1,background:"rgba(255,255,255,0.1)"}}/>
        <div><div style={{fontSize:10,color:"rgba(255,255,255,0.38)",marginBottom:2}}>Cost basis</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,color:"rgba(255,255,255,0.7)"}}>{sym}{fmt(totalCost,0)}</div></div>
        <div><div style={{fontSize:10,color:"rgba(255,255,255,0.38)",marginBottom:2}}>Total P&L</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,color:totalPL>=0?"#34D399":"#F87171"}}>{totalPL>=0?"+":"-"}{sym}{fmt(Math.abs(totalPL),0)}</div></div>
        <div><div style={{fontSize:10,color:"rgba(255,255,255,0.38)",marginBottom:2}}>Return</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,color:totalPL>=0?"#34D399":"#F87171"}}>{pct(calcPct(totalCost,totalAUM))}</div></div>
      </div>
      <div style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:10,overflow:"hidden",marginBottom:16}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:C.navy}}>{["Client","Equity Value","Cash Value","Total Value","Cost Basis","P&L","Return","Positions",""].map(h=><th key={h} style={{padding:"9px 13px",textAlign:"left",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={r.id} style={{borderBottom:`0.5px solid ${C.silver}`,background:i%2===0?C.white:"#FAFBFC"}}>
                <td style={{padding:"11px 13px"}}><div style={{fontSize:13,fontWeight:600,color:C.navy}}>{r.name}</div><div style={{fontSize:10,color:C.faint}}>{r.id}</div></td>
                <td style={{padding:"11px 13px",textAlign:"right",color:C.text}}>{sym}{fmt(r.equityVal,0)}</td>
                <td style={{padding:"11px 13px",textAlign:"right",color:C.faint}}>{sym}{fmt(r.cashVal,0)}</td>
                <td style={{padding:"11px 13px",textAlign:"right",fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,color:C.navy,fontSize:14}}>{sym}{fmt(r.totalValue,0)}</td>
                <td style={{padding:"11px 13px",textAlign:"right",color:C.text}}>{sym}{fmt(r.totalCost,0)}</td>
                <td style={{padding:"11px 13px",textAlign:"right",fontWeight:600,color:r.pl>=0?C.green:C.red}}>{r.pl>=0?"+":"-"}{sym}{fmt(Math.abs(r.pl),0)}</td>
                <td style={{padding:"11px 13px",textAlign:"right",fontWeight:600,color:r.pctReturn>=0?C.green:C.red}}>{pct(r.pctReturn)}</td>
                <td style={{padding:"11px 13px",textAlign:"right",color:C.text}}>{r.positions}</td>
                <td style={{padding:"11px 13px"}}><Btn small variant="ghost" onClick={()=>{setSelectedClient(r.id);setSection("clients");}}>Detail →</Btn></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr style={{background:C.navy}}>
            <td style={{padding:"10px 13px",color:C.white,fontWeight:600}}>Total</td>
            <td style={{padding:"10px 13px",textAlign:"right",color:"rgba(255,255,255,0.5)"}}>{sym}{fmt(rows.reduce((s,r)=>s+r.equityVal,0),0)}</td>
            <td style={{padding:"10px 13px",textAlign:"right",color:"rgba(255,255,255,0.38)"}}>{sym}{fmt(rows.reduce((s,r)=>s+r.cashVal,0),0)}</td>
            <td style={{padding:"10px 13px",textAlign:"right",color:C.white,fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:15}}>{sym}{fmt(totalAUM,0)}</td>
            <td style={{padding:"10px 13px",textAlign:"right",color:"rgba(255,255,255,0.5)"}}>{sym}{fmt(totalCost,0)}</td>
            <td style={{padding:"10px 13px",textAlign:"right",color:totalPL>=0?"#34D399":"#F87171",fontWeight:700}}>{totalPL>=0?"+":"-"}{sym}{fmt(Math.abs(totalPL),0)}</td>
            <td style={{padding:"10px 13px",textAlign:"right",color:totalPL>=0?"#34D399":"#F87171",fontWeight:600}}>{pct(calcPct(totalCost,totalAUM))}</td>
            <td colSpan={2}/>
          </tr></tfoot>
        </table>
      </div>
      <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Top positions (all clients)</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:9}}>
        {Object.entries(HOLDINGS).flatMap(([cid,hs])=>hs.filter(h=>!h.isCash).map(h=>({...h,client:(CLIENTS.find(c=>c.id===cid)||{name:cid}).name.split(" ")[0],convVal:convertAmount(h.value,h.ccy,selectedCcy)}))).sort((a,b)=>b.convVal-a.convVal).slice(0,8).map((h,i)=>(
          <div key={i} style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:8,padding:"13px 15px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,color:C.navy,fontSize:14}}>{h.ticker}</span><Badge color={h.ccy==="GBP"?"navy":"info"}>{h.ccy}</Badge></div>
            <div style={{fontSize:11,color:C.faint,marginBottom:7,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:600,color:C.navy}}>{sym}{fmt(h.convVal,0)}</div>
            <div style={{fontSize:11,color:C.faint,marginTop:1}}>{h.client}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── NEWS (Bloomberg feed) ─────────────────────────────────────────
const News=()=>{
  const [ticker,setTicker]=useState("all");
  const allTickers=["all","FTSE","SPX","GBP","EMIM","GSPX","GILTS","XAU","NKY"];
  const filtered=ticker==="all"?BLOOMBERG_NEWS:BLOOMBERG_NEWS.filter(n=>n.tag===ticker||n.category.includes(ticker));

  return(
    <div style={{padding:24}}>
      <div style={{marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:C.teal,animation:"pulse 2s infinite"}}/>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase"}}>Bloomberg · Live feed</div>
        </div>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>Market news & intelligence</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16,marginBottom:16}}>
        <div>
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {allTickers.map(t=>(
              <button key={t} onClick={()=>setTicker(t)} style={{background:ticker===t?C.navy:C.white,color:ticker===t?C.white:C.text,border:`0.5px solid ${ticker===t?C.navy:C.silver}`,borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:ticker===t?600:400,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
                {t==="all"?"All":t}
              </button>
            ))}
          </div>
          <div style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"10px 16px",borderBottom:`0.5px solid ${C.silver}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFBFC"}}>
              <div style={{fontSize:12,fontWeight:600,color:C.navy}}>Headlines</div>
              <div style={{fontSize:11,color:C.faint}}>Updated {new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</div>
            </div>
            {filtered.map(n=>(
              <div key={n.id} style={{padding:"14px 16px",borderBottom:`0.5px solid ${C.silver}`,display:"flex",gap:14,alignItems:"flex-start"}}>
                <div style={{fontSize:11,color:C.faint,whiteSpace:"nowrap",minWidth:38}}>{n.time}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:7,marginBottom:5}}><Badge color="navy">{n.category}</Badge><Badge color="info">{n.tag}</Badge></div>
                  <div style={{fontSize:13,fontWeight:500,color:C.navy,lineHeight:1.5}}>{n.headline}</div>
                  <div style={{fontSize:11,color:C.faint,marginTop:3}}>{n.source}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{marginTop:14}}>
            <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Key market trends</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {MARKET_DATA.trends.map((t,i)=>(
                <div key={i} style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:10,padding:16}}>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:600,color:C.navy,marginBottom:7}}>{t.title}</div>
                  <div style={{fontSize:12,color:C.text,lineHeight:1.7}}>{t.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:10,overflow:"hidden",marginBottom:12}}>
            <div style={{padding:"10px 14px",borderBottom:`0.5px solid ${C.silver}`,background:C.navy}}>
              <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:1,textTransform:"uppercase"}}>Global indices</div>
            </div>
            {MARKET_DATA.indices.map(i=>(
              <div key={i.ticker} style={{padding:"11px 14px",borderBottom:`0.5px solid ${C.silver}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:C.navy}}>{i.name}</div>
                  <div style={{fontSize:10,color:C.faint}}>{i.ticker}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:600,color:C.navy}}>{i.value.toLocaleString()}</div>
                  <div style={{fontSize:11,fontWeight:600,color:i.direction==="up"?C.green:C.red}}>{i.direction==="up"?"▲":"▼"} {Math.abs(i.pct).toFixed(2)}%</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:10,overflow:"hidden"}}>
              <div style={{padding:"9px 12px",borderBottom:`0.5px solid ${C.silver}`,background:C.greenBg}}>
                <div style={{fontSize:11,fontWeight:600,color:C.green,letterSpacing:1,textTransform:"uppercase"}}>▲ Top risers</div>
              </div>
              {MARKET_DATA.risers.map(r=>(
                <div key={r.ticker} style={{padding:"9px 12px",borderBottom:`0.5px solid ${C.silver}`}}>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:12,fontWeight:700,color:C.navy}}>{r.ticker}</div>
                  <div style={{fontSize:10,color:C.faint,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                  <div style={{fontSize:12,fontWeight:600,color:C.green}}>+{r.pct}%</div>
                </div>
              ))}
            </div>
            <div style={{background:C.white,border:`0.5px solid ${C.silver}`,borderRadius:10,overflow:"hidden"}}>
              <div style={{padding:"9px 12px",borderBottom:`0.5px solid ${C.silver}`,background:C.redBg}}>
                <div style={{fontSize:11,fontWeight:600,color:C.red,letterSpacing:1,textTransform:"uppercase"}}>▼ Top fallers</div>
              </div>
              {MARKET_DATA.fallers.map(r=>(
                <div key={r.ticker} style={{padding:"9px 12px",borderBottom:`0.5px solid ${C.silver}`}}>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:12,fontWeight:700,color:C.navy}}>{r.ticker}</div>
                  <div style={{fontSize:10,color:C.faint,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                  <div style={{fontSize:12,fontWeight:600,color:C.red}}>{r.pct}%</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{background:C.navy,borderRadius:10,padding:16,marginTop:12}}>
            <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.5)",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>FX rates</div>
            {[{pair:"GBP/USD",rate:1.2618,change:+0.0042},{pair:"GBP/EUR",rate:1.1603,change:-0.0021},{pair:"EUR/USD",rate:1.0875,change:+0.0031},{pair:"USD/CNY",rate:7.2400,change:-0.0120}].map(f=>(
              <div key={f.pair} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"0.5px solid rgba(255,255,255,0.08)"}}>
                <span style={{fontSize:12,fontWeight:500,color:"rgba(255,255,255,0.7)"}}>{f.pair}</span>
                <div style={{display:"flex",gap:8}}>
                  <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:600,color:C.white}}>{fmt(f.rate,4)}</span>
                  <span style={{fontSize:11,color:f.change>=0?"#34D399":"#F87171"}}>{f.change>=0?"+":""}{fmt(f.change,4)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── CONNECT ───────────────────────────────────────────────────────
const Connect=()=>{
  const [connected,setConnected]=useState(["bloomberg"]);
  const [showModal,setShowModal]=useState(null);
  const apps=[
    {id:"bloomberg",name:"Bloomberg",category:"Market Data",desc:"Real-time prices, news, analytics & FX rates. Currently providing live data to i-Convergence.",icon:"🟠"},
    {id:"refinitiv",name:"Refinitiv Eikon",category:"Market Data",desc:"Financial data, news, and analytics platform.",icon:"🔵"},
    {id:"plaid",name:"Plaid",category:"Banking",desc:"Connect 12,000+ financial institutions for live account & transaction feeds.",icon:"⚫"},
    {id:"monzo",name:"Monzo Business",category:"Banking",desc:"UK business banking with real-time transaction feeds.",icon:"🔴"},
    {id:"barclays",name:"Barclays Open Banking",category:"Banking",desc:"PSD2 Open Banking API for account data.",icon:"🔷"},
    {id:"hsbc",name:"HSBC Open Banking",category:"Banking",desc:"HSBC account and transaction data.",icon:"🟥"},
    {id:"factset",name:"FactSet",category:"Analytics",desc:"Institutional-grade financial data and portfolio analytics.",icon:"🟦"},
    {id:"morningstar",name:"Morningstar Direct",category:"Analytics",desc:"Investment research, ratings, and portfolio analysis.",icon:"🌟"},
    {id:"salesforce",name:"Salesforce FSC",category:"CRM",desc:"Sync client data, activities and opportunities with Salesforce Financial Services Cloud.",icon:"☁️"},
    {id:"docusign",name:"DocuSign",category:"Documents",desc:"Electronic signatures and document workflow automation.",icon:"📝"},
    {id:"xero",name:"Xero",category:"Accounting",desc:"Accounting and invoicing integration for fee management.",icon:"💙"},
    {id:"sendgrid",name:"SendGrid",category:"Email",desc:"Bulk and transactional email for client communications.",icon:"📧"},
  ];
  const cats=[...new Set(apps.map(a=>a.category))];
  return(
    <div style={{padding:24}}>
      <div style={{marginBottom:18}}><div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>Integrations</div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>Connect external apps</div></div>
      <div style={{background:C.tealLight,borderRadius:10,padding:"12px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:C.teal,flexShrink:0}}/>
        <div style={{fontSize:13,color:C.tealMid}}><strong>Bloomberg connected</strong> — syncing prices and news every 15 minutes. FX rates from price file active.</div>
      </div>
      {cats.map(cat=>(
        <div key={cat} style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:600,color:C.faint,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>{cat}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {apps.filter(a=>a.category===cat).map(app=>{
              const isConn=connected.includes(app.id);
              return(
                <div key={app.id} style={{background:C.white,border:`0.5px solid ${isConn?C.teal:C.silver}`,borderRadius:10,padding:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9}}>
                    <div style={{display:"flex",gap:9,alignItems:"center"}}>
                      <span style={{fontSize:20}}>{app.icon}</span>
                      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:600,color:C.navy}}>{app.name}</div>
                    </div>
                    {isConn&&<Badge color="success">Live</Badge>}
                  </div>
                  <div style={{fontSize:12,color:C.faint,lineHeight:1.6,marginBottom:10}}>{app.desc}</div>
                  {isConn?<Btn small variant="secondary" onClick={()=>setConnected(connected.filter(c=>c!==app.id))}>Disconnect</Btn>:<Btn small onClick={()=>setShowModal(app)}>Connect →</Btn>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {showModal&&<Modal title={`Connect ${showModal.name}`} onClose={()=>setShowModal(null)}>
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:18}}><span style={{fontSize:34}}>{showModal.icon}</span><div><div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:600,color:C.navy}}>{showModal.name}</div><div style={{fontSize:12,color:C.faint}}>{showModal.category}</div></div></div>
        <div style={{background:C.silver,borderRadius:8,padding:14,marginBottom:16,fontSize:13,color:C.text,lineHeight:1.6}}>{showModal.desc}</div>
        <FldInput label="API Key / Client ID" value="" onChange={()=>{}} placeholder="Enter credentials..."/>
        <FldInput label="Secret / Token" value="" onChange={()=>{}} placeholder="••••••••••" type="password"/>
        <div style={{fontSize:11,color:C.faint,marginBottom:14}}>Credentials are encrypted at rest. i-Convergence never stores plaintext keys.</div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>setShowModal(null)}>Cancel</Btn><Btn onClick={()=>{setConnected([...connected,showModal.id]);setShowModal(null);}}>Authorise</Btn></div>
      </Modal>}
    </div>
  );
};

// ─── ROOT ──────────────────────────────────────────────────────────


// ─── RISK / ASSET CLASS DATA ──────────────────────────────────────




// ─── SAMPLE DOCS ───────────────────────────────────────────────────

// ─── DEFAULT ALERTS ────────────────────────────────────────────────

// ─── AI PORTFOLIO ASSISTANT ─────────────────────────────────────────
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

// API key — reads from Vite env var in production, empty string in artifact preview
// API key — injected via window.__ANTHROPIC_KEY in index.html for Vercel deployment
const ANTHROPIC_API_KEY = (typeof window !== "undefined" && window.__ANTHROPIC_KEY) ? window.__ANTHROPIC_KEY : "";

const buildPortfolioContext = (selectedClient) => {
  const clientSummaries = CLIENTS.map(c => {
    const hs = HOLDINGS[c.id] || [];
    const total = hs.reduce((s,h)=>s+h.value,0);
    const cost  = hs.reduce((s,h)=>s+h.cost,0);
    const topH  = [...hs].sort((a,b)=>b.value-a.value).slice(0,5).map(h=>`${h.ticker} $${Math.round(h.value).toLocaleString()}`).join(", ");
    return `${c.name} (${c.id}): Portfolio $${Math.round(total).toLocaleString()}, Cost $${Math.round(cost).toLocaleString()}, P&L ${total>=cost?"+":""}$${Math.round(total-cost).toLocaleString()}. Top holdings: ${topH}.`;
  }).join("\n");
  const focusNote = selectedClient
    ? `\nThe adviser is currently viewing client: ${(CLIENTS.find(c=>c.id===selectedClient)||{name:selectedClient}).name} specifically.\n`
    : "";
  return `You are an AI portfolio assistant for i-Convergence, a financial platform management system. You have access to the following live client portfolio data:\n\n${clientSummaries}${focusNote}\nFX rates: GBP/USD 1.2618, GBP/EUR 1.1603, USD/CNY 7.24.\nToday's date: ${new Date().toLocaleDateString("en-GB")}.\nProvide concise, professional financial analysis. Always note that insights are for adviser reference only and not investment advice.`;
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

// ─── RISK & SUITABILITY PAGE ────────────────────────────────────────
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
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>Mandate: Equity {RISK_MANDATES[score].equity[0]}-{RISK_MANDATES[score].equity[1]}% · FI {RISK_MANDATES[score].fi[0]}-{RISK_MANDATES[score].fi[1]}%</div>
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
                  <div style={{ color: C.green, fontSize: 13, fontWeight: 500, display: "flex", gap: 6, alignItems: "center" }}><span>&#10003;</span><span>No breaches detected</span></div>
                )}
                {comp && comp.flags && comp.flags.length > 0 && comp.flags.map((f, fi) => (
                  <div key={fi} style={{ display: "flex", gap: 8, marginBottom: 8, padding: "8px 10px", background: f.type === "error" ? C.redBg : C.amberBg, borderRadius: 6 }}>
                    <span style={{ flexShrink: 0 }}>{f.type === "error" ? "🔴" : "🟡"}</span>
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
            <label style={{ fontSize: 11, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Risk score: <strong>{editScore} — {RISK_LABELS[editScore]}</strong></label>
            <input type="range" min={1} max={10} value={editScore} onChange={e => setEditScore(+e.target.value)} style={{ width: "100%" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.faint, marginTop: 4 }}>
              <span>1 Very Cautious</span><span>5 Moderate</span><span>10 Speculative</span>
            </div>
          </div>
          <div style={{ background: C.silver, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.text, marginBottom: 14 }}>
            Mandate: Equity {RISK_MANDATES[editScore].equity[0]}-{RISK_MANDATES[editScore].equity[1]}% · Fixed Income {RISK_MANDATES[editScore].fi[0]}-{RISK_MANDATES[editScore].fi[1]}% · Cash max {RISK_MANDATES[editScore].cash[1]}%
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

// ─── REBALANCING TOOL ───────────────────────────────────────────────
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
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 600, color: C.teal }}>{score} — {RISK_LABELS[score]}</div>
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
                  <span style={{ color: breach ? C.red : C.faint }}>{cur}% <span style={{ color: C.teal }}>&#8594;</span> {tgt}%</span>
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
              <span>&#10003;</span><span>Portfolio is within mandate — no rebalancing required</span>
            </div>
          ) : trades.map((t, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: t.diff >= 0 ? C.greenBg : C.redBg, borderRadius: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{t.ac}</div>
                <div style={{ fontSize: 11, color: C.faint }}>{t.pctCurrent}% &#8594; {t.pctTarget}%</div>
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

// ─── ALERTS PAGE ────────────────────────────────────────────────────
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
            <div style={{ fontSize: 32, marginBottom: 10 }}>&#10003;</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 600, color: C.navy }}>No alerts</div>
          </div>
        ) : filtered.map(alert => (
          <div key={alert.id} style={{ background: C.white, border: "0.5px solid " + (alert.severity === "error" ? "#FCA5A5" : alert.severity === "warning" ? "#FCD34D" : C.silver), borderRadius: 10, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, opacity: alert.status === "dismissed" ? 0.5 : 1 }}>
            <div style={{ display: "flex", gap: 12, flex: 1 }}>
              <div style={{ fontSize: 20, flexShrink: 0 }}>{alert.severity === "error" ? "🔴" : alert.severity === "warning" ? "🟡" : "🔵"}</div>
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

// ─── DOCUMENT VAULT ─────────────────────────────────────────────────
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
  const typeIcon   = { KYC: "🪪", "Suitability": "✅", "Mandate": "📋", "Risk Disclosure": "⚠️", "Authorisation": "✍️" };
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
            <span style={{ fontSize: 26, flexShrink: 0 }}>{typeIcon[doc.type] || "📄"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: C.navy, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                <Badge color={typeColour[doc.type] || "info"}>{doc.type}</Badge>
                <Badge color="navy">{doc.clientName}</Badge>
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 5 }}>{doc.date} · {doc.size} · {doc.uploader}</div>
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
            <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
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



// ─── WITHDRAWALS PAGE ─────────────────────────────────────────────
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
    const rows=requests.map(r=>[r.id,r.date,r.clientName,r.type,r.amount,r.ccy,(r.notes||"").replace(/,/g,";"),statusMap[r.id]||r.status].join(",")).join(nl);
    const blob=new Blob([hdr+rows],{type:"text/csv"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="withdrawals.csv";a.click();
  };

  return(
    <div style={{padding:isMobile?"12px 10px":24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:3}}>Back-office</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:C.navy,display:"flex",alignItems:"center",gap:10}}>
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
            {l}{k==="pending"&&pendingCount>0?" ("+pendingCount+")":""}
          </button>
        ))}
      </div>

      {loading?(
        <div style={{padding:40,textAlign:"center",color:C.faint}}>Loading...</div>
      ):requests.length===0?(
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:40,textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:12}}>&#8595;</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:600,color:C.navy,marginBottom:6}}>No withdrawal requests</div>
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
                    <tr key={r.id} style={{borderBottom:"0.5px solid "+C.silver,background:i%2===0?C.white:"#FAFBFC"}}>
                      <td style={{padding:"9px 14px",fontFamily:"monospace",fontSize:11,color:C.faint}}>{r.id}</td>
                      <td style={{padding:"9px 14px",color:C.text,whiteSpace:"nowrap"}}>{r.date}</td>
                      <td style={{padding:"9px 14px",fontWeight:500,color:C.navy}}>{r.clientName}</td>
                      <td style={{padding:"9px 14px",fontWeight:600,color:C.navy}}>{r.type}</td>
                      <td style={{padding:"9px 14px",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,color:C.navy,textAlign:"right"}}>
                        {r.ccy==="GBP"?"£":r.ccy==="EUR"?"€":r.ccy==="CNY"?"¥":"$"}{fmt(r.amount)}
                      </td>
                      <td style={{padding:"9px 14px"}}><Badge color={r.ccy==="GBP"?"navy":"info"}>{r.ccy}</Badge></td>
                      <td style={{padding:"9px 14px",color:C.text,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.notes||"—"}</td>
                      <td style={{padding:"9px 14px"}}><Badge color={isActioned?"success":"warning"}>{isActioned?"Actioned":"Pending"}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{padding:"10px 14px",borderTop:"0.5px solid "+C.silver,fontSize:11,color:C.faint}}>
            {filtered.length} request{filtered.length!==1?"s":""} · Update Status in Google Sheet then click Sync
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


// ─── LOGIN SCREEN ────────────────────────────────────────────────────────────
const LoginScreen = ({ onLogin, loading, error }) => (
  <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{width:"100%",maxWidth:400}}>
      {/* Logo */}
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:42,fontWeight:700,color:C.white,letterSpacing:-1,marginBottom:8}}>
          <span style={{color:C.teal}}>i-</span>Convergence
        </div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.4)",letterSpacing:2,textTransform:"uppercase"}}>Platform Management System</div>
      </div>

      {/* Login card */}
      <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:16,padding:36}}>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:600,color:C.white,marginBottom:6}}>Sign in</div>
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
              <span style={{fontSize:18}}>🔐</span>
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
        i-Convergence Financial Platform · Powered by Auth0
      </div>
    </div>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

// ─── CLIENT PORTAL ───────────────────────────────────────────────────────────
const ClientPortal = ({ user, logout, selectedCcy, setCcy, previewClientId }) => {
  const isMobile = useIsMobile();
  const clientId = previewClientId || user.clientId;
  const client = CLIENTS.find(c => c.id === clientId);
  const sym = CCY_SYMBOLS[selectedCcy] || "$";
  const holdings = HOLDINGS[clientId] || [];
  const totals = clientTotals(clientId, selectedCcy);
  const chartData = buildChart(clientId, selectedCcy);
  const equityH = holdings.filter(h => !h.isCash);
  const cashH = holdings.filter(h => h.isCash);

  if (!client) return (
    <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:C.white,fontSize:16,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:16}}>⚠</div>
        <div>No portfolio linked to this account.</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.4)",marginTop:8}}>Please contact your adviser.</div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Inter',sans-serif",background:"#F2F5F9",minHeight:"100vh"}}>
      {/* Client portal nav */}
      <div style={{background:C.navy,padding:"0 20px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,borderBottom:"1px solid rgba(0,184,176,0.15)"}}>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:700,color:C.white}}>
          <span style={{color:C.teal}}>i-</span>Convergence
          {previewClientId && <span style={{fontSize:11,background:C.gold,color:C.navy,padding:"2px 8px",borderRadius:4,marginLeft:10,fontFamily:"'Inter',sans-serif",fontWeight:600}}>PREVIEW MODE</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <CCYSelector selectedCcy={selectedCcy} onChange={setCcy} compact={isMobile}/>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>
            {previewClientId ? "Adviser preview" : (user && user.name)}
          </div>
          {!previewClientId && (
            <button onClick={logout} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.6)",borderRadius:6,padding:"5px 12px",fontSize:12,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
              Sign out
            </button>
          )}
        </div>
      </div>

      <div style={{padding:isMobile?"12px":24,paddingBottom:40}}>
        {/* Welcome */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:3,color:C.teal,textTransform:"uppercase",marginBottom:4}}>
            {previewClientId ? "Client view preview" : "Welcome back"}
          </div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:700,color:C.navy}}>{client.name}</div>
          <div style={{fontSize:13,color:C.faint,marginTop:2}}>{client.code} · {client.jurisdiction}</div>
        </div>

        {/* Key stats */}
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:12,marginBottom:20}}>
          <div style={{background:C.navy,borderRadius:12,padding:"18px 20px"}}>
            <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:6}}>Portfolio value</div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:700,color:C.white,letterSpacing:-0.5}}>{sym}{fmt(totals.totalValue,0)}</div>
            <div style={{fontSize:12,color:totals.pl>=0?"#34D399":"#F87171",marginTop:4}}>{totals.pl>=0?"▲":"▼"} {pct(totals.pctReturn)} overall</div>
          </div>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,padding:"18px 20px"}}>
            <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.faint,marginBottom:6}}>Inception value</div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:700,color:C.navy,letterSpacing:-0.5}}>{sym}{fmt(totals.totalCost,0)}</div>
            <div style={{fontSize:12,color:C.faint,marginTop:4}}>Cost basis</div>
          </div>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,padding:"18px 20px"}}>
            <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.faint,marginBottom:6}}>Unrealised gain/loss</div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:700,color:totals.pl>=0?C.green:C.red,letterSpacing:-0.5}}>{totals.pl>=0?"+":"-"}{sym}{fmt(Math.abs(totals.pl),0)}</div>
            <div style={{fontSize:12,color:C.faint,marginTop:4}}>{pct(totals.pctReturn)} return</div>
          </div>
        </div>

        {/* Chart */}
        <div style={{background:C.navy,borderRadius:12,padding:"20px 22px",marginBottom:20}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:4}}>Portfolio value over time · {selectedCcy}</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs><linearGradient id="cgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.teal} stopOpacity={0.3}/><stop offset="95%" stopColor={C.teal} stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="date" tick={{fontSize:10,fill:"rgba(255,255,255,0.35)"}}/>
              <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,0.35)"}} tickFormatter={v=>sym+Math.round(v/1000)+"k"}/>
              <Tooltip formatter={v=>[sym+fmt(v,0),"Value"]} contentStyle={{background:C.navyMid,border:"none",borderRadius:6,fontSize:12}} labelStyle={{color:C.white}}/>
              <Area type="monotone" dataKey="value" stroke={C.teal} strokeWidth={2} fill="url(#cgrad)" dot={{fill:C.teal,r:3}}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Holdings */}
        <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,overflow:"hidden",marginBottom:20}}>
          <div style={{padding:"14px 18px",borderBottom:"0.5px solid "+C.silver,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:15,fontWeight:600,color:C.navy}}>Your holdings</div>
            <div style={{display:"flex",gap:10}}>
              <span style={{fontSize:12,color:C.faint}}>{equityH.length} positions</span>
              <span style={{fontSize:12,color:C.faint}}>·</span>
              <span style={{fontSize:12,color:C.faint}}>{cashH.length} cash</span>
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:C.silver}}>
                {["Holding","Description","Value","P&L","Return"].map(h=>(
                  <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:10,fontWeight:600,color:C.faint,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {holdings.map((h,i)=>{
                  const cv=convertAmount(h.value,h.ccy,selectedCcy);
                  const cc=convertAmount(h.cost,h.ccy,selectedCcy);
                  const pl=cv-cc; const ret=calcPct(cc,cv);
                  return(
                    <tr key={i} style={{borderBottom:"0.5px solid "+C.silver,background:i%2===0?C.white:"#FAFBFC"}}>
                      <td style={{padding:"10px 14px",fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,color:C.navy}}>{h.ticker}</td>
                      <td style={{padding:"10px 14px",color:C.text,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</td>
                      <td style={{padding:"10px 14px",fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,color:C.navy,textAlign:"right"}}>{sym}{fmt(cv,0)}</td>
                      <td style={{padding:"10px 14px",textAlign:"right",fontWeight:600,color:h.isCash?"#999":pl>=0?C.green:C.red}}>{h.isCash?"—":(pl>=0?"+":"-")+sym+fmt(Math.abs(pl),0)}</td>
                      <td style={{padding:"10px 14px",textAlign:"right",color:h.isCash?"#999":ret>=0?C.green:C.red}}>{h.isCash?"—":pct(ret)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr style={{background:C.navy}}>
                <td colSpan={2} style={{padding:"10px 14px",color:C.white,fontWeight:600}}>Total</td>
                <td style={{padding:"10px 14px",textAlign:"right",color:C.white,fontFamily:"'Space Grotesk',sans-serif",fontWeight:700}}>{sym}{fmt(totals.totalValue,0)}</td>
                <td style={{padding:"10px 14px",textAlign:"right",color:totals.pl>=0?"#34D399":"#F87171",fontWeight:600}}>{totals.pl>=0?"+":"-"}{sym}{fmt(Math.abs(totals.pl),0)}</td>
                <td style={{padding:"10px 14px",textAlign:"right",color:totals.pctReturn>=0?"#34D399":"#F87171",fontWeight:600}}>{pct(totals.pctReturn)}</td>
              </tr></tfoot>
            </table>
          </div>
        </div>

        {/* Footer note */}
        <div style={{fontSize:11,color:C.faint,textAlign:"center",lineHeight:1.8}}>
          Portfolio values are indicative and updated periodically. For queries contact your adviser.<br/>
          i-Convergence Financial Platform · Data as of {new Date().toLocaleDateString("en-GB")}
        </div>
      </div>
    </div>
  );
};

// ─── USER MANAGEMENT PAGE (adviser only) ─────────────────────────────────────
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
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>User management</div>
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
              <tr key={u.id} style={{borderBottom:"0.5px solid "+C.silver,background:i%2===0?C.white:"#FAFBFC"}}>
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
                <td style={{padding:"11px 14px",fontFamily:"monospace",fontSize:11,color:C.faint}}>{u.clientId||"—"}</td>
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
        {" "}→ User Management → Users. Assign roles, reset passwords, enable/disable MFA, and view login history there.
        Password resets above trigger an Auth0 email to the user.
      </div>

      {showInvite&&(
        <Modal title="Invite user" onClose={()=>setShowInvite(false)}>
          <FldInput label="Email address" value={inviteEmail} onChange={setInviteEmail} placeholder="user@example.com"/>
          <FldSelect label="Role" value={inviteRole} onChange={setInviteRole} options={[{value:"adviser",label:"Adviser — full platform access"},{value:"client",label:"Client — portal access only"}]}/>
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
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:32,fontWeight:700,color:C.white,marginBottom:20}}><span style={{color:C.teal}}>i-</span>Convergence</div>
          <div style={{width:32,height:32,border:"3px solid rgba(0,184,176,0.3)",borderTop:"3px solid "+C.teal,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto"}}/>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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
      </div>
    </div>
  );
}
