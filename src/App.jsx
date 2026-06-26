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
    const params = new URLSearchParams({ response_type: "code", client_id: AUTH0_CLIENT_ID, redirect_uri: AUTH0_REDIRECT_URI, scope: "openid profile email", state, code_challenge: challenge, code_challenge_method: "S256" });
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


// --- ONEDRIVE DATA HOOK ------------------------------------------------------
const useOneDriveData = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onedrive");
      if (!res.ok) throw new Error("API error: " + res.status);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLastUpdated(json.lastUpdated);
    } catch (err) {
      console.error("OneDrive fetch error:", err);
      setError(err.message);
      // Fall back to static data if API fails
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return { data, loading, error, lastUpdated, refresh: fetchData };
};

// --- BRAND -------------------------------------------------------------------
const C = {
  navy: "#0D1B2E", navyMid: "#162840", navyLight: "#1E3A5F",
  teal: "#00B8B0", tealLight: "#E6F9F8",
  silver: "#EFF2F6", silverMid: "#C4CDD8",
  white: "#FFFFFF", text: "#2D3748", faint: "#8A9AB0",
  green: "#10B981", greenBg: "#D1FAE5",
  red: "#EF4444", redBg: "#FEE2E2",
  amber: "#F59E0B", amberBg: "#FEF3C7",
  gold: "#F5A623", goldLight: "#FEF5E7",
};

// --- FX (static for now - will be updated manually) -------------------------
const FX = { GBPUSD: 1.2618, GBPEUR: 1.16, USDGBP: 0.7925, USDEUR: 0.9195, EURGBP: 0.8619, EURUSD: 1.0875 };
const CCY_SYMBOLS = { USD: "$", GBP: "£", EUR: "€" };
const convertAmount = (amount, fromCcy, toCcy) => {
  if (!amount || fromCcy === toCcy) return amount || 0;
  const key = fromCcy.toUpperCase()+toCcy.toUpperCase();
  if (FX[key]) return amount * FX[key];
  const key2 = toCcy.toUpperCase()+fromCcy.toUpperCase();
  if (FX[key2]) return amount / FX[key2];
  return amount;
};

// --- CLIENT DATA (from MN_Client_Data_for_PAS_test.xlsx) ---------------------
const CLIENTS = [
  {
    id: "C00007630",
    clientId: "STM-346521/03-Dawson",
    accountNumber: "F00048105",
    primaryCode: "346521-Dawson",
    name: "Paul Dawson",
    reportingCcy: "USD",
    bankAccount: "12345678",
    bankSort: "01-00-01",
    bankName: "Paul Dawson",
    email: "pdawson@email.com",
    address: "1 New Lane",
    jurisdiction: "US",
    verified: true,
  },
];

const VALUATIONS = {
  "C00007630": {
    totalValuationNotice: 2363895.11,
    totalBriteAssets: 2416957.19,
    totalAssetValuation: 2379365.71,
    totalCashBalance: 37591.48,
    pensionValuation: 2379365.71,
    pensionCash: 37591.48,
    directInvestmentCash: 0,
    directInvestmentAssets: 0,
    totalLiabilities: 53062.08,
    surrenderRebatePayable: 53062.08,
  },
};

const HOLDINGS = {
  "C00007630": [
    { name: "VANECK BIOTECH ETF (USD,NASDAQ)", purchasePrice: "USD 195.41", marketValue: "USD 29,966.24", gainLoss: "USD -5,988.65", pctChange: -16.66, account: "1-STM Malta/ RL360-PM10002373", shares: 184 },
    { name: "VANGUARD HEALTH CARE ETF (USD,ARCA)", purchasePrice: "USD 245.57", marketValue: "USD 49,962.57", gainLoss: "USD 602.26", pctChange: 1.22, account: "1-STM Malta/ RL360-PM10002373", shares: 201 },
    { name: "VANECK SEMICONDUCTOR (USD,NASDAQ)", purchasePrice: "USD 63.39", marketValue: "USD 40,488.56", gainLoss: "USD 25,401.35", pctChange: 168.36, account: "1-STM Malta/ RL360-PM10002373", shares: 238 },
    { name: "VANGUARD TOTAL STOCK MKT ETF (USD,ARCA)", purchasePrice: "USD 197.90", marketValue: "USD 106,344.96", gainLoss: "USD 16,497.91", pctChange: 18.36, account: "1-STM Malta/ RL360-PM10002373", shares: 454 },
    { name: "CONSUMER STAPLES SPDR (USD,ARCA)", purchasePrice: "USD 75.85", marketValue: "USD 47,934.90", gainLoss: "USD -2,352.19", pctChange: -4.68, account: "1-STM Malta/ RL360-PM10002373", shares: 663 },
    { name: "VANGUARD FTSE EMERGING MARKETS (USD,ARCA)", purchasePrice: "USD 52.60", marketValue: "USD 29,680.56", gainLoss: "USD -8,612.24", pctChange: -22.49, account: "1-STM Malta/ RL360-PM10002373", shares: 728 },
    { name: "VANGUARD INTERMEDIATE-TERM TREASURY (USD,NASDAQ)", purchasePrice: "USD 59.85", marketValue: "USD 49,180.98", gainLoss: "USD -730.75", pctChange: -1.46, account: "1-STM Malta/ RL360-PM10002373", shares: 834 },
    { name: "MICROSTRATEGY INC-CL A (USD,NASDAQ)", purchasePrice: "USD 320.18", marketValue: "USD 492,240.00", gainLoss: "USD 223,287.99", pctChange: 83.02, account: "1-STM Malta/ RL360-PM10002373", shares: 840 },
    { name: "TESLA INC (USD,NASDAQ)", purchasePrice: "USD 202.09", marketValue: "USD 257,476.04", gainLoss: "USD 40,028.62", pctChange: 18.41, account: "1-STM Malta/ RL360-PM10002373", shares: 1076 },
    { name: "PURPOSE BITCOIN ETF (USD,TSE)", purchasePrice: "USD 8.06", marketValue: "USD 8,624.00", gainLoss: "USD -241.56", pctChange: -2.72, account: "1-STM Malta/ RL360-PM10002373", shares: 1100 },
    { name: "ENERGY SELECT SECTOR SPDR (USD,ARCA)", purchasePrice: "USD 84.86", marketValue: "USD 95,008.82", gainLoss: "USD -2,917.77", pctChange: -2.98, account: "1-STM Malta/ RL360-PM10002373", shares: 1154 },
    { name: "BITWISE CRYPTO IND INNOV ETF (USD,ARCA)", purchasePrice: "USD 28.15", marketValue: "USD 17,710.56", gainLoss: "USD -31,943.92", pctChange: -64.33, account: "2-Fair Fund", shares: 1764 },
    { name: "FIDELITY CON DISCRET ETF (USD,ARCA)", purchasePrice: "USD 80.26", marketValue: "USD 169,260.00", gainLoss: "USD -6,026.75", pctChange: -3.44, account: "1-STM Malta/ RL360-PM10002373", shares: 2184 },
    { name: "ISHARES GLOBAL ENERGY ETF (USD,ARCA)", purchasePrice: "USD 39.19", marketValue: "USD 97,307.22", gainLoss: "USD -1,343.57", pctChange: -1.36, account: "1-STM Malta/ RL360-PM10002373", shares: 2517 },
    { name: "JPMORGAN EQUITY PREMIUM INCOME (USD,ARCA)", purchasePrice: "USD 55.37", marketValue: "USD 181,948.84", gainLoss: "USD -343.86", pctChange: -0.19, account: "1-STM Malta/ RL360-PM10002373", shares: 3292 },
    { name: "GLOBAL X BLOCKCHAIN ETF (USD,NASDAQ)", purchasePrice: "USD 11.49", marketValue: "USD 134,178.88", gainLoss: "USD 95,259.36", pctChange: 244.76, account: "1-STM Malta/ RL360-PM10002373", shares: 3387.5 },
    { name: "PURPOSE ETHER ETF (USD,TSE)", purchasePrice: "USD 13.06", marketValue: "USD 69,230.00", gainLoss: "USD -22,201.20", pctChange: -24.28, account: "1-STM Malta/ RL360-PM10002373", shares: 7000 },
    { name: "XTRACKERS MSCI EUROPE HEDGED (USD,ARCA)", purchasePrice: "USD 30.19", marketValue: "USD 269,013.08", gainLoss: "USD 53,240.72", pctChange: 24.67, account: "1-STM Malta/ RL360-PM10002373", shares: 7147 },
    { name: "VANECK DIGITAL TRANSFORMATION (USD,NASDAQ)", purchasePrice: "USD 6.19", marketValue: "USD 233,809.50", gainLoss: "USD 63,638.47", pctChange: 37.4, account: "1-STM Malta/ RL360-PM10002373", shares: 27507 },
  ],
};

const WITHDRAWALS = {
  "C00007630": [
    { dateRequested: "2024-02-02", currency: "USD - U.S. Dollar", requestedAmount: 25060.00, actualPaid: 25060.00, paymentDate: "2024-02-16", type: "Lump Sum" },
    { dateRequested: "2024-10-05", currency: "USD - U.S. Dollar", requestedAmount: 50040.00, actualPaid: 50040.00, paymentDate: "2024-12-07", type: "Lump Sum" },
    { dateRequested: "2024-11-12", currency: "USD - U.S. Dollar", requestedAmount: 50040.00, actualPaid: 50040.00, paymentDate: "2025-06-02", type: "Lump Sum" },
  ],
};

const DISTRIBUTIONS = {
  "C00007630": [
    {
      name: "1st - Interim Distribution",
      date: "12/16/2025",
      payments: [
        { accountNumber: "F00047041", recipient: "STM", date: "12/16/2025", amount: 1878184.34, ccy: "USD" },
        { accountNumber: "F00040552", recipient: "STM", date: "12/16/2025", amount: 14946.51, ccy: "USD" },
        { accountNumber: "F00048105", recipient: "STM", date: "12/16/2025", amount: 2942.97, ccy: "USD" },
      ],
    },
  ],
};

// --- TRANSACTIONS (from MN_TX_For_PAS_test.csv) ------------------------------
const TXNS = [{"id":0,"selector":"Cashflow","tradedate":"27/07/2023","settdate":"27/07/2023","clientId":"C00007630","accountId":"F00048105","clientName":"Paul Dawson","txtype":"Deposit","ticker":"CASH-USD","description":"Initial Deposit - Fair Fund","ccy":"USD","qty":0.0,"consideration":3683.18,"clientnetamt":3683.18,"costprice":0.0,"costvalue":0.0},{"id":1,"selector":"Cashflow","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2023 06","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":2,"selector":"Cashflow","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 06","ccy":"USD","qty":0.0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0.0,"costvalue":0.0},{"id":3,"selector":"Cashflow","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 06","ccy":"USD","qty":0.0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0.0,"costvalue":0.0},{"id":4,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"XLP","description":"CashDiv XLP @USD0.526033per shs","ccy":"USD","qty":0.0,"consideration":348.76,"clientnetamt":348.76,"costprice":0.0,"costvalue":348.76},{"id":5,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"XLE","description":"CashDiv XLE @USD0.705843per shs","ccy":"USD","qty":0.0,"consideration":814.54,"clientnetamt":814.54,"costprice":0.0,"costvalue":814.54},{"id":6,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VWO","description":"CashDiv VWO @USD0.2267per shs","ccy":"USD","qty":0.0,"consideration":165.03,"clientnetamt":165.03,"costprice":0.0,"costvalue":165.03},{"id":7,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI @USD0.8265per shs","ccy":"USD","qty":0.0,"consideration":828.98,"clientnetamt":828.98,"costprice":0.0,"costvalue":828.98},{"id":8,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VPL","description":"CashDiv VPL @USD0.5213per shs","ccy":"USD","qty":0.0,"consideration":627.64,"clientnetamt":627.64,"costprice":0.0,"costvalue":627.64},{"id":9,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VGIT","description":"CashDiv VGIT @USD0.129005per shs","ccy":"USD","qty":0.0,"consideration":107.59,"clientnetamt":107.59,"costprice":0.0,"costvalue":107.59},{"id":10,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"SCHD","description":"CashDiv SCHD @USD0.6647per shs","ccy":"USD","qty":0.0,"consideration":452.0,"clientnetamt":452.0,"costprice":0.0,"costvalue":452.0},{"id":11,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"IXC","description":"CashDiv IXC @USD0.712878per shs","ccy":"USD","qty":0.0,"consideration":1794.31,"clientnetamt":1794.31,"costprice":0.0,"costvalue":1794.31},{"id":12,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"FDIS","description":"CashDiv FDIS @USD0.145998per shs","ccy":"USD","qty":0.0,"consideration":318.86,"clientnetamt":318.86,"costprice":0.0,"costvalue":318.86},{"id":13,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"DBEU","description":"CashDiv DBEU @USD1.37539per shs","ccy":"USD","qty":0.0,"consideration":9829.92,"clientnetamt":9829.92,"costprice":0.0,"costvalue":9829.92},{"id":14,"selector":"Cashflow","tradedate":"31/05/2023","settdate":"31/05/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharges 2023 05","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":15,"selector":"Cashflow","tradedate":"30/04/2023","settdate":"30/04/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharges 2023 04","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":16,"selector":"Cashflow","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharges 2023 03","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":17,"selector":"Cashflow","tradedate":"08/06/2023","settdate":"08/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Bank Charges","ccy":"USD","qty":0.0,"consideration":20.0,"clientnetamt":-20.0,"costprice":0.0,"costvalue":0.0},{"id":18,"selector":"Cashflow","tradedate":"08/06/2023","settdate":"08/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Withdrawal","ticker":"CASH-USD","description":"Withdrawal - PCLS","ccy":"USD","qty":0.0,"consideration":50100.0,"clientnetamt":-50100.0,"costprice":0.0,"costvalue":0.0},{"id":19,"selector":"Cashflow","tradedate":"31/05/2023","settdate":"31/05/2023","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 05","ccy":"USD","qty":0.0,"consideration":10.43,"clientnetamt":-10.43,"costprice":0.0,"costvalue":0.0},{"id":20,"selector":"Cashflow","tradedate":"31/05/2023","settdate":"31/05/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 05","ccy":"USD","qty":0.0,"consideration":1642.75,"clientnetamt":-1642.75,"costprice":0.0,"costvalue":0.0},{"id":21,"selector":"Dividend","tradedate":"31/05/2023","settdate":"31/05/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VGIT","description":"CashDiv VGIT @USD0.122398per shs","ccy":"USD","qty":0.0,"consideration":102.08,"clientnetamt":102.08,"costprice":0.0,"costvalue":102.08},{"id":22,"selector":"Cashflow","tradedate":"30/04/2023","settdate":"30/04/2023","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 04","ccy":"USD","qty":0.0,"consideration":10.11,"clientnetamt":-10.11,"costprice":0.0,"costvalue":0.0},{"id":23,"selector":"Cashflow","tradedate":"30/04/2023","settdate":"30/04/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 04","ccy":"USD","qty":0.0,"consideration":1642.83,"clientnetamt":-1642.83,"costprice":0.0,"costvalue":0.0},{"id":24,"selector":"Trade","tradedate":"19/02/2021","settdate":"23/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"DBEU","description":"Bought DBEU 5shs@USD31.1688","ccy":"USD","qty":5.0,"consideration":155.84,"clientnetamt":-155.84,"costprice":31.17,"costvalue":-155.85},{"id":25,"selector":"Cashflow","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 03","ccy":"USD","qty":0.0,"consideration":8.44,"clientnetamt":-8.44,"costprice":0.0,"costvalue":0.0},{"id":26,"selector":"Cashflow","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 03","ccy":"USD","qty":0.0,"consideration":1562.71,"clientnetamt":-1562.71,"costprice":0.0,"costvalue":0.0},{"id":27,"selector":"Dividend","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VWO","description":"CashDiv VWO @USD0.0281per shs","ccy":"USD","qty":0.0,"consideration":91.66,"clientnetamt":91.66,"costprice":0.0,"costvalue":91.66},{"id":28,"selector":"Dividend","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI @USD0.7862per shs","ccy":"USD","qty":0.0,"consideration":2126.45,"clientnetamt":2126.45,"costprice":0.0,"costvalue":2126.45},{"id":29,"selector":"Dividend","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VPL","description":"CashDiv VPL @USD0.1459per shs","ccy":"USD","qty":0.0,"consideration":392.31,"clientnetamt":392.31,"costprice":0.0,"costvalue":392.31},{"id":30,"selector":"Dividend","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"FDIS","description":"CashDiv FDIS @USD0.174001per shs","ccy":"USD","qty":0.0,"consideration":649.37,"clientnetamt":649.37,"costprice":0.0,"costvalue":649.37},{"id":31,"selector":"Cashflow","tradedate":"28/02/2023","settdate":"28/02/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2023 02","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":32,"selector":"Cashflow","tradedate":"28/02/2023","settdate":"28/02/2023","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 02","ccy":"USD","qty":0.0,"consideration":9.18,"clientnetamt":-9.18,"costprice":0.0,"costvalue":0.0},{"id":33,"selector":"Cashflow","tradedate":"28/02/2023","settdate":"28/02/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 02","ccy":"USD","qty":0.0,"consideration":1617.38,"clientnetamt":-1617.38,"costprice":0.0,"costvalue":0.0},{"id":34,"selector":"Cashflow","tradedate":"30/04/2021","settdate":"30/04/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Advisory Fee 2021 04 (Reverse Apr-21)","ccy":"USD","qty":0.0,"consideration":2170.55,"clientnetamt":2170.55,"costprice":0.0,"costvalue":0.0},{"id":35,"selector":"Cashflow","tradedate":"30/04/2021","settdate":"30/04/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Advisory Fee 2021 04 (Apr-21)","ccy":"USD","qty":0.0,"consideration":2170.55,"clientnetamt":-2170.55,"costprice":0.0,"costvalue":0.0},{"id":36,"selector":"Cashflow","tradedate":"31/03/2021","settdate":"31/03/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Advisory Fee 2021 03","ccy":"USD","qty":0.0,"consideration":2197.52,"clientnetamt":-2197.52,"costprice":0.0,"costvalue":0.0},{"id":37,"selector":"Cashflow","tradedate":"31/01/2021","settdate":"31/01/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Advisory Fee 2021 01","ccy":"USD","qty":0.0,"consideration":753.81,"clientnetamt":-753.81,"costprice":0.0,"costvalue":0.0},{"id":38,"selector":"Cashflow","tradedate":"28/02/2021","settdate":"28/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Advisory Fee 2021 02","ccy":"USD","qty":0.0,"consideration":2125.46,"clientnetamt":-2125.46,"costprice":0.0,"costvalue":0.0},{"id":39,"selector":"Cashflow","tradedate":"31/01/2023","settdate":"31/01/2023","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 01","ccy":"USD","qty":0.0,"consideration":8.17,"clientnetamt":-8.17,"costprice":0.0,"costvalue":0.0},{"id":40,"selector":"Cashflow","tradedate":"31/01/2023","settdate":"31/01/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 01","ccy":"USD","qty":0.0,"consideration":1580.76,"clientnetamt":-1580.76,"costprice":0.0,"costvalue":0.0},{"id":41,"selector":"Cashflow","tradedate":"31/01/2023","settdate":"31/01/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2023 01","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":42,"selector":"Dividend","tradedate":"31/01/2023","settdate":"31/01/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BKCH","description":"CashDiv BKCH @USD0.028086per shs","ccy":"USD","qty":0.0,"consideration":95.13,"clientnetamt":95.13,"costprice":0.0,"costvalue":95.13},{"id":43,"selector":"Cashflow","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2022 12","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":44,"selector":"Cashflow","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 12","ccy":"USD","qty":0.0,"consideration":9.02,"clientnetamt":-9.02,"costprice":0.0,"costvalue":0.0},{"id":45,"selector":"Cashflow","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 12","ccy":"USD","qty":0.0,"consideration":1451.52,"clientnetamt":-1451.52,"costprice":0.0,"costvalue":0.0},{"id":46,"selector":"Dividend","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VWO","description":"CashDiv VWO @USD0.6347per shs","ccy":"USD","qty":0.0,"consideration":2070.39,"clientnetamt":2070.39,"costprice":0.0,"costvalue":2070.39},{"id":47,"selector":"Dividend","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI @USD0.9305per shs","ccy":"USD","qty":0.0,"consideration":2517.0,"clientnetamt":2517.0,"costprice":0.0,"costvalue":2517.0},{"id":48,"selector":"Dividend","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VPL","description":"CashDiv VPL @USD1.026per shs","ccy":"USD","qty":0.0,"consideration":2758.91,"clientnetamt":2758.91,"costprice":0.0,"costvalue":2758.91},{"id":49,"selector":"Dividend","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"SMH","description":"CashDiv SMH @USD2.400994per shs","ccy":"USD","qty":0.0,"consideration":672.28,"clientnetamt":672.28,"costprice":0.0,"costvalue":672.28},{"id":50,"selector":"Dividend","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"FDIS","description":"CashDiv FDIS @USD0.139001per shs","ccy":"USD","qty":0.0,"consideration":518.75,"clientnetamt":518.75,"costprice":0.0,"costvalue":518.75},{"id":51,"selector":"Dividend","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"DBEU","description":"CashDiv DBEU @USD0.14282per shs","ccy":"USD","qty":0.0,"consideration":1129.13,"clientnetamt":1129.13,"costprice":0.0,"costvalue":1129.13},{"id":52,"selector":"Dividend","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BBH","description":"CashDiv BBH @USD0.748804per shs","ccy":"USD","qty":0.0,"consideration":137.78,"clientnetamt":137.78,"costprice":0.0,"costvalue":137.78},{"id":53,"selector":"Cashflow","tradedate":"09/12/2022","settdate":"09/12/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Bank Charges","ccy":"USD","qty":0.0,"consideration":20.0,"clientnetamt":-20.0,"costprice":0.0,"costvalue":0.0},{"id":54,"selector":"Cashflow","tradedate":"09/12/2022","settdate":"09/12/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Withdrawal","ticker":"CASH-USD","description":"Withdrawal - One Off","ccy":"USD","qty":0.0,"consideration":12000.0,"clientnetamt":-12000.0,"costprice":0.0,"costvalue":0.0},{"id":55,"selector":"Cashflow","tradedate":"09/12/2022","settdate":"09/12/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Withdrawal","ticker":"CASH-USD","description":"Withdrawal - One Off","ccy":"USD","qty":0.0,"consideration":13100.0,"clientnetamt":-13100.0,"costprice":0.0,"costvalue":0.0},{"id":56,"selector":"Cashflow","tradedate":"30/11/2022","settdate":"30/11/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2022 11","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":57,"selector":"Cashflow","tradedate":"30/11/2022","settdate":"30/11/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 11","ccy":"USD","qty":0.0,"consideration":18.02,"clientnetamt":-18.02,"costprice":0.0,"costvalue":0.0},{"id":58,"selector":"Cashflow","tradedate":"30/11/2022","settdate":"30/11/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 11","ccy":"USD","qty":0.0,"consideration":1493.76,"clientnetamt":-1493.76,"costprice":0.0,"costvalue":0.0},{"id":59,"selector":"Cashflow","tradedate":"31/10/2022","settdate":"31/10/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2022 10","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":60,"selector":"Cashflow","tradedate":"31/10/2022","settdate":"31/10/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 10","ccy":"USD","qty":0.0,"consideration":20.16,"clientnetamt":-20.16,"costprice":0.0,"costvalue":0.0},{"id":61,"selector":"Cashflow","tradedate":"31/10/2022","settdate":"31/10/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 10","ccy":"USD","qty":0.0,"consideration":1445.95,"clientnetamt":-1445.95,"costprice":0.0,"costvalue":0.0},{"id":62,"selector":"Cashflow","tradedate":"20/10/2022","settdate":"20/10/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-GBP","description":"Bank Charge","ccy":"GBP","qty":0.0,"consideration":18.82,"clientnetamt":-18.82,"costprice":0.0,"costvalue":0.0},{"id":63,"selector":"Cashflow","tradedate":"20/10/2022","settdate":"20/10/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-GBP","description":"Trustee Fee","ccy":"GBP","qty":0.0,"consideration":1375.0,"clientnetamt":-1375.0,"costprice":0.0,"costvalue":0.0},{"id":64,"selector":"Cashflow","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2022 09","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":65,"selector":"Cashflow","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 09","ccy":"USD","qty":0.0,"consideration":21.3,"clientnetamt":-21.3,"costprice":0.0,"costvalue":0.0},{"id":66,"selector":"Cashflow","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 09","ccy":"USD","qty":0.0,"consideration":1517.18,"clientnetamt":-1517.18,"costprice":0.0,"costvalue":0.0},{"id":67,"selector":"Dividend","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VWO","description":"CashDiv VWO @USD0.5294per shs","ccy":"USD","qty":0.0,"consideration":1726.92,"clientnetamt":1726.92,"costprice":0.0,"costvalue":1726.92},{"id":68,"selector":"Dividend","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI @USD0.7955per shs","ccy":"USD","qty":0.0,"consideration":2881.3,"clientnetamt":2881.3,"costprice":0.0,"costvalue":2881.3},{"id":69,"selector":"Dividend","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VPL","description":"CashDiv VPL @USD0.149per shs","ccy":"USD","qty":0.0,"consideration":400.67,"clientnetamt":400.67,"costprice":0.0,"costvalue":400.67},{"id":70,"selector":"Dividend","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"FDIS","description":"CashDiv FDIS @USD0.144001per shs","ccy":"USD","qty":0.0,"consideration":537.41,"clientnetamt":537.41,"costprice":0.0,"costvalue":537.41},{"id":71,"selector":"Cashflow","tradedate":"07/10/2022","settdate":"12/10/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"FX Withdrawal","ticker":"Cash-USD","description":"FX Conversion GBP to USD @1.11746","ccy":"USD","qty":0.0,"consideration":1564.45,"clientnetamt":-1564.45,"costprice":0.0,"costvalue":0.0},{"id":72,"selector":"Cashflow","tradedate":"07/10/2022","settdate":"12/10/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"FX Deposit","ticker":"Cash-GBP","description":"FX Conversion GBP to USD @1.11746","ccy":"GBP","qty":0.0,"consideration":1400.0,"clientnetamt":1400.0,"costprice":0.0,"costvalue":0.0},{"id":73,"selector":"Cashflow","tradedate":"31/08/2022","settdate":"31/08/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2022 08","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":74,"selector":"Cashflow","tradedate":"31/08/2022","settdate":"31/08/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 08","ccy":"USD","qty":0.0,"consideration":23.58,"clientnetamt":-23.58,"costprice":0.0,"costvalue":0.0},{"id":75,"selector":"Cashflow","tradedate":"31/08/2022","settdate":"31/08/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 08","ccy":"USD","qty":0.0,"consideration":1647.79,"clientnetamt":-1647.79,"costprice":0.0,"costvalue":0.0},{"id":76,"selector":"Cashflow","tradedate":"31/07/2022","settdate":"31/07/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2022 07","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":77,"selector":"Cashflow","tradedate":"31/07/2022","settdate":"31/07/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 07","ccy":"USD","qty":0.0,"consideration":21.02,"clientnetamt":-21.02,"costprice":0.0,"costvalue":0.0},{"id":78,"selector":"Cashflow","tradedate":"31/07/2022","settdate":"31/07/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 07","ccy":"USD","qty":0.0,"consideration":1547.43,"clientnetamt":-1547.43,"costprice":0.0,"costvalue":0.0},{"id":79,"selector":"Dividend","tradedate":"31/07/2022","settdate":"31/07/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"DBEU","description":"CashDiv DBEU @USD0.51096per shs","ccy":"USD","qty":0.0,"consideration":4039.6,"clientnetamt":4039.6,"costprice":0.0,"costvalue":4039.6},{"id":80,"selector":"Dividend","tradedate":"31/07/2022","settdate":"31/07/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BKCH","description":"CashDiv BKCH @USD0.034511per shs","ccy":"USD","qty":0.0,"consideration":467.62,"clientnetamt":467.62,"costprice":0.0,"costvalue":467.62},{"id":81,"selector":"Cashflow","tradedate":"28/07/2022","settdate":"28/07/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Bank Charges","ccy":"USD","qty":0.0,"consideration":20.0,"clientnetamt":-20.0,"costprice":0.0,"costvalue":0.0},{"id":82,"selector":"Cashflow","tradedate":"28/07/2022","settdate":"28/07/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Withdrawal","ticker":"CASH-USD","description":"Withdrawal - One Off","ccy":"USD","qty":0.0,"consideration":21100.0,"clientnetamt":-21100.0,"costprice":0.0,"costvalue":0.0},{"id":83,"selector":"Trade","tradedate":"19/02/2021","settdate":"23/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"SGOV","description":"Bought SGOV 31shs@USD100.0180","ccy":"USD","qty":31.0,"consideration":3100.56,"clientnetamt":-3100.56,"costprice":100.02,"costvalue":-3100.62},{"id":84,"selector":"Cashflow","tradedate":"30/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2022 06","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":85,"selector":"Cashflow","tradedate":"30/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 06","ccy":"USD","qty":0.0,"consideration":21.19,"clientnetamt":-21.19,"costprice":0.0,"costvalue":0.0},{"id":86,"selector":"Cashflow","tradedate":"30/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 06","ccy":"USD","qty":0.0,"consideration":1557.65,"clientnetamt":-1557.65,"costprice":0.0,"costvalue":0.0},{"id":87,"selector":"Dividend","tradedate":"30/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VWO","description":"CashDiv VWO @USD0.3057per shs","ccy":"USD","qty":0.0,"consideration":997.19,"clientnetamt":997.19,"costprice":0.0,"costvalue":997.19},{"id":88,"selector":"Dividend","tradedate":"30/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI @USD0.7491per shs","ccy":"USD","qty":0.0,"consideration":2713.23,"clientnetamt":2713.23,"costprice":0.0,"costvalue":2713.23},{"id":89,"selector":"Dividend","tradedate":"30/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VPL","description":"CashDiv VPL @USD0.545per shs","ccy":"USD","qty":0.0,"consideration":1465.49,"clientnetamt":1465.49,"costprice":0.0,"costvalue":1465.49},{"id":90,"selector":"Dividend","tradedate":"30/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"FDIS","description":"CashDiv FDIS @USD0.143001per shs","ccy":"USD","qty":0.0,"consideration":533.68,"clientnetamt":533.68,"costprice":0.0,"costvalue":533.68},{"id":91,"selector":"Cashflow","tradedate":"31/05/2022","settdate":"31/05/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2022 05","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":92,"selector":"Cashflow","tradedate":"31/05/2022","settdate":"31/05/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 05","ccy":"USD","qty":0.0,"consideration":24.47,"clientnetamt":-24.47,"costprice":0.0,"costvalue":0.0},{"id":93,"selector":"Cashflow","tradedate":"31/05/2022","settdate":"31/05/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 05","ccy":"USD","qty":0.0,"consideration":1672.68,"clientnetamt":-1672.68,"costprice":0.0,"costvalue":0.0},{"id":94,"selector":"Cashflow","tradedate":"11/05/2022","settdate":"11/05/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Bank Charge","ccy":"USD","qty":0.0,"consideration":20.0,"clientnetamt":-20.0,"costprice":0.0,"costvalue":0.0},{"id":95,"selector":"Cashflow","tradedate":"11/05/2022","settdate":"11/05/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Withdrawal","ticker":"CASH-USD","description":"Withdrawal ","ccy":"USD","qty":0.0,"consideration":5040.0,"clientnetamt":-5040.0,"costprice":0.0,"costvalue":0.0},{"id":96,"selector":"Cashflow","tradedate":"30/04/2022","settdate":"30/04/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2022 04","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":97,"selector":"Cashflow","tradedate":"30/04/2022","settdate":"30/04/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 04","ccy":"USD","qty":0.0,"consideration":32.35,"clientnetamt":-32.35,"costprice":0.0,"costvalue":0.0},{"id":98,"selector":"Cashflow","tradedate":"30/04/2022","settdate":"30/04/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 04","ccy":"USD","qty":0.0,"consideration":1907.15,"clientnetamt":-1907.15,"costprice":0.0,"costvalue":0.0},{"id":99,"selector":"Cashflow","tradedate":"31/03/2022","settdate":"31/03/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2022 03","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":100,"selector":"Cashflow","tradedate":"31/03/2022","settdate":"31/03/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 03","ccy":"USD","qty":0.0,"consideration":34.97,"clientnetamt":-34.97,"costprice":0.0,"costvalue":0.0},{"id":101,"selector":"Cashflow","tradedate":"31/03/2022","settdate":"31/03/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 03","ccy":"USD","qty":0.0,"consideration":1935.17,"clientnetamt":-1935.17,"costprice":0.0,"costvalue":0.0},{"id":102,"selector":"Dividend","tradedate":"31/03/2022","settdate":"31/03/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VWO","description":"CashDiv VWO @USD0.1339per shs","ccy":"USD","qty":0.0,"consideration":436.78,"clientnetamt":436.78,"costprice":0.0,"costvalue":436.78},{"id":103,"selector":"Dividend","tradedate":"31/03/2022","settdate":"31/03/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI @USD0.7082per shs","ccy":"USD","qty":0.0,"consideration":2565.1,"clientnetamt":2565.1,"costprice":0.0,"costvalue":2565.1},{"id":104,"selector":"Dividend","tradedate":"31/03/2022","settdate":"31/03/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VPL","description":"CashDiv VPL @USD0.0523per shs","ccy":"USD","qty":0.0,"consideration":140.64,"clientnetamt":140.64,"costprice":0.0,"costvalue":140.64},{"id":105,"selector":"Dividend","tradedate":"31/03/2022","settdate":"31/03/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"FDIS","description":"CashDiv FDIS @USD0.138001per shs","ccy":"USD","qty":0.0,"consideration":515.02,"clientnetamt":515.02,"costprice":0.0,"costvalue":515.02},{"id":106,"selector":"Trade","tradedate":"19/02/2021","settdate":"23/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"VCSH","description":"Bought VCSH 59shs@USD83.0742","ccy":"USD","qty":59.0,"consideration":4901.38,"clientnetamt":-4901.38,"costprice":83.07,"costvalue":-4901.13},{"id":107,"selector":"Trade","tradedate":"19/02/2021","settdate":"23/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"SCHO","description":"Bought SCHO 96shs@USD51.3697","ccy":"USD","qty":96.0,"consideration":4931.49,"clientnetamt":-4931.49,"costprice":51.37,"costvalue":-4931.52},{"id":108,"selector":"Cashflow","tradedate":"28/02/2022","settdate":"28/02/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2022 02","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":109,"selector":"Cashflow","tradedate":"28/02/2022","settdate":"28/02/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 02","ccy":"USD","qty":0.0,"consideration":35.16,"clientnetamt":-35.16,"costprice":0.0,"costvalue":0.0},{"id":110,"selector":"Cashflow","tradedate":"28/02/2022","settdate":"28/02/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 02","ccy":"USD","qty":0.0,"consideration":1990.17,"clientnetamt":-1990.17,"costprice":0.0,"costvalue":0.0},{"id":111,"selector":"Cashflow","tradedate":"31/01/2022","settdate":"31/01/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2022 01","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":112,"selector":"Cashflow","tradedate":"31/01/2022","settdate":"31/01/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 01","ccy":"USD","qty":0.0,"consideration":36.29,"clientnetamt":-36.29,"costprice":0.0,"costvalue":0.0},{"id":113,"selector":"Cashflow","tradedate":"31/01/2022","settdate":"31/01/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 01","ccy":"USD","qty":0.0,"consideration":2065.57,"clientnetamt":-2065.57,"costprice":0.0,"costvalue":0.0},{"id":114,"selector":"Dividend","tradedate":"31/01/2022","settdate":"31/01/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BKCH","description":"CashDiv BKCH @USD0.933968per shs","ccy":"USD","qty":0.0,"consideration":12655.27,"clientnetamt":12655.27,"costprice":0.0,"costvalue":12655.27},{"id":115,"selector":"Dividend","tradedate":"31/01/2022","settdate":"31/01/2022","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BITQ","description":"CashDiv BITQ @USD0.655374per shs","ccy":"USD","qty":0.0,"consideration":1156.08,"clientnetamt":1156.08,"costprice":0.0,"costvalue":1156.08},{"id":116,"selector":"Dividend","tradedate":"31/01/2022","settdate":"31/01/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"ARKK","description":"CashDiv ARKK @USD0.25768per shs","ccy":"USD","qty":0.0,"consideration":234.75,"clientnetamt":234.75,"costprice":0.0,"costvalue":234.75},{"id":117,"selector":"Dividend","tradedate":"31/01/2022","settdate":"31/01/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"ARKK","description":"CashDiv ARKK @USD0.52489per shs","ccy":"USD","qty":0.0,"consideration":478.17,"clientnetamt":478.17,"costprice":0.0,"costvalue":478.17},{"id":118,"selector":"Cashflow","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2021 12","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":119,"selector":"Cashflow","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2021 12","ccy":"USD","qty":0.0,"consideration":44.64,"clientnetamt":-44.64,"costprice":0.0,"costvalue":0.0},{"id":120,"selector":"Cashflow","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2021 12","ccy":"USD","qty":0.0,"consideration":2228.04,"clientnetamt":-2228.04,"costprice":0.0,"costvalue":0.0},{"id":121,"selector":"Dividend","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VWO","description":"CashDiv VWO @USD0.478per shs","ccy":"USD","qty":0.0,"consideration":1559.24,"clientnetamt":1559.24,"costprice":0.0,"costvalue":1559.24},{"id":122,"selector":"Dividend","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI @USD0.8592per shs","ccy":"USD","qty":0.0,"consideration":4248.75,"clientnetamt":4248.75,"costprice":0.0,"costvalue":4248.75},{"id":123,"selector":"Dividend","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VPL","description":"CashDiv VPL @USD1.4707per shs","ccy":"USD","qty":0.0,"consideration":3954.71,"clientnetamt":3954.71,"costprice":0.0,"costvalue":3954.71},{"id":124,"selector":"Dividend","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"SMH","description":"CashDiv SMH @USD1.573286per shs","ccy":"USD","qty":0.0,"consideration":440.52,"clientnetamt":440.52,"costprice":0.0,"costvalue":440.52},{"id":125,"selector":"Dividend","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"DBEU","description":"CashDiv DBEU @USD0.11248per shs","ccy":"USD","qty":0.0,"consideration":889.26,"clientnetamt":889.26,"costprice":0.0,"costvalue":889.26},{"id":126,"selector":"Dividend","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"DAPP","description":"CashDiv DAPP @USD1.8776per shs","ccy":"USD","qty":0.0,"consideration":3896.02,"clientnetamt":3896.02,"costprice":0.0,"costvalue":3896.02},{"id":127,"selector":"Dividend","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BBH","description":"CashDiv BBH @USD0.397174per shs","ccy":"USD","qty":0.0,"consideration":73.08,"clientnetamt":73.08,"costprice":0.0,"costvalue":73.08},{"id":128,"selector":"Trade","tradedate":"19/02/2021","settdate":"23/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"VPL","description":"Sold VPL 66shs@USD83.8990","ccy":"USD","qty":-66.0,"consideration":5537.34,"clientnetamt":5537.34,"costprice":-80.11,"costvalue":5287.26},{"id":129,"selector":"Trade","tradedate":"19/02/2021","settdate":"23/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"VWO","description":"Sold VWO 110shs@USD56.1686","ccy":"USD","qty":-110.0,"consideration":6178.55,"clientnetamt":6178.55,"costprice":-52.6,"costvalue":5786.0},{"id":130,"selector":"Cashflow","tradedate":"30/11/2021","settdate":"30/11/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2021 11","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":131,"selector":"Cashflow","tradedate":"30/11/2021","settdate":"30/11/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2021 11","ccy":"USD","qty":0.0,"consideration":2415.39,"clientnetamt":-2415.39,"costprice":0.0,"costvalue":0.0},{"id":132,"selector":"Cashflow","tradedate":"30/11/2021","settdate":"30/11/2021","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2021 11","ccy":"USD","qty":0.0,"consideration":22.36,"clientnetamt":-22.36,"costprice":0.0,"costvalue":0.0},{"id":133,"selector":"Trade","tradedate":"19/02/2021","settdate":"23/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"SCHP","description":"Bought SCHP 110shs@USD61.3972","ccy":"USD","qty":110.0,"consideration":6753.69,"clientnetamt":-6753.69,"costprice":61.4,"costvalue":-6754.0},{"id":134,"selector":"Cashflow","tradedate":"18/11/2021","settdate":"18/11/2021","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Deposit","ticker":"CASH-USD","description":"Initial Deposit (Fair Fund)","ccy":"USD","qty":0.0,"consideration":61933.42,"clientnetamt":61933.42,"costprice":0.0,"costvalue":0.0},{"id":135,"selector":"Cashflow","tradedate":"31/10/2021","settdate":"31/10/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2021 10","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":136,"selector":"Cashflow","tradedate":"31/10/2021","settdate":"31/10/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2021 10","ccy":"USD","qty":0.0,"consideration":2259.29,"clientnetamt":-2259.29,"costprice":0.0,"costvalue":0.0},{"id":137,"selector":"Dividend","tradedate":"31/10/2021","settdate":"31/10/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VCSH","description":"CashDiv VCSH @USD0.1078per shs","ccy":"USD","qty":0.0,"consideration":235.11,"clientnetamt":235.11,"costprice":0.0,"costvalue":235.11},{"id":138,"selector":"Dividend","tradedate":"31/10/2021","settdate":"31/10/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BNDX","description":"CashDiv BNDX @USD0.0382per shs","ccy":"USD","qty":0.0,"consideration":144.51,"clientnetamt":144.51,"costprice":0.0,"costvalue":144.51},{"id":139,"selector":"Cashflow","tradedate":"11/10/2021","settdate":"22/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-GBP","description":"Bank Charge","ccy":"GBP","qty":0.0,"consideration":18.9,"clientnetamt":-18.9,"costprice":0.0,"costvalue":0.0},{"id":140,"selector":"Cashflow","tradedate":"11/10/2021","settdate":"22/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-GBP","description":"Trustee Fee","ccy":"GBP","qty":0.0,"consideration":1350.0,"clientnetamt":-1350.0,"costprice":0.0,"costvalue":0.0},{"id":141,"selector":"Cashflow","tradedate":"30/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharges 2021 09","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":142,"selector":"Cashflow","tradedate":"30/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Advisory Fee 2021 09","ccy":"USD","qty":0.0,"consideration":2214.96,"clientnetamt":-2214.96,"costprice":0.0,"costvalue":0.0},{"id":143,"selector":"Dividend","tradedate":"30/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VWO","description":"CashDiv VWO@USD0.4727per shs","ccy":"USD","qty":0.0,"consideration":1541.94,"clientnetamt":1541.94,"costprice":0.0,"costvalue":1541.94},{"id":144,"selector":"Dividend","tradedate":"30/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI@USD0.7242per shs","ccy":"USD","qty":0.0,"consideration":3581.18,"clientnetamt":3581.18,"costprice":0.0,"costvalue":3581.18},{"id":145,"selector":"Dividend","tradedate":"30/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VPL","description":"CashDiv VPL@USD0.3634per shs","ccy":"USD","qty":0.0,"consideration":977.19,"clientnetamt":977.19,"costprice":0.0,"costvalue":977.19},{"id":146,"selector":"Dividend","tradedate":"30/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VCSH","description":"CashDiv VCSH@USD0.1058per shs","ccy":"USD","qty":0.0,"consideration":230.75,"clientnetamt":230.75,"costprice":0.0,"costvalue":230.75},{"id":147,"selector":"Dividend","tradedate":"30/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BNDX","description":"CashDiv BNDX@USD0.0401per shs","ccy":"USD","qty":0.0,"consideration":151.7,"clientnetamt":151.7,"costprice":0.0,"costvalue":151.7},{"id":148,"selector":"Trade","tradedate":"19/02/2021","settdate":"23/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"BNDX","description":"Bought BNDX 147shs@USD57.4242","ccy":"USD","qty":147.0,"consideration":8441.36,"clientnetamt":-8441.36,"costprice":57.42,"costvalue":-8440.74},{"id":149,"selector":"Cashflow","tradedate":"15/09/2021","settdate":"17/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"FX Deposit","ticker":"CASH-GBP","description":"FX Conversion GBP to USD @1.384080","ccy":"GBP","qty":0.0,"consideration":1370.0,"clientnetamt":1370.0,"costprice":0.0,"costvalue":0.0},{"id":150,"selector":"Cashflow","tradedate":"15/09/2021","settdate":"17/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"FX Withdrawal","ticker":"CASH-USD","description":"FX Conversion GBP to USD @1.384080","ccy":"USD","qty":0.0,"consideration":1896.19,"clientnetamt":-1896.19,"costprice":0.0,"costvalue":0.0},{"id":151,"selector":"Cashflow","tradedate":"31/08/2021","settdate":"31/08/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharges 2021 08","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":152,"selector":"Cashflow","tradedate":"31/08/2021","settdate":"31/08/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Advisory Fee 2021 08","ccy":"USD","qty":0.0,"consideration":2211.7,"clientnetamt":-2211.7,"costprice":0.0,"costvalue":0.0},{"id":153,"selector":"Dividend","tradedate":"31/08/2021","settdate":"31/08/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VCSH","description":"CashDiv VCSH @USD0.1082per shs","ccy":"USD","qty":0.0,"consideration":235.98,"clientnetamt":235.98,"costprice":0.0,"costvalue":235.98},{"id":154,"selector":"Dividend","tradedate":"31/08/2021","settdate":"31/08/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BNDX","description":"CashDiv BNDX @USD0.0405per shs","ccy":"USD","qty":0.0,"consideration":153.21,"clientnetamt":153.21,"costprice":0.0,"costvalue":153.21},{"id":155,"selector":"Cashflow","tradedate":"31/07/2021","settdate":"31/07/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Advisory Fee 2021 07","ccy":"USD","qty":0.0,"consideration":2201.0,"clientnetamt":-2201.0,"costprice":0.0,"costvalue":0.0},{"id":156,"selector":"Cashflow","tradedate":"31/07/2021","settdate":"31/07/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharges 2021 07","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":157,"selector":"Dividend","tradedate":"31/07/2021","settdate":"31/07/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VCSH","description":"CashDiv VCSH @USD0.1031per shs","ccy":"USD","qty":0.0,"consideration":224.86,"clientnetamt":224.86,"costprice":0.0,"costvalue":224.86},{"id":158,"selector":"Dividend","tradedate":"31/07/2021","settdate":"31/07/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"DBEU","description":"CashDiv DBEU @USD0.56873per shs","ccy":"USD","qty":0.0,"consideration":4496.38,"clientnetamt":4496.38,"costprice":0.0,"costvalue":4496.38},{"id":159,"selector":"Dividend","tradedate":"31/07/2021","settdate":"31/07/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BNDX","description":"CashDiv BNDX @USD0.0415per shs","ccy":"USD","qty":0.0,"consideration":156.99,"clientnetamt":156.99,"costprice":0.0,"costvalue":156.99},{"id":160,"selector":"Cashflow","tradedate":"30/06/2021","settdate":"30/06/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Advisory Fee 2021 06","ccy":"USD","qty":0.0,"consideration":2186.01,"clientnetamt":-2186.01,"costprice":0.0,"costvalue":0.0},{"id":161,"selector":"Cashflow","tradedate":"30/06/2021","settdate":"30/06/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharges 2021 06","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":162,"selector":"Dividend","tradedate":"30/06/2021","settdate":"30/06/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VWO","description":"Dividend-VWO @USD0.280300per shs","ccy":"USD","qty":0.0,"consideration":914.34,"clientnetamt":914.34,"costprice":0.0,"costvalue":914.34},{"id":163,"selector":"Dividend","tradedate":"30/06/2021","settdate":"30/06/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VTI","description":"Dividend-VTI @USD0.675300per shs","ccy":"USD","qty":0.0,"consideration":3339.36,"clientnetamt":3339.36,"costprice":0.0,"costvalue":3339.36},{"id":164,"selector":"Dividend","tradedate":"30/06/2021","settdate":"30/06/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VPL","description":"Dividend-VPL @USD0.495200per shs","ccy":"USD","qty":0.0,"consideration":1331.6,"clientnetamt":1331.6,"costprice":0.0,"costvalue":1331.6},{"id":165,"selector":"Dividend","tradedate":"30/06/2021","settdate":"30/06/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VCSH","description":"Dividend-VCSH @USD0.109800per shs","ccy":"USD","qty":0.0,"consideration":239.48,"clientnetamt":239.48,"costprice":0.0,"costvalue":239.48},{"id":166,"selector":"Dividend","tradedate":"30/06/2021","settdate":"30/06/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"SGOV","description":"Dividend-SGOV @USD0.001553per shs","ccy":"USD","qty":0.0,"consideration":1.69,"clientnetamt":1.69,"costprice":0.0,"costvalue":1.69},{"id":167,"selector":"Dividend","tradedate":"30/06/2021","settdate":"30/06/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BNDX","description":"Dividend-BNDX @USD0.040800per shs","ccy":"USD","qty":0.0,"consideration":154.35,"clientnetamt":154.35,"costprice":0.0,"costvalue":154.35},{"id":168,"selector":"Cashflow","tradedate":"31/05/2021","settdate":"31/05/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Advisory Fee 2021 05","ccy":"USD","qty":0.0,"consideration":2145.83,"clientnetamt":-2145.83,"costprice":0.0,"costvalue":0.0},{"id":169,"selector":"Cashflow","tradedate":"31/05/2021","settdate":"31/05/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharges 2021 05","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":170,"selector":"Dividend","tradedate":"31/05/2021","settdate":"31/05/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VCSH","description":"VCSH Cash Div @USD0.107300per shs","ccy":"USD","qty":0.0,"consideration":234.02,"clientnetamt":234.02,"costprice":0.0,"costvalue":234.02},{"id":171,"selector":"Dividend","tradedate":"31/05/2021","settdate":"31/05/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"SGOV","description":"SGOV Cash Div @USD0.003612per shs","ccy":"USD","qty":0.0,"consideration":3.93,"clientnetamt":3.93,"costprice":0.0,"costvalue":3.93},{"id":172,"selector":"Dividend","tradedate":"31/05/2021","settdate":"31/05/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BNDX","description":"BNDX Cash Div @USD0.038800per shs","ccy":"USD","qty":0.0,"consideration":146.78,"clientnetamt":146.78,"costprice":0.0,"costvalue":146.78},{"id":173,"selector":"Cashflow","tradedate":"30/04/2021","settdate":"30/04/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"CASH-USD","description":"Advisory Fee 2021 04","ccy":"USD","qty":0.0,"consideration":2169.51,"clientnetamt":-2169.51,"costprice":0.0,"costvalue":0.0},{"id":174,"selector":"Cashflow","tradedate":"30/04/2021","settdate":"30/04/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharges 2021 04","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":175,"selector":"Dividend","tradedate":"30/04/2021","settdate":"30/04/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VCSH","description":"VCSH Cash Div @USD0.116200per shs","ccy":"USD","qty":0.0,"consideration":253.44,"clientnetamt":253.44,"costprice":0.0,"costvalue":253.44},{"id":176,"selector":"Dividend","tradedate":"30/04/2021","settdate":"30/04/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"SGOV","description":"SGOV Cash Div @USD0.000906per shs","ccy":"USD","qty":0.0,"consideration":0.99,"clientnetamt":0.99,"costprice":0.0,"costvalue":0.99},{"id":177,"selector":"Dividend","tradedate":"30/04/2021","settdate":"30/04/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BNDX","description":"BNDX Cash Div @USD0.041300per shs","ccy":"USD","qty":0.0,"consideration":156.24,"clientnetamt":156.24,"costprice":0.0,"costvalue":156.24},{"id":178,"selector":"Cashflow","tradedate":"31/03/2021","settdate":"31/03/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharges 2021 03","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":179,"selector":"Dividend","tradedate":"31/03/2021","settdate":"31/03/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"SCHO","description":"SCHO Cash Div @USD0.023000per shs","ccy":"USD","qty":0.0,"consideration":81.15,"clientnetamt":81.15,"costprice":0.0,"costvalue":81.15},{"id":180,"selector":"Dividend","tradedate":"31/03/2021","settdate":"31/03/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BNDX","description":"BNDX Cash Div @USD0.045100per shs","ccy":"USD","qty":0.0,"consideration":170.61,"clientnetamt":170.61,"costprice":0.0,"costvalue":170.61},{"id":181,"selector":"Dividend","tradedate":"31/03/2021","settdate":"31/03/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VCSH","description":"VCSH Cash Div @USD0.108500per shs","ccy":"USD","qty":0.0,"consideration":236.64,"clientnetamt":236.64,"costprice":0.0,"costvalue":236.64},{"id":182,"selector":"Dividend","tradedate":"31/03/2021","settdate":"31/03/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VPL","description":"VPL Cash Div @USD0.156600per shs","ccy":"USD","qty":0.0,"consideration":421.09,"clientnetamt":421.09,"costprice":0.0,"costvalue":421.09},{"id":183,"selector":"Dividend","tradedate":"31/03/2021","settdate":"31/03/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VTI","description":"VTI Cash Div @USD0.671600per shs","ccy":"USD","qty":0.0,"consideration":3321.07,"clientnetamt":3321.07,"costprice":0.0,"costvalue":3321.07},{"id":184,"selector":"Dividend","tradedate":"31/03/2021","settdate":"31/03/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VWO","description":"VWO Cash Div @USD0.068400per shs","ccy":"USD","qty":0.0,"consideration":223.12,"clientnetamt":223.12,"costprice":0.0,"costvalue":223.12},{"id":185,"selector":"Cashflow","tradedate":"28/02/2021","settdate":"28/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharges 2021 02","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":186,"selector":"Trade","tradedate":"19/02/2021","settdate":"23/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"VTI","description":"Sold VTI 82shs@USD206.4701","ccy":"USD","qty":-82.0,"consideration":16930.55,"clientnetamt":16930.55,"costprice":-195.29,"costvalue":16013.78},{"id":187,"selector":"Trade","tradedate":"23/03/2023","settdate":"27/03/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"DBEU","description":"Sold DBEU 759shs@USD35.5408","ccy":"USD","qty":-759.0,"consideration":26975.45,"clientnetamt":26975.45,"costprice":-28.86,"costvalue":21901.43},{"id":188,"selector":"Cashflow","tradedate":"31/01/2021","settdate":"31/01/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharges 2021 01","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":189,"selector":"Cashflow","tradedate":"21/01/2021","settdate":"21/01/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR","ticker":"CASH-USD","description":"Surrender Rebate","ccy":"USD","qty":0.0,"consideration":75282.77,"clientnetamt":75282.77,"costprice":0.0,"costvalue":0.0},{"id":190,"selector":"Cashflow","tradedate":"21/01/2021","settdate":"21/01/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Deposit","ticker":"CASH-USD","description":"Initial Deposit","ccy":"USD","qty":0.0,"consideration":2473960.37,"clientnetamt":2473960.37,"costprice":0.0,"costvalue":0.0},{"id":191,"selector":"Trade","tradedate":"27/07/2023","settdate":"31/07/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"DAPP","description":"Bought DAPP 3454shs@USD8.5426","ccy":"USD","qty":3454.0,"consideration":29506.03,"clientnetamt":-29506.03,"costprice":8.54,"costvalue":-29506.14},{"id":192,"selector":"Trade","tradedate":"16/06/2021","settdate":"18/06/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"BBH","description":"Bought BBH 184shs@USD195.407","ccy":"USD","qty":184.0,"consideration":35954.88,"clientnetamt":-35954.88,"costprice":195.41,"costvalue":-35954.89},{"id":193,"selector":"Trade","tradedate":"23/03/2023","settdate":"27/03/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"MSTR","description":"Bought MSTR 160shs@USD259.1375","ccy":"USD","qty":160.0,"consideration":41462.0,"clientnetamt":-41462.0,"costprice":259.14,"costvalue":-41462.0},{"id":194,"selector":"Trade","tradedate":"20/04/2023","settdate":"24/04/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"VHT","description":"Bought VHT 201shs@USD245.5737","ccy":"USD","qty":201.0,"consideration":49360.31,"clientnetamt":-49360.31,"costprice":245.57,"costvalue":-49360.31},{"id":195,"selector":"Trade","tradedate":"02/12/2021","settdate":"06/12/2021","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"BUY","ticker":"BITQ","description":"Bought BITQ 1764shs@USD28.1488","ccy":"USD","qty":1764.0,"consideration":49654.4,"clientnetamt":-49654.4,"costprice":28.15,"costvalue":-49654.48},{"id":196,"selector":"Trade","tradedate":"20/04/2023","settdate":"24/04/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"SCHD","description":"Bought SCHD 680shs@USD73.2993","ccy":"USD","qty":680.0,"consideration":49843.52,"clientnetamt":-49843.52,"costprice":73.3,"costvalue":-49843.52},{"id":197,"selector":"Trade","tradedate":"20/04/2023","settdate":"24/04/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"VGIT","description":"Bought VGIT 834shs@USD59.8462","ccy":"USD","qty":834.0,"consideration":49911.7,"clientnetamt":-49911.7,"costprice":59.85,"costvalue":-49911.73},{"id":198,"selector":"Trade","tradedate":"20/04/2023","settdate":"24/04/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"XLP","description":"Bought XLP 663shs@USD75.8478","ccy":"USD","qty":663.0,"consideration":50287.06,"clientnetamt":-50287.06,"costprice":75.85,"costvalue":-50287.09},{"id":199,"selector":"Trade","tradedate":"20/04/2023","settdate":"24/04/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"AAAU","description":"Bought AAAU 2529shs@USD19.9039","ccy":"USD","qty":2529.0,"consideration":50336.96,"clientnetamt":-50336.96,"costprice":19.9,"costvalue":-50336.96},{"id":200,"selector":"Trade","tradedate":"20/04/2023","settdate":"24/04/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"SGOL","description":"Bought SGOL 2624shs@USD19.2171","ccy":"USD","qty":2624.0,"consideration":50425.8,"clientnetamt":-50425.8,"costprice":19.22,"costvalue":-50425.67},{"id":201,"selector":"Trade","tradedate":"20/10/2021","settdate":"22/10/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"DAPP","description":"Bought DAPP 2075shs@USD29.0137","ccy":"USD","qty":2075.0,"consideration":60203.5,"clientnetamt":-60203.5,"costprice":29.01,"costvalue":-60203.43},{"id":202,"selector":"CorpAct","tradedate":"05/05/2023","settdate":"05/05/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"SMH","description":"CorpAction : SMH Split 2 for 1 ","ccy":"USD","qty":560.0,"consideration":69885.8,"clientnetamt":-69885.8,"costprice":124.8,"costvalue":-69885.82},{"id":203,"selector":"Trade","tradedate":"16/06/2021","settdate":"18/06/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"SMH","description":"Bought SMH 280shs@USD253.5664","ccy":"USD","qty":280.0,"consideration":70998.6,"clientnetamt":-70998.6,"costprice":253.57,"costvalue":-70998.59},{"id":204,"selector":"Trade","tradedate":"21/09/2021","settdate":"22/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"BTCC.U","description":"Bought BTCC.U 9000shs@USD8.0596","ccy":"USD","qty":9000.0,"consideration":72536.0,"clientnetamt":-72536.0,"costprice":8.06,"costvalue":-72536.4},{"id":205,"selector":"Trade","tradedate":"27/07/2023","settdate":"31/07/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"SMH","description":"Sold SMH 322shs@USD159.6009","ccy":"USD","qty":-322.0,"consideration":51391.49,"clientnetamt":51391.49,"costprice":-124.8,"costvalue":40184.34},{"id":206,"selector":"Trade","tradedate":"17/11/2022","settdate":"21/11/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"DAPP","description":"Bought DAPP 21978shs@USD3.661","ccy":"USD","qty":21978.0,"consideration":80460.78,"clientnetamt":-80541.24,"costprice":3.66,"costvalue":-80461.46},{"id":207,"selector":"Trade","tradedate":"21/06/2023","settdate":"23/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"JEPI","description":"Bought JEPI 1500shs@USD54.7153","ccy":"USD","qty":1500.0,"consideration":82073.0,"clientnetamt":-82073.0,"costprice":54.72,"costvalue":-82072.95},{"id":208,"selector":"Trade","tradedate":"20/04/2023","settdate":"24/04/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"TSLA","description":"Bought TSLA 545shs@USD167.2799","ccy":"USD","qty":545.0,"consideration":91167.55,"clientnetamt":-91167.55,"costprice":167.28,"costvalue":-91167.55},{"id":209,"selector":"Trade","tradedate":"28/09/2021","settdate":"29/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"ETHH.U","description":"Bought ETHH.U 7000shs@USD13.0616","ccy":"USD","qty":7000.0,"consideration":91431.0,"clientnetamt":-91431.0,"costprice":13.06,"costvalue":-91431.2},{"id":210,"selector":"Trade","tradedate":"20/09/2023","settdate":"22/09/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"MSTR","description":"Bought MSTR 275shs@USD341.0473","ccy":"USD","qty":275.0,"consideration":93788.0,"clientnetamt":-93788.0,"costprice":341.0473,"costvalue":-93788.01},{"id":211,"selector":"Trade","tradedate":"28/04/2023","settdate":"02/05/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"XLE","description":"Bought XLE 1154shs@USD84.8584","ccy":"USD","qty":1154.0,"consideration":97926.56,"clientnetamt":-97926.56,"costprice":84.86,"costvalue":-97926.59},{"id":212,"selector":"Trade","tradedate":"28/04/2023","settdate":"02/05/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"IXC","description":"Bought IXC 2517shs@USD39.1938","ccy":"USD","qty":2517.0,"consideration":98650.72,"clientnetamt":-98650.72,"costprice":39.19,"costvalue":-98650.79},{"id":213,"selector":"Trade","tradedate":"27/07/2023","settdate":"31/07/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"JEPI","description":"Bought JEPI 1792shs@USD55.9262","ccy":"USD","qty":1792.0,"consideration":100219.8,"clientnetamt":-100219.8,"costprice":55.93,"costvalue":-100219.75},{"id":214,"selector":"Trade","tradedate":"17/11/2022","settdate":"21/11/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"ARKK","description":"Bought ARKK 2707shs@USD37.1363","ccy":"USD","qty":2707.0,"consideration":100527.99,"clientnetamt":-100628.52,"costprice":37.14,"costvalue":-100527.96},{"id":215,"selector":"Trade","tradedate":"01/06/2023","settdate":"05/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"VTI","description":"Sold VTI 240shs@USD180.5","ccy":"USD","qty":-240.0,"consideration":43320.0,"clientnetamt":43320.0,"costprice":-190.12,"costvalue":45628.79},{"id":216,"selector":"Cashflow","tradedate":"31/07/2023","settdate":"31/07/2023","clientId":"C00007630","accountId":"F00048105","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 07","ccy":"USD","qty":0.0,"consideration":0.5,"clientnetamt":-0.5,"costprice":0.0,"costvalue":0.0},{"id":217,"selector":"Cashflow","tradedate":"31/07/2023","settdate":"31/07/2023","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 07","ccy":"USD","qty":0.0,"consideration":15.15,"clientnetamt":-15.15,"costprice":0.0,"costvalue":0.0},{"id":218,"selector":"Cashflow","tradedate":"31/07/2023","settdate":"31/07/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 07","ccy":"USD","qty":0.0,"consideration":1832.33,"clientnetamt":-1832.33,"costprice":0.0,"costvalue":0.0},{"id":219,"selector":"Cashflow","tradedate":"31/07/2023","settdate":"31/07/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2023 07","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":220,"selector":"Trade","tradedate":"01/02/2021","settdate":"03/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"SGOV","description":"Bought SGOV 1057shs@USD100.0154","ccy":"USD","qty":1057.0,"consideration":105716.23,"clientnetamt":-105716.23,"costprice":100.02,"costvalue":-105721.14},{"id":221,"selector":"Dividend","tradedate":"31/07/2023","settdate":"31/07/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VHT","description":"CashDiv VHT @USD0.87739per shs","ccy":"USD","qty":0.0,"consideration":176.36,"clientnetamt":176.36,"costprice":0.0,"costvalue":176.36},{"id":222,"selector":"Dividend","tradedate":"31/07/2023","settdate":"31/07/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VGIT","description":"CashDiv VGIT @USD0.128405per shs","ccy":"USD","qty":0.0,"consideration":107.09,"clientnetamt":107.09,"costprice":0.0,"costvalue":107.09},{"id":223,"selector":"Dividend","tradedate":"31/07/2023","settdate":"31/07/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"JEPI","description":"CashDiv JEPI @USD0.359299per shs","ccy":"USD","qty":0.0,"consideration":538.95,"clientnetamt":538.95,"costprice":0.0,"costvalue":538.95},{"id":224,"selector":"Dividend","tradedate":"31/07/2023","settdate":"31/07/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BKCH","description":"CashDiv BKCH @USD0.191663per shs","ccy":"USD","qty":0.0,"consideration":649.26,"clientnetamt":649.26,"costprice":0.0,"costvalue":649.26},{"id":225,"selector":"Trade","tradedate":"27/07/2023","settdate":"31/07/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"SCHD","description":"Sold SCHD 680shs@USD75.9289","ccy":"USD","qty":-680.0,"consideration":51631.68,"clientnetamt":51631.68,"costprice":-72.63,"costvalue":49391.52},{"id":226,"selector":"Trade","tradedate":"20/09/2023","settdate":"22/09/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"AAAU","description":"Sold AAAU 2529shs@USD19.2063","ccy":"USD","qty":-2529.0,"consideration":48572.67,"clientnetamt":48572.67,"costprice":-19.9039,"costvalue":50336.96},{"id":227,"selector":"Trade","tradedate":"20/09/2023","settdate":"22/09/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"SGOL","description":"Sold SGOL 2624shs@USD18.5437","ccy":"USD","qty":-2624.0,"consideration":48658.68,"clientnetamt":48658.68,"costprice":-19.2171,"costvalue":50425.67},{"id":228,"selector":"Trade","tradedate":"01/02/2021","settdate":"03/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"PGJ","description":"Bought PGJ 1699shs@USD71.3726","ccy":"USD","qty":1699.0,"consideration":121262.1,"clientnetamt":-121262.1,"costprice":71.37,"costvalue":-121257.63},{"id":229,"selector":"Trade","tradedate":"01/02/2021","settdate":"03/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"TAN","description":"Bought TAN 1155shs@USD108.7858","ccy":"USD","qty":1155.0,"consideration":125647.65,"clientnetamt":-125647.65,"costprice":108.79,"costvalue":-125652.45},{"id":230,"selector":"Trade","tradedate":"22/08/2023","settdate":"24/08/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"TSLA","description":"Bought TSLA 531shs@USD237.8152","ccy":"USD","qty":531.0,"consideration":126279.89,"clientnetamt":-126279.89,"costprice":237.8152,"costvalue":-126279.87},{"id":231,"selector":"Trade","tradedate":"01/02/2021","settdate":"03/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"ARKK","description":"Bought ARKK 911shs@USD139.5961","ccy":"USD","qty":911.0,"consideration":127172.08,"clientnetamt":-127172.08,"costprice":139.6,"costvalue":-127175.6},{"id":232,"selector":"Trade","tradedate":"23/03/2023","settdate":"24/03/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"BTCC.U","description":"Sold BTCC.U 7900shs@USD5.0566","ccy":"USD","qty":-7900.0,"consideration":39947.0,"clientnetamt":39947.0,"costprice":-8.06,"costvalue":63670.84},{"id":233,"selector":"CorpAct","tradedate":"05/05/2023","settdate":"05/05/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"SMH","description":"CorpAction : SMH Split 2 for 1 ","ccy":"USD","qty":-280.0,"consideration":69885.8,"clientnetamt":69885.8,"costprice":-249.59,"costvalue":69885.79},{"id":234,"selector":"Trade","tradedate":"01/02/2021","settdate":"03/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"VCSH","description":"Bought VCSH 2122shs@USD83.0366","ccy":"USD","qty":2122.0,"consideration":176203.74,"clientnetamt":-176203.74,"costprice":83.04,"costvalue":-176210.88},{"id":235,"selector":"Trade","tradedate":"01/02/2021","settdate":"03/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"SCHP","description":"Bought SCHP 2836shs@USD62.1685","ccy":"USD","qty":2836.0,"consideration":176309.76,"clientnetamt":-176309.76,"costprice":62.17,"costvalue":-176314.12},{"id":236,"selector":"Trade","tradedate":"01/02/2021","settdate":"03/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"SCHO","description":"Bought SCHO 3432shs@USD51.3798","ccy":"USD","qty":3432.0,"consideration":176335.42,"clientnetamt":-176335.42,"costprice":51.38,"costvalue":-176336.16},{"id":237,"selector":"Trade","tradedate":"01/02/2021","settdate":"03/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"VWO","description":"Bought VWO 3372shs@USD52.6038","ccy":"USD","qty":3372.0,"consideration":177380.12,"clientnetamt":-177380.12,"costprice":52.6,"costvalue":-177367.2},{"id":238,"selector":"Dividend","tradedate":"31/08/2023","settdate":"31/08/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VGIT","description":"CashDiv VGIT @USD0.127602per shs","ccy":"USD","qty":0.0,"consideration":106.42,"clientnetamt":106.42,"costprice":0.0,"costvalue":106.42},{"id":239,"selector":"Dividend","tradedate":"31/08/2023","settdate":"31/08/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"JEPI","description":"CashDiv JEPI @USD0.29037per shs","ccy":"USD","qty":0.0,"consideration":955.9,"clientnetamt":955.9,"costprice":0.0,"costvalue":955.9},{"id":240,"selector":"Cashflow","tradedate":"31/08/2023","settdate":"31/08/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2023 08","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":241,"selector":"Cashflow","tradedate":"31/08/2023","settdate":"31/08/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 08","ccy":"USD","qty":0.0,"consideration":1743.54,"clientnetamt":-1743.54,"costprice":0.0,"costvalue":0.0},{"id":242,"selector":"Cashflow","tradedate":"31/08/2023","settdate":"31/08/2023","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 08","ccy":"USD","qty":0.0,"consideration":12.75,"clientnetamt":-12.75,"costprice":0.0,"costvalue":0.0},{"id":243,"selector":"Cashflow","tradedate":"31/08/2023","settdate":"31/08/2023","clientId":"C00007630","accountId":"F00048105","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 08","ccy":"USD","qty":0.0,"consideration":3.07,"clientnetamt":-3.07,"costprice":0.0,"costvalue":0.0},{"id":244,"selector":"Trade","tradedate":"21/06/2023","settdate":"23/06/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"VPL","description":"Sold VPL 1204shs@USD70.7703","ccy":"USD","qty":-1204.0,"consideration":85207.46,"clientnetamt":85207.46,"costprice":-75.53,"costvalue":90933.26},{"id":245,"selector":"Trade","tradedate":"01/02/2021","settdate":"03/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"BNDX","description":"Bought BNDX 3636shs@USD58.1552","ccy":"USD","qty":3636.0,"consideration":211452.15,"clientnetamt":-211452.15,"costprice":58.16,"costvalue":-211469.76},{"id":246,"selector":"Trade","tradedate":"22/08/2023","settdate":"24/08/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"VTI","description":"Sold VTI 549shs@USD218.7674","ccy":"USD","qty":-549.0,"consideration":120103.29,"clientnetamt":120103.29,"costprice":-189.2935,"costvalue":103922.1},{"id":247,"selector":"Trade","tradedate":"16/06/2021","settdate":"18/06/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"SGOV","description":"Sold SGOV 1088shs@USD100.0129","ccy":"USD","qty":-1088.0,"consideration":108814.06,"clientnetamt":108814.06,"costprice":-100.02,"costvalue":108816.84},{"id":248,"selector":"Trade","tradedate":"28/04/2023","settdate":"02/05/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"VPL","description":"Sold VPL 1485shs@USD67.8053","ccy":"USD","qty":-1485.0,"consideration":100690.91,"clientnetamt":100690.91,"costprice":-75.85,"costvalue":112639.92},{"id":249,"selector":"Trade","tradedate":"21/09/2021","settdate":"23/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"PGJ","description":"Sold PGJ 1699shs@USD42.7679","ccy":"USD","qty":-1699.0,"consideration":72662.63,"clientnetamt":72662.63,"costprice":-71.37,"costvalue":121257.63},{"id":250,"selector":"Trade","tradedate":"20/04/2023","settdate":"24/04/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"FDIS","description":"Sold FDIS 1548shs@USD64.5814","ccy":"USD","qty":-1548.0,"consideration":99971.95,"clientnetamt":99971.95,"costprice":-79.7,"costvalue":123368.63},{"id":251,"selector":"Trade","tradedate":"28/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"TAN","description":"Sold TAN 1155shs@USD80.0234","ccy":"USD","qty":-1155.0,"consideration":92427.0,"clientnetamt":92427.0,"costprice":-108.79,"costvalue":125652.45},{"id":252,"selector":"Trade","tradedate":"28/04/2023","settdate":"02/05/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"VWO","description":"Sold VWO 2534shs@USD40.1741","ccy":"USD","qty":-2534.0,"consideration":101801.11,"clientnetamt":101801.11,"costprice":-49.7,"costvalue":125931.94},{"id":253,"selector":"Trade","tradedate":"01/02/2021","settdate":"03/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"VPL","description":"Bought VPL 2755shs@USD80.1053","ccy":"USD","qty":2755.0,"consideration":220690.15,"clientnetamt":-220690.15,"costprice":80.11,"costvalue":-220703.05},{"id":254,"selector":"Trade","tradedate":"01/02/2021","settdate":"03/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"DBEU","description":"Bought DBEU 7901shs@USD30.1895","ccy":"USD","qty":7901.0,"consideration":238527.58,"clientnetamt":-238527.58,"costprice":30.19,"costvalue":-238531.19},{"id":255,"selector":"Trade","tradedate":"07/02/2022","settdate":"09/02/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"FDIS","description":"Bought FDIS 3732shs@USD80.2595","ccy":"USD","qty":3732.0,"consideration":299528.52,"clientnetamt":-299528.52,"costprice":80.26,"costvalue":-299528.45},{"id":256,"selector":"CorpAct","tradedate":"20/12/2022","settdate":"20/12/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"BKCH","description":"CorpAction : BKCH Split 1 for 4","ccy":"USD","qty":3387.5,"consideration":337152.74,"clientnetamt":-337152.74,"costprice":99.53,"costvalue":-337152.74},{"id":257,"selector":"Trade","tradedate":"07/10/2021","settdate":"12/10/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"BKCH","description":"Bought BKCH 13550shs@USD25.8506","ccy":"USD","qty":13550.0,"consideration":350275.16,"clientnetamt":-350275.16,"costprice":25.85,"costvalue":-350275.63},{"id":258,"selector":"Trade","tradedate":"09/03/2021","settdate":"11/03/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"VTI","description":"Bought VTI 1785shs@USD202.6432","ccy":"USD","qty":1785.0,"consideration":361718.13,"clientnetamt":-361718.13,"costprice":202.64,"costvalue":-361718.13},{"id":259,"selector":"Trade","tradedate":"17/11/2022","settdate":"21/11/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"VTI","description":"Sold VTI 917shs@USD196.7732","ccy":"USD","qty":-917.0,"consideration":180441.06,"clientnetamt":180260.62,"costprice":-192.76,"costvalue":176762.01},{"id":260,"selector":"Trade","tradedate":"06/10/2021","settdate":"08/10/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"VCSH","description":"Sold VCSH 2181shs@USD82.3056","ccy":"USD","qty":-2181.0,"consideration":179508.62,"clientnetamt":179508.62,"costprice":-82.39,"costvalue":179687.59},{"id":261,"selector":"Trade","tradedate":"09/03/2021","settdate":"11/03/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"SCHO","description":"Sold SCHO 3528shs@USD51.2753","ccy":"USD","qty":-3528.0,"consideration":180899.37,"clientnetamt":180899.37,"costprice":-51.38,"costvalue":181267.68},{"id":262,"selector":"Trade","tradedate":"09/03/2021","settdate":"11/03/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"SCHP","description":"Sold SCHP 2946shs@USD60.9681","ccy":"USD","qty":-2946.0,"consideration":179612.15,"clientnetamt":179612.15,"costprice":-62.14,"costvalue":183068.12},{"id":263,"selector":"Trade","tradedate":"06/10/2021","settdate":"08/10/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"BNDX","description":"Sold BNDX 3783shs@USD56.817","ccy":"USD","qty":-3783.0,"consideration":214938.66,"clientnetamt":214938.66,"costprice":-57.88,"costvalue":218972.32},{"id":264,"selector":"Trade","tradedate":"07/02/2022","settdate":"09/02/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"VTI","description":"Sold VTI 1323shs@USD226.7069","ccy":"USD","qty":-1323.0,"consideration":299933.16,"clientnetamt":299933.16,"costprice":-195.01,"costvalue":258003.51},{"id":265,"selector":"Trade","tradedate":"20/04/2023","settdate":"24/04/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"VTI","description":"Sold VTI 1462shs@USD205.1759","ccy":"USD","qty":-1462.0,"consideration":299967.15,"clientnetamt":299967.15,"costprice":-191.83,"costvalue":280456.47},{"id":266,"selector":"CorpAct","tradedate":"20/12/2022","settdate":"20/12/2022","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"BKCH","description":"CorpAction : BKCH Split 1 for 4","ccy":"USD","qty":-13550.0,"consideration":337152.74,"clientnetamt":337152.74,"costprice":-24.88,"costvalue":337152.74},{"id":267,"selector":"Trade","tradedate":"01/02/2021","settdate":"03/02/2021","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"VTI","description":"Bought VTI 3242shs@USD195.2932","ccy":"USD","qty":3242.0,"consideration":633140.68,"clientnetamt":-633140.68,"costprice":195.29,"costvalue":-633130.18},{"id":268,"selector":"Trade","tradedate":"19/10/2023","settdate":"23/10/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"BUY","ticker":"MSTR","description":"Bought MSTR 405shs@USD330.1284","ccy":"USD","qty":405.0,"consideration":133702.0,"clientnetamt":-133702.0,"costprice":330.1284,"costvalue":-133702.0},{"id":269,"selector":"Trade","tradedate":"19/10/2023","settdate":"23/10/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SELL","ticker":"ARKK","description":"Sold ARKK 3618shs@USD37.2404","ccy":"USD","qty":-3618.0,"consideration":134735.78,"clientnetamt":134735.78,"costprice":-62.7393,"costvalue":226990.64},{"id":270,"selector":"Dividend","tradedate":"30/09/2023","settdate":"30/09/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"XLP","description":"CashDiv XLP @USD0.485219per shs","ccy":"USD","qty":0.0,"consideration":321.7,"clientnetamt":321.7,"costprice":0.0,"costvalue":321.7},{"id":271,"selector":"Dividend","tradedate":"30/09/2023","settdate":"30/09/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"JEPI","description":"CashDiv JEPI @USD0.338171per shs","ccy":"USD","qty":0.0,"consideration":1113.26,"clientnetamt":1113.26,"costprice":0.0,"costvalue":1113.26},{"id":272,"selector":"Dividend","tradedate":"30/09/2023","settdate":"30/09/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"FDIS","description":"CashDiv FDIS @USD0.143997per shs","ccy":"USD","qty":0.0,"consideration":314.49,"clientnetamt":314.49,"costprice":0.0,"costvalue":314.49},{"id":273,"selector":"Dividend","tradedate":"30/09/2023","settdate":"30/09/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"XLE","description":"CashDiv XLE @USD0.673609per shs","ccy":"USD","qty":0.0,"consideration":777.34,"clientnetamt":777.34,"costprice":0.0,"costvalue":777.34},{"id":274,"selector":"Dividend","tradedate":"30/09/2023","settdate":"30/09/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI @USD0.7984per shs","ccy":"USD","qty":0.0,"consideration":362.47,"clientnetamt":362.47,"costprice":0.0,"costvalue":362.47},{"id":275,"selector":"Dividend","tradedate":"30/09/2023","settdate":"30/09/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VWO","description":"CashDiv VWO @USD0.3275per shs","ccy":"USD","qty":0.0,"consideration":238.43,"clientnetamt":238.43,"costprice":0.0,"costvalue":238.43},{"id":276,"selector":"Dividend","tradedate":"30/09/2023","settdate":"30/09/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VGIT","description":"CashDiv VGIT @USD0.1353per shs","ccy":"USD","qty":0.0,"consideration":112.84,"clientnetamt":112.84,"costprice":0.0,"costvalue":112.84},{"id":277,"selector":"Cashflow","tradedate":"30/09/2023","settdate":"30/09/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2023 09","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":278,"selector":"Cashflow","tradedate":"30/09/2023","settdate":"30/09/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 09","ccy":"USD","qty":0.0,"consideration":1705.4,"clientnetamt":-1705.4,"costprice":0.0,"costvalue":0.0},{"id":279,"selector":"Cashflow","tradedate":"30/09/2023","settdate":"30/09/2023","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 09","ccy":"USD","qty":0.0,"consideration":11.15,"clientnetamt":-11.15,"costprice":0.0,"costvalue":0.0},{"id":280,"selector":"Cashflow","tradedate":"30/09/2023","settdate":"30/09/2023","clientId":"C00007630","accountId":"F00048105","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 09","ccy":"USD","qty":0.0,"consideration":3.07,"clientnetamt":-3.07,"costprice":0.0,"costvalue":0.0},{"id":281,"selector":"Dividend","tradedate":"31/10/2023","settdate":"31/10/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"JEPI","description":"CashDiv JEPI @USD0.363329per shs","ccy":"USD","qty":0.0,"consideration":1196.08,"clientnetamt":1196.08,"costprice":0.0,"costvalue":1196.08},{"id":282,"selector":"Dividend","tradedate":"31/10/2023","settdate":"31/10/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VGIT","description":"CashDiv VGIT @USD0.137998per shs","ccy":"USD","qty":0.0,"consideration":115.09,"clientnetamt":115.09,"costprice":0.0,"costvalue":115.09},{"id":283,"selector":"Dividend","tradedate":"31/10/2023","settdate":"31/10/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VHT","description":"CashDiv VHT @USD0.87739per shs","ccy":"USD","qty":0.0,"consideration":176.36,"clientnetamt":176.36,"costprice":0.0,"costvalue":176.36},{"id":284,"selector":"Cashflow","tradedate":"31/10/2023","settdate":"31/10/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2023 10","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":285,"selector":"Cashflow","tradedate":"31/10/2023","settdate":"31/10/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 10","ccy":"USD","qty":0.0,"consideration":1642.11,"clientnetamt":-1642.11,"costprice":0.0,"costvalue":0.0},{"id":286,"selector":"Cashflow","tradedate":"31/10/2023","settdate":"31/10/2023","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 10","ccy":"USD","qty":0.0,"consideration":10.48,"clientnetamt":-10.48,"costprice":0.0,"costvalue":0.0},{"id":287,"selector":"Cashflow","tradedate":"31/10/2023","settdate":"31/10/2023","clientId":"C00007630","accountId":"F00048105","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 10","ccy":"USD","qty":0.0,"consideration":3.06,"clientnetamt":-3.06,"costprice":0.0,"costvalue":0.0},{"id":288,"selector":"Dividend","tradedate":"06/11/2023","settdate":"06/11/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"JEPI","description":"Cash Dividend JEPI  @USD0.36 per share","ccy":"USD","qty":0.0,"consideration":1181.56,"clientnetamt":1181.56,"costprice":0.0,"costvalue":0.0},{"id":289,"selector":"Dividend","tradedate":"06/11/2023","settdate":"06/11/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VGIT","description":"Cash Dividend VGIT  @USD0.15 per share","ccy":"USD","qty":0.0,"consideration":124.6,"clientnetamt":124.6,"costprice":0.0,"costvalue":0.0},{"id":290,"selector":"Dividend","tradedate":"06/11/2023","settdate":"06/11/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"JEPI","description":"W/H Tax JEPI","ccy":"USD","qty":0.0,"consideration":354.468,"clientnetamt":-354.468,"costprice":0.0,"costvalue":0.0},{"id":291,"selector":"Dividend","tradedate":"06/11/2023","settdate":"06/11/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"VGIT","description":"W/H Tax VGIT","ccy":"USD","qty":0.0,"consideration":37.38,"clientnetamt":-37.38,"costprice":0.0,"costvalue":0.0},{"id":292,"selector":"Cashflow","tradedate":"30/11/2023","settdate":"30/11/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2023 11","ccy":"USD","qty":0.0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0.0,"costvalue":0.0},{"id":293,"selector":"Cashflow","tradedate":"30/11/2023","settdate":"30/11/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 11","ccy":"USD","qty":0.0,"consideration":1845.86,"clientnetamt":-1845.86,"costprice":0.0,"costvalue":0.0},{"id":294,"selector":"Cashflow","tradedate":"30/11/2023","settdate":"30/11/2023","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 11","ccy":"USD","qty":0.0,"consideration":12.93,"clientnetamt":-12.93,"costprice":0.0,"costvalue":0.0},{"id":295,"selector":"Cashflow","tradedate":"30/11/2023","settdate":"30/11/2023","clientId":"C00007630","accountId":"F00048105","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 11","ccy":"USD","qty":0.0,"consideration":3.06,"clientnetamt":-3.06,"costprice":0.0,"costvalue":0.0},{"id":296,"selector":"Cashflow","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"SR Fee","ticker":"Cash-USD","description":"Surrender Rebate Recharges 2023 12 01-13","ccy":"USD","qty":0.0,"consideration":263.09,"clientnetamt":-263.09,"costprice":0.0,"costvalue":0.0},{"id":297,"selector":"Dividend","tradedate":"06/12/2023","settdate":"06/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"JEPI","description":"Cash Dividend JEPI @USD0.39 per share","ccy":"USD","qty":0.0,"consideration":1284.7,"clientnetamt":1284.7,"costprice":0.0,"costvalue":0.0},{"id":298,"selector":"Dividend","tradedate":"06/12/2023","settdate":"06/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VGIT","description":"Cash Dividend VGIT @USD0.16 per share","ccy":"USD","qty":0.0,"consideration":131.94,"clientnetamt":131.94,"costprice":0.0,"costvalue":0.0},{"id":299,"selector":"Cashflow","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 12 01-13","ccy":"USD","qty":0.0,"consideration":864.91,"clientnetamt":-864.91,"costprice":0.0,"costvalue":0.0},{"id":300,"selector":"Cashflow","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00040552","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 12 01-13","ccy":"USD","qty":0.0,"consideration":6.73,"clientnetamt":-6.73,"costprice":0.0,"costvalue":0.0},{"id":301,"selector":"Cashflow","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00048105","clientName":"Paul Dawson","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 12 01-13","ccy":"USD","qty":0.0,"consideration":1.33,"clientnetamt":-1.33,"costprice":0.0,"costvalue":0.0},{"id":302,"selector":"Dividend","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"BKCH","description":"Dividend Adjustment - BKCH","ccy":"USD","qty":0.0,"consideration":0.01,"clientnetamt":0.01,"costprice":0.0,"costvalue":0.01},{"id":303,"selector":"Dividend","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"DBEU","description":"Dividend Adjustment - DBEU","ccy":"USD","qty":0.0,"consideration":0.05,"clientnetamt":0.05,"costprice":0.0,"costvalue":0.05},{"id":304,"selector":"Dividend","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"SCHO","description":"Dividend Adjustment - SCHO","ccy":"USD","qty":0.0,"consideration":0.01,"clientnetamt":-0.01,"costprice":0.0,"costvalue":0.01},{"id":305,"selector":"Dividend","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"SMH","description":"Dividend Adjustment - SMH","ccy":"USD","qty":0.0,"consideration":0.03,"clientnetamt":0.03,"costprice":0.0,"costvalue":0.03},{"id":306,"selector":"Dividend","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VCSH","description":"Dividend Adjustment - VCSH","ccy":"USD","qty":0.0,"consideration":0.01,"clientnetamt":-0.01,"costprice":0.0,"costvalue":0.01},{"id":307,"selector":"Dividend","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VGIT","description":"Dividend Adjustment - VGIT","ccy":"USD","qty":0.0,"consideration":0.01,"clientnetamt":-0.01,"costprice":0.0,"costvalue":0.01},{"id":308,"selector":"Dividend","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VHT","description":"Dividend Adjustment - VHT","ccy":"USD","qty":0.0,"consideration":0.01,"clientnetamt":-0.01,"costprice":0.0,"costvalue":0.01},{"id":309,"selector":"Dividend","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VPL","description":"Dividend Adjustment - VPL","ccy":"USD","qty":0.0,"consideration":0.02,"clientnetamt":0.02,"costprice":0.0,"costvalue":0.02},{"id":310,"selector":"Dividend","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VTI","description":"Dividend Adjustment - VTI","ccy":"USD","qty":0.0,"consideration":0.21,"clientnetamt":0.21,"costprice":0.0,"costvalue":0.21},{"id":311,"selector":"Dividend","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"VWO","description":"Dividend Adjustment - VWO","ccy":"USD","qty":0.0,"consideration":0.01,"clientnetamt":-0.01,"costprice":0.0,"costvalue":0.01},{"id":312,"selector":"Dividend","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"Dividend","ticker":"XLE","description":"Dividend Adjustment - XLE","ccy":"USD","qty":0.0,"consideration":0.01,"clientnetamt":0.01,"costprice":0.0,"costvalue":0.01},{"id":313,"selector":"Dividend","tradedate":"13/12/2023","settdate":"13/12/2023","clientId":"C00007630","accountId":"F00047041","clientName":"Paul Dawson","txtype":"FEE","ticker":"CASH-USD","description":"W/H TAX REVERSAL","ccy":"USD","qty":0.0,"consideration":391.85,"clientnetamt":391.85,"costprice":0.0,"costvalue":0.0}];


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
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:18,fontWeight:600,color:C.navy}}>{title}</div>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:C.faint,lineHeight:1}}>x</button>
      </div>
      {children}
    </div>
  </div>
);

// --- NAV ---------------------------------------------------------------------
const CCYSelector = ({selectedCcy, onChange}) => (
  <div style={{display:"flex",alignItems:"center",gap:2,background:"rgba(255,255,255,0.08)",borderRadius:7,padding:"2px 3px"}}>
    {["USD","GBP","EUR"].map(c=>(
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
        <div onClick={()=>handleNav("dashboard")} style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?16:20,fontWeight:700,color:C.white,marginRight:isMobile?10:24,flexShrink:0,cursor:"pointer"}}>
          <span style={{color:C.teal}}>i-</span>Convergence
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
const Dashboard = ({setSection, setSelectedClient, selectedCcy, clients: propClients, valuations: propValuations, lastUpdated, dataError, onRefresh}) => {
  const isMobile = useIsMobile();
  const sym = CCY_SYMBOLS[selectedCcy] || "$";
  const clients = propClients || CLIENTS;
  const valuations = propValuations || VALUATIONS;
  const totalAUM = Object.values(valuations).reduce((s,v) => s + convertAmount(v.totalAssetValuation, "USD", selectedCcy), 0);
  const totalCash = Object.values(valuations).reduce((s,v) => s + convertAmount(v.totalCashBalance, "USD", selectedCcy), 0);
  const totalLiabilities = Object.values(valuations).reduce((s,v) => s + convertAmount(v.totalLiabilities, "USD", selectedCcy), 0);

  return (
    <div style={{padding:isMobile?"14px 12px":24}}>
      <div style={{marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:3,textTransform:"uppercase",color:C.teal,marginBottom:3}}>Platform overview</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?20:26,fontWeight:700,color:C.navy}}>Aggregate Dashboard</div>
          {lastUpdated && <div style={{fontSize:11,color:C.faint,marginTop:3}}>Last synced: {new Date(lastUpdated).toLocaleString()}</div>}
          {dataError && <div style={{fontSize:11,color:C.red,marginTop:3}}>Data error: {dataError} — showing cached data</div>}
        </div>
        {onRefresh && <button onClick={onRefresh} style={{background:C.teal,color:C.white,border:"none",borderRadius:6,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",gap:6}}>↻ Refresh data</button>}
      </div>

      <div style={{background:C.navy,borderRadius:12,padding:isMobile?"16px":24,marginBottom:14,display:"flex",flexWrap:"wrap",gap:16,justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:5}}>Total AUM ({selectedCcy})</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?28:36,fontWeight:700,color:C.white,letterSpacing:-1}}>{sym}{fmt(totalAUM,0)}</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:4}}>Net of {sym}{fmt(totalLiabilities,0)} liabilities</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[
            {label:"Active clients", value:clients.length.toString()},
            {label:"Cash balance", value:sym+fmt(totalCash,0)},
            {label:"Total liabilities", value:sym+fmt(totalLiabilities,0)},
            {label:"Verified", value:CLIENTS.filter(c=>c.verified).length+" of "+CLIENTS.length},
          ].map(s=>(
            <div key={s.label} style={{background:C.navyMid,border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:4}}>{s.label}</div>
              <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:18,fontWeight:600,color:C.white}}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(280px,1fr))",gap:12,marginBottom:14}}>
        {clients.map(c => {
          const val = valuations[c.id];
          const aum = val ? convertAmount(val.totalAssetValuation, "USD", selectedCcy) : 0;
          const liab = val ? convertAmount(val.totalLiabilities, "USD", selectedCcy) : 0;
          const net = aum - liab;
          return (
            <div key={c.id} onClick={()=>{setSelectedClient(c.id);setSection("clients");}}
              style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:12,padding:18,cursor:"pointer",transition:"border-color 0.15s",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=C.teal}
              onMouseLeave={e=>e.currentTarget.style.borderColor=C.silver}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:38,height:38,borderRadius:"50%",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:13,fontWeight:700}}>
                    {c.name.split(" ").map(n=>n[0]).join("")}
                  </div>
                  <div>
                    <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:14,fontWeight:600,color:C.navy}}>{c.name}</div>
                    <div style={{fontSize:10,color:C.faint}}>{c.primaryCode}</div>
                  </div>
                </div>
                <Badge color={c.verified?"success":"warning"}>{c.verified?"Verified":"Pending"}</Badge>
              </div>
              <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:22,fontWeight:700,color:C.navy,letterSpacing:-0.5,marginBottom:4}}>{sym}{fmt(aum,0)}</div>
              <div style={{fontSize:12,color:C.faint}}>Net: {sym}{fmt(net,0)} after liabilities</div>
              <div style={{marginTop:10,fontSize:11,color:C.teal,fontWeight:600}}>View portfolio &rarr;</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- CLIENT DETAIL -----------------------------------------------------------
const ClientDetail = ({clientId, onBack, selectedCcy, setPreviewClient, holdings: propHoldings, withdrawals: propWithdrawals, distributions: propDistributions, txns: propTxns, valuations: propValuations, clients: propClients, liveDocuments}) => {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("valuation");
  const [search, setSearch] = useState("");
  const [txFilter, setTxFilter] = useState("all");
  const sym = CCY_SYMBOLS[selectedCcy] || "$";

  const clientsSource = propClients || CLIENTS;
  const client = clientsSource.find(c => c.id === clientId);
  const val = (propValuations || VALUATIONS)[clientId];
  const holdings = (propHoldings || HOLDINGS)[clientId] || [];
  const withdrawals = (propWithdrawals || WITHDRAWALS)[clientId] || [];
  const distributions = (propDistributions || DISTRIBUTIONS)[clientId] || [];
  const allTxns = propTxns || TXNS;
  const txns = allTxns.filter(t => t.clientId === clientId);

  const filteredTxns = useMemo(() => {
    let d = txns;
    if (txFilter !== "all") d = d.filter(t => t.selector.toLowerCase() === txFilter || t.txtype.toLowerCase() === txFilter);
    if (search) d = d.filter(t => [t.description, t.ticker, t.txtype].some(v => v && v.toLowerCase().includes(search.toLowerCase())));
    return d;
  }, [txns, txFilter, search]);

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
            <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?18:22,fontWeight:700,color:C.white}}>{client.name}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>{client.primaryCode} · {client.reportingCcy} · {client.jurisdiction}</div>
          </div>
        </div>
        {val && (
          <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)"}}>Asset Valuation</div>
              <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:20,fontWeight:700,color:C.white}}>{sym}{fmt(convertAmount(val.totalAssetValuation,"USD",selectedCcy),0)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)"}}>Cash</div>
              <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:20,fontWeight:700,color:C.teal}}>{sym}{fmt(convertAmount(val.totalCashBalance,"USD",selectedCcy),0)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)"}}>Liabilities</div>
              <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:20,fontWeight:700,color:C.red}}>{sym}{fmt(convertAmount(val.totalLiabilities,"USD",selectedCcy),0)}</div>
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
          {[
            {label:"Total Valuation Notice", value:sym+fmt(convertAmount(val.totalValuationNotice,"USD",selectedCcy),2)},
            {label:"Total Brite Assets", value:sym+fmt(convertAmount(val.totalBriteAssets,"USD",selectedCcy),2)},
            {label:"Total Asset Valuation", value:sym+fmt(convertAmount(val.totalAssetValuation,"USD",selectedCcy),2)},
            {label:"Total Cash Balance", value:sym+fmt(convertAmount(val.totalCashBalance,"USD",selectedCcy),2)},
            {label:"Pension Valuation", value:sym+fmt(convertAmount(val.pensionValuation,"USD",selectedCcy),2)},
            {label:"Pension Cash Balance", value:sym+fmt(convertAmount(val.pensionCash,"USD",selectedCcy),2)},
            {label:"Direct Investment Cash", value:sym+fmt(convertAmount(val.directInvestmentCash,"USD",selectedCcy),2)},
            {label:"Direct Investment Assets", value:sym+fmt(convertAmount(val.directInvestmentAssets,"USD",selectedCcy),2)},
            {label:"Total Liabilities", value:sym+fmt(convertAmount(val.totalLiabilities,"USD",selectedCcy),2), red:true},
            {label:"Surrender Rebate Payable", value:sym+fmt(convertAmount(val.surrenderRebatePayable,"USD",selectedCcy),2), red:true},
          ].map(row=>(
            <div key={row.label} style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,color:C.faint}}>{row.label}</div>
              <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:16,fontWeight:600,color:row.red?C.red:C.navy}}>{row.value}</div>
            </div>
          ))}
        </div>
      )}

      {tab==="holdings" && (
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:700}}>
            <thead>
              <tr style={{borderBottom:"1.5px solid "+C.silver,background:C.silver}}>
                {["Holding","Account","Shares","Purchase Price","Market Value","Gain / Loss","% Change"].map(h=>(
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
                  <td style={{padding:"10px 12px",fontWeight:600,color:C.navy}}>{h.marketValue}</td>
                  <td style={{padding:"10px 12px",color:posColor(h.pctChange)}}>{h.gainLoss}</td>
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
            <span style={{fontFamily:"Space Grotesk,sans-serif",fontSize:16,fontWeight:700,color:C.navy}}>${fmt(withdrawals.reduce((s,w)=>s+w.actualPaid,0),2)}</span>
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
                  <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:16,fontWeight:700,color:C.navy}}>{dist.name}</div>
                  <div style={{fontSize:12,color:C.faint}}>Date: {dist.date} · {dist.payments.length} payment{dist.payments.length!==1?"s":""}</div>
                </div>
                <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:20,fontWeight:700,color:C.navy}}>
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
                      <td style={{padding:"10px 12px",fontWeight:600,color:C.navy,fontFamily:"Space Grotesk,sans-serif"}}>${fmt(p.amount,2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {tab==="documents" && (
        <DocumentsTab clientId={clientId} isAdviser={true} liveDocuments={liveDocuments}/>
      )}

      {tab==="crm" && (
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(2,1fr)",gap:20}}>
          <div style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:20}}>
            <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:14,fontWeight:600,color:C.navy,marginBottom:14}}>Client Details</div>
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
            <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:14,fontWeight:600,color:C.navy,marginBottom:14}}>Bank Details</div>
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
  const clients = propClients || CLIENTS;
  const valuations = propValuations || VALUATIONS;

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
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?20:24,fontWeight:600,color:C.navy}}>All Clients</div>
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
                  <td style={{padding:"12px 12px",fontWeight:600,color:C.navy,fontFamily:"Space Grotesk,sans-serif"}}>{val?sym+fmt(convertAmount(val.totalAssetValuation,"USD",selectedCcy),0):"--"}</td>
                  <td style={{padding:"12px 12px",color:C.green,fontWeight:600}}>{val?sym+fmt(convertAmount(val.totalCashBalance,"USD",selectedCcy),0):"--"}</td>
                  <td style={{padding:"12px 12px",color:C.red,fontWeight:600}}>{val?sym+fmt(convertAmount(val.totalLiabilities,"USD",selectedCcy),0):"--"}</td>
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
  const total = allWithdrawals.reduce((s,w)=>s+convertAmount(w.actualPaid,"USD",selectedCcy),0);

  return (
    <div style={{padding:24}}>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:3,textTransform:"uppercase",color:C.teal,marginBottom:3}}>Processed Withdrawals</div>
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:24,fontWeight:600,color:C.navy}}>Withdrawal History</div>
      </div>
      <div style={{background:C.navy,borderRadius:10,padding:"16px 20px",marginBottom:20,display:"inline-block"}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:4}}>Total Paid Out</div>
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:28,fontWeight:700,color:C.white}}>{sym}{fmt(total,2)}</div>
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
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:22,fontWeight:600,color:C.navy}}>Connect external apps</div>
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
                      <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:13,fontWeight:600,color:C.navy}}>{app.name}</div>
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
      <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:28,fontWeight:700,color:C.white,marginBottom:6}}>
        <span style={{color:C.teal}}>i-</span>Convergence
      </div>
      <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:32}}>Wealth Management Platform</div>
      {error && <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#FCA5A5"}}>{error}</div>}
      <button onClick={onLogin} disabled={loading} style={{width:"100%",background:C.teal,color:C.white,border:"none",borderRadius:8,padding:"13px 20px",fontSize:15,fontWeight:600,cursor:loading?"not-allowed":"pointer",fontFamily:"Space Grotesk,sans-serif",opacity:loading?0.7:1}}>
        {loading?"Signing in...":"Sign in"}
      </button>
      <div style={{marginTop:16,fontSize:11,color:"rgba(255,255,255,0.25)"}}>Secured by Auth0 MFA</div>
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

  if (!clientId) return null;

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
    <div style={{width:"100%"}}>
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
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:14,fontWeight:600,color:C.navy,marginBottom:12}}>Upload Document</div>
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
const ClientPortal = ({user, logout, selectedCcy, setCcy, isPreview, holdings: propHoldings, valuations: propValuations, withdrawals: propWithdrawals, distributions: propDistributions, txns: propTxns, liveDocuments, clients: propClients, previewClientObj}) => {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("valuation");
  const [search, setSearch] = useState("");
  const [txFilter, setTxFilter] = useState("all");
  const sym = CCY_SYMBOLS[selectedCcy] || "$";

  // Find client by Auth0 clientId claim or default to first client for demo
  const clientsSource = propClients || CLIENTS;
  const client = previewClientObj || clientsSource.find(c => c.id === user?.clientId) || clientsSource[0];
  const clientId = client?.id;
  const val = (propValuations || VALUATIONS)[clientId];
  const holdings = (propHoldings || HOLDINGS)[clientId] || [];
  const withdrawals = (propWithdrawals || WITHDRAWALS)[clientId] || [];
  const distributions = (propDistributions || DISTRIBUTIONS)[clientId] || [];
  const allTxns = propTxns || TXNS;
  const txns = allTxns.filter(t => t.clientId === clientId);

  const filteredTxns = useMemo(() => {
    let d = txns;
    if (txFilter !== "all") d = d.filter(t => t.selector.toLowerCase() === txFilter || t.txtype.toLowerCase() === txFilter);
    if (search) d = d.filter(t => [t.description, t.ticker, t.txtype].some(v => v && v.toLowerCase().includes(search.toLowerCase())));
    return d;
  }, [txns, txFilter, search]);

  if (!client) return <div style={{padding:24,color:C.faint}}>No client account found.</div>;

  const tabs = [["valuation","Valuation"],["holdings","Holdings"],["transactions","Transactions"],["withdrawals","Withdrawals"],["distribution","Distribution"],["documents","Documents"]];

  return (
    <div style={{fontFamily:"'Inter',sans-serif",background:"#F2F5F9",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      {/* Client Nav */}
      <div style={{background:C.navy,display:"flex",alignItems:"center",padding:"0 16px",height:54,position:"sticky",top:0,zIndex:200,borderBottom:"1px solid rgba(0,184,176,0.15)"}}>
        <div onClick={()=>setTab("valuation")} style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?16:20,fontWeight:700,color:C.white,marginRight:"auto",cursor:"pointer"}}>
          <span style={{color:C.teal}}>i-</span>Convergence
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
              <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?18:22,fontWeight:700,color:C.white}}>{client.name}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>{client.primaryCode} · {client.reportingCcy} · {client.jurisdiction}</div>
            </div>
          </div>
          {val && (
            <div style={{display:"flex",gap:isMobile?12:20,flexWrap:"wrap"}}>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)"}}>Portfolio Value</div>
                <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?18:22,fontWeight:700,color:C.white}}>{sym}{fmt(convertAmount(val.totalAssetValuation,"USD",selectedCcy),0)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)"}}>Cash</div>
                <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?18:22,fontWeight:700,color:C.teal}}>{sym}{fmt(convertAmount(val.totalCashBalance,"USD",selectedCcy),0)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Summary cards */}
        {val && (
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:18}}>
            {[
              {label:"Total Valuation", value:sym+fmt(convertAmount(val.totalValuationNotice,"USD",selectedCcy),0), color:C.navy},
              {label:"Asset Value", value:sym+fmt(convertAmount(val.totalAssetValuation,"USD",selectedCcy),0), color:C.navy},
              {label:"Cash Balance", value:sym+fmt(convertAmount(val.totalCashBalance,"USD",selectedCcy),0), color:C.green},
              {label:"Liabilities", value:sym+fmt(convertAmount(val.totalLiabilities,"USD",selectedCcy),0), color:C.red},
            ].map(card=>(
              <div key={card.label} style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.faint,marginBottom:6}}>{card.label}</div>
                <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:18,fontWeight:700,color:card.color}}>{card.value}</div>
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
              {label:"Total Valuation Notice", value:sym+fmt(convertAmount(val.totalValuationNotice,"USD",selectedCcy),2)},
              {label:"Total Brite Assets", value:sym+fmt(convertAmount(val.totalBriteAssets,"USD",selectedCcy),2)},
              {label:"Total Asset Valuation", value:sym+fmt(convertAmount(val.totalAssetValuation,"USD",selectedCcy),2)},
              {label:"Total Cash Balance", value:sym+fmt(convertAmount(val.totalCashBalance,"USD",selectedCcy),2)},
              {label:"Pension Valuation", value:sym+fmt(convertAmount(val.pensionValuation,"USD",selectedCcy),2)},
              {label:"Pension Cash Balance", value:sym+fmt(convertAmount(val.pensionCash,"USD",selectedCcy),2)},
              {label:"Direct Investment Cash", value:sym+fmt(convertAmount(val.directInvestmentCash,"USD",selectedCcy),2)},
              {label:"Direct Investment Assets", value:sym+fmt(convertAmount(val.directInvestmentAssets,"USD",selectedCcy),2)},
              {label:"Total Liabilities", value:sym+fmt(convertAmount(val.totalLiabilities,"USD",selectedCcy),2), red:true},
              {label:"Surrender Rebate Payable", value:sym+fmt(convertAmount(val.surrenderRebatePayable,"USD",selectedCcy),2), red:true},
            ].map(row=>(
              <div key={row.label} style={{background:C.white,border:"0.5px solid "+C.silver,borderRadius:10,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:13,color:C.faint}}>{row.label}</div>
                <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:16,fontWeight:600,color:row.red?C.red:C.navy}}>{row.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Holdings Tab */}
        {tab==="holdings" && (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:isMobile?600:700}}>
              <thead>
                <tr style={{borderBottom:"1.5px solid "+C.silver,background:C.silver}}>
                  {["Holding","Account","Shares","Purchase Price","Market Value","Gain / Loss","% Change"].map(h=>(
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
                    <td style={{padding:"10px 12px",fontWeight:600,color:C.navy}}>{h.marketValue}</td>
                    <td style={{padding:"10px 12px",color:posColor(h.pctChange)}}>{h.gainLoss}</td>
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
                <span style={{fontFamily:"Space Grotesk,sans-serif",fontSize:16,fontWeight:700,color:C.navy}}>${fmt(withdrawals.reduce((s,w)=>s+w.actualPaid,0),2)}</span>
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
                    <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:16,fontWeight:700,color:C.navy}}>{dist.name}</div>
                    <div style={{fontSize:12,color:C.faint}}>Date: {dist.date} · {dist.payments.length} payment{dist.payments.length!==1?"s":""}</div>
                  </div>
                  <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:22,fontWeight:700,color:C.navy}}>
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
                        <td style={{padding:"10px 10px",fontWeight:600,color:C.navy,fontFamily:"Space Grotesk,sans-serif"}}>${fmt(p.amount,2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

        {/* Documents Tab */}
        {tab==="documents" && (
          <DocumentsTab clientId={clientId} isAdviser={false} liveDocuments={liveDocuments}/>
        )}
    </div>
  );
};

// --- APP ---------------------------------------------------------------------
export default function App() {
  const {user, loading: authLoading, error: authError, login, logout} = useAuth();
  const {data: liveData, loading: dataLoading, error: dataError, lastUpdated, refresh} = useOneDriveData();
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
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:28,fontWeight:700,color:C.white,marginBottom:20}}><span style={{color:C.teal}}>i-</span>Convergence</div>
        <div style={{width:32,height:32,border:"3px solid rgba(0,184,176,0.3)",borderTop:"3px solid "+C.teal,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto"}}/>
      </div>
    </div>
  );

  if (!user) return <LoginScreen onLogin={login} loading={loading} error={error}/>;

  // Adviser previewing client view
  if (previewClient) { const previewClientObj = clients.find(c=>c.id===previewClient); return <ClientPortal user={{...user, clientId: previewClient}} logout={()=>setPreviewClient(null)} selectedCcy={selectedCcy} setCcy={setSelectedCcy} isPreview={true} holdings={holdings} valuations={valuations} withdrawals={withdrawals} distributions={distributions} txns={txns} liveDocuments={liveDocuments} clients={clients} previewClientObj={previewClientObj}/>; }

  // Client role - show client portal only
  if (user.isClient && !user.isAdviser) return <ClientPortal user={user} logout={logout} selectedCcy={selectedCcy} setCcy={setSelectedCcy} holdings={holdings} valuations={valuations} withdrawals={withdrawals} distributions={distributions} txns={txns} liveDocuments={liveDocuments} clients={clients}/>;

  return (
    <div style={{fontFamily:"'Inter',sans-serif",background:"#F2F5F9",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <Nav section={section} setSection={handleSection} selectedCcy={selectedCcy} setCcy={setSelectedCcy} user={user} logout={logout}/>
      <div style={{flex:1,overflowY:"auto",paddingBottom:isMobile?68:0}}>
        {section==="dashboard" && <Dashboard setSection={handleSection} setSelectedClient={setSelectedClient} selectedCcy={selectedCcy} clients={clients} valuations={valuations} lastUpdated={lastUpdated} dataError={dataError} onRefresh={refresh}/>}
        {section==="clients" && <ClientsList selectedClient={selectedClient} setSelectedClient={setSelectedClient} selectedCcy={selectedCcy} setPreviewClient={setPreviewClient} clients={clients} valuations={valuations} holdings={holdings} withdrawals={withdrawals} distributions={distributions} txns={txns} liveDocuments={liveDocuments}/>}
        {section==="withdrawals" && <WithdrawalsPage selectedCcy={selectedCcy} withdrawals={withdrawals} clients={clients}/>}
        {section==="connect" && <Connect/>}
      </div>
    </div>
  );
}
