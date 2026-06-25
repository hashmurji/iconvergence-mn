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
    clientId: "STM-346521/03-Dn",
    accountNumber: "F00048105",
    primaryCode: "346521-Dn",
    name: "Don Nuttal",
    reportingCcy: "USD",
    bankAccount: "12345678",
    bankSort: "01-00-01",
    bankName: "Don Nuttal",
    email: "dn@hotmail.com",
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
    { name: "VANECK BIOTECH ETF", purchasePrice: "USD 195.41", marketValue: "USD 29,966.24", gainLoss: "USD -5,988.65", pctChange: -16.66, account: "STM Malta / RL360", shares: 184, ccy: "USD" },
    { name: "VANGUARD HEALTH CARE ETF", purchasePrice: "USD 245.57", marketValue: "USD 49,962.57", gainLoss: "USD 602.26", pctChange: 1.22, account: "STM Malta / RL360", shares: 201, ccy: "USD" },
    { name: "VANECK SEMICONDUCTOR", purchasePrice: "USD 63.39", marketValue: "USD 40,488.56", gainLoss: "USD 25,401.35", pctChange: 168.36, account: "STM Malta / RL360", shares: 238, ccy: "USD" },
    { name: "VANGUARD TOTAL STOCK MKT ETF", purchasePrice: "USD 197.90", marketValue: "USD 106,344.96", gainLoss: "USD 16,497.91", pctChange: 18.36, account: "STM Malta / RL360", shares: 454, ccy: "USD" },
    { name: "CONSUMER STAPLES SPDR", purchasePrice: "USD 75.85", marketValue: "USD 47,934.90", gainLoss: "USD -2,352.19", pctChange: -4.68, account: "STM Malta / RL360", shares: 663, ccy: "USD" },
    { name: "VANGUARD FTSE EMERGING MARKETS", purchasePrice: "USD 52.60", marketValue: "USD 29,680.56", gainLoss: "USD -8,612.24", pctChange: -22.49, account: "STM Malta / RL360", shares: 728, ccy: "USD" },
    { name: "VANGUARD INTERMEDIATE-TERM TREASURY", purchasePrice: "USD 59.85", marketValue: "USD 49,180.98", gainLoss: "USD -730.75", pctChange: -1.46, account: "STM Malta / RL360", shares: 834, ccy: "USD" },
    { name: "MICROSTRATEGY INC-CL A", purchasePrice: "USD 320.18", marketValue: "USD 492,240.00", gainLoss: "USD 223,287.99", pctChange: 83.02, account: "STM Malta / RL360", shares: 840, ccy: "USD" },
    { name: "TESLA INC", purchasePrice: "USD 202.09", marketValue: "USD 257,476.04", gainLoss: "USD 40,028.62", pctChange: 18.41, account: "STM Malta / RL360", shares: 1076, ccy: "USD" },
    { name: "PURPOSE BITCOIN ETF", purchasePrice: "USD 8.06", marketValue: "USD 8,624.00", gainLoss: "USD -241.56", pctChange: -2.72, account: "STM Malta / RL360", shares: 1100, ccy: "USD" },
    { name: "ENERGY SELECT SECTOR SPDR", purchasePrice: "USD 84.86", marketValue: "USD 95,008.82", gainLoss: "USD -2,917.77", pctChange: -2.98, account: "STM Malta / RL360", shares: 1154, ccy: "USD" },
    { name: "BITWISE CRYPTO IND INNOV ETF", purchasePrice: "USD 28.15", marketValue: "USD 17,710.56", gainLoss: "USD -31,943.92", pctChange: -64.33, account: "Fair Fund", shares: 1764, ccy: "USD" },
    { name: "FIDELITY CON DISCRET ETF", purchasePrice: "USD 80.26", marketValue: "USD 169,260.00", gainLoss: "USD -6,026.75", pctChange: -3.44, account: "STM Malta / RL360", shares: 2184, ccy: "USD" },
    { name: "ISHARES GLOBAL ENERGY ETF", purchasePrice: "USD 39.19", marketValue: "USD 97,307.22", gainLoss: "USD -1,343.57", pctChange: -1.36, account: "STM Malta / RL360", shares: 2517, ccy: "USD" },
    { name: "JPMORGAN EQUITY PREMIUM INCOME", purchasePrice: "USD 55.37", marketValue: "USD 181,948.84", gainLoss: "USD -343.86", pctChange: -0.19, account: "STM Malta / RL360", shares: 3292, ccy: "USD" },
    { name: "GLOBAL X BLOCKCHAIN ETF", purchasePrice: "USD 11.49", marketValue: "USD 134,178.88", gainLoss: "USD 95,259.36", pctChange: 244.76, account: "STM Malta / RL360", shares: 3387.5, ccy: "USD" },
    { name: "PURPOSE ETHER ETF", purchasePrice: "USD 13.06", marketValue: "USD 69,230.00", gainLoss: "USD -22,201.20", pctChange: -24.28, account: "STM Malta / RL360", shares: 7000, ccy: "USD" },
    { name: "XTRACKERS MSCI EUROPE HEDGED", purchasePrice: "USD 30.19", marketValue: "USD 269,013.08", gainLoss: "USD 53,240.72", pctChange: 24.67, account: "STM Malta / RL360", shares: 7147, ccy: "USD" },
    { name: "VANECK DIGITAL TRANSFORMATION", purchasePrice: "USD 6.19", marketValue: "USD 233,809.50", gainLoss: "USD 63,638.47", pctChange: 37.4, account: "STM Malta / RL360", shares: 27507, ccy: "USD" },
  ],
};

const WITHDRAWALS = {
  "C00007630": [
    { dateRequested: "2024-02-02", currency: "USD", requestedAmount: 25060.00, actualPaid: 25060.00, paymentDate: "2024-02-16", type: "Lump Sum" },
    { dateRequested: "2024-10-05", currency: "USD", requestedAmount: 50040.00, actualPaid: 50040.00, paymentDate: "2024-12-07", type: "Lump Sum" },
    { dateRequested: "2024-11-12", currency: "USD", requestedAmount: 50040.00, actualPaid: 50040.00, paymentDate: "2025-06-02", type: "Lump Sum" },
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
const TXNS = [
{"id":0,"selector":"Cashflow","tradedate":"27/07/2023","settdate":"27/07/2023","clientId":"C00007630","accountId":"F00048105","txtype":"Deposit","ticker":"CASH-USD","description":"Initial Deposit - Fair Fund","ccy":"USD","qty":0,"consideration":3683.18,"clientnetamt":3683.18,"costprice":0,"costvalue":0},
{"id":1,"selector":"Cashflow","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2023 06","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":2,"selector":"Cashflow","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 06","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":3,"selector":"Cashflow","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 06","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":4,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLP","description":"CashDiv XLP @USD0.526033per shs","ccy":"USD","qty":0,"consideration":348.76,"clientnetamt":348.76,"costprice":0,"costvalue":348.76},
{"id":5,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLE","description":"CashDiv XLE @USD0.705843per shs","ccy":"USD","qty":0,"consideration":814.54,"clientnetamt":814.54,"costprice":0,"costvalue":814.54},
{"id":6,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"JEPI","description":"CashDiv JEPI @USD0.481433per shs","ccy":"USD","qty":0,"consideration":1583.51,"clientnetamt":1583.51,"costprice":0,"costvalue":1583.51},
{"id":7,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"VGT","description":"CashDiv VGT @USD1.1905per shs","ccy":"USD","qty":0,"consideration":0,"clientnetamt":0,"costprice":0,"costvalue":0},
{"id":8,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"VHT","description":"CashDiv VHT @USD0.826per shs","ccy":"USD","qty":0,"consideration":165.2,"clientnetamt":165.2,"costprice":0,"costvalue":165.2},
{"id":9,"selector":"Dividend","tradedate":"30/06/2023","settdate":"30/06/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI @USD0.8265per shs","ccy":"USD","qty":0,"consideration":344.35,"clientnetamt":344.35,"costprice":0,"costvalue":344.35},
{"id":10,"selector":"Dividend","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLE","description":"CashDiv XLE @USD0.724843per shs","ccy":"USD","qty":0,"consideration":836.07,"clientnetamt":836.07,"costprice":0,"costvalue":836.07},
{"id":11,"selector":"Dividend","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLP","description":"CashDiv XLP @USD0.542548per shs","ccy":"USD","qty":0,"consideration":359.51,"clientnetamt":359.51,"costprice":0,"costvalue":359.51},
{"id":12,"selector":"Dividend","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"JEPI","description":"CashDiv JEPI @USD0.547265per shs","ccy":"USD","qty":0,"consideration":1799.2,"clientnetamt":1799.2,"costprice":0,"costvalue":1799.2},
{"id":13,"selector":"Dividend","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"VHT","description":"CashDiv VHT @USD0.1459per shs","ccy":"USD","qty":0,"consideration":29.18,"clientnetamt":29.18,"costprice":0,"costvalue":29.18},
{"id":14,"selector":"Dividend","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI @USD0.7862per shs","ccy":"USD","qty":0,"consideration":327.71,"clientnetamt":327.71,"costprice":0,"costvalue":327.71},
{"id":15,"selector":"Cashflow","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2023 03","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":16,"selector":"Cashflow","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 03","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":17,"selector":"Cashflow","tradedate":"31/03/2023","settdate":"31/03/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 03","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":18,"selector":"Cashflow","tradedate":"08/06/2023","settdate":"08/06/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Withdrawal","ticker":"CASH-USD","description":"Withdrawal - PCLS","ccy":"USD","qty":0,"consideration":50100.0,"clientnetamt":-50100.0,"costprice":0,"costvalue":0},
{"id":19,"selector":"Cashflow","tradedate":"28/02/2023","settdate":"28/02/2023","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2023 02","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":20,"selector":"Cashflow","tradedate":"28/02/2023","settdate":"28/02/2023","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 02","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":21,"selector":"Cashflow","tradedate":"28/02/2023","settdate":"28/02/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 02","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":22,"selector":"Cashflow","tradedate":"31/01/2023","settdate":"31/01/2023","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2023 01","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":23,"selector":"Cashflow","tradedate":"31/01/2023","settdate":"31/01/2023","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 01","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":24,"selector":"Trade","tradedate":"19/02/2021","settdate":"23/02/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"DBEU","description":"Bought DBEU 5shs@USD31.1688","ccy":"USD","qty":5,"consideration":155.84,"clientnetamt":-155.84,"costprice":31.17,"costvalue":-155.85},
{"id":25,"selector":"Cashflow","tradedate":"31/01/2023","settdate":"31/01/2023","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2023 01","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":26,"selector":"Dividend","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLE","description":"CashDiv XLE @USD0.7462per shs","ccy":"USD","qty":0,"consideration":861.07,"clientnetamt":861.07,"costprice":0,"costvalue":861.07},
{"id":27,"selector":"Dividend","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLP","description":"CashDiv XLP @USD0.5568per shs","ccy":"USD","qty":0,"consideration":369.0,"clientnetamt":369.0,"costprice":0,"costvalue":369.0},
{"id":28,"selector":"Dividend","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"JEPI","description":"CashDiv JEPI @USD0.5703per shs","ccy":"USD","qty":0,"consideration":1874.19,"clientnetamt":1874.19,"costprice":0,"costvalue":1874.19},
{"id":29,"selector":"Dividend","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI @USD0.9305per shs","ccy":"USD","qty":0,"consideration":388.0,"clientnetamt":388.0,"costprice":0,"costvalue":388.0},
{"id":30,"selector":"Cashflow","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2022 12","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":31,"selector":"Cashflow","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 12","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":32,"selector":"Cashflow","tradedate":"31/12/2022","settdate":"31/12/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 12","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":33,"selector":"Trade","tradedate":"09/12/2022","settdate":"13/12/2022","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"JEPI","description":"Rebalance - BUY JEPI 400shs@USD54.04","ccy":"USD","qty":400,"consideration":21616.0,"clientnetamt":-21616.0,"costprice":54.04,"costvalue":-21616.0},
{"id":34,"selector":"Trade","tradedate":"09/12/2022","settdate":"13/12/2022","clientId":"C00007630","accountId":"F00047041","txtype":"SELL","ticker":"SMH","description":"Rebalance - SELL SMH 35shs@USD221.77","ccy":"USD","qty":-35,"consideration":7761.95,"clientnetamt":7761.95,"costprice":63.39,"costvalue":2218.65},
{"id":35,"selector":"Cashflow","tradedate":"09/12/2022","settdate":"09/12/2022","clientId":"C00007630","accountId":"F00040552","txtype":"Withdrawal","ticker":"CASH-USD","description":"Withdrawal - One Off","ccy":"USD","qty":0,"consideration":12000.0,"clientnetamt":-12000.0,"costprice":0,"costvalue":0},
{"id":36,"selector":"Cashflow","tradedate":"30/11/2022","settdate":"30/11/2022","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2022 11","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":37,"selector":"Cashflow","tradedate":"30/11/2022","settdate":"30/11/2022","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 11","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":38,"selector":"Cashflow","tradedate":"30/11/2022","settdate":"30/11/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 11","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":39,"selector":"Dividend","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLE","description":"CashDiv XLE @USD0.7799per shs","ccy":"USD","qty":0,"consideration":900.34,"clientnetamt":900.34,"costprice":0,"costvalue":900.34},
{"id":40,"selector":"Dividend","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLP","description":"CashDiv XLP @USD0.5248per shs","ccy":"USD","qty":0,"consideration":347.94,"clientnetamt":347.94,"costprice":0,"costvalue":347.94},
{"id":41,"selector":"Dividend","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"JEPI","description":"CashDiv JEPI @USD0.4902per shs","ccy":"USD","qty":0,"consideration":1043.58,"clientnetamt":1043.58,"costprice":0,"costvalue":1043.58},
{"id":42,"selector":"Dividend","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"VTI","description":"CashDiv VTI @USD0.7955per shs","ccy":"USD","qty":0,"consideration":331.45,"clientnetamt":331.45,"costprice":0,"costvalue":331.45},
{"id":43,"selector":"Cashflow","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2022 09","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":44,"selector":"Cashflow","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 09","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":45,"selector":"Cashflow","tradedate":"30/09/2022","settdate":"30/09/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 09","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":46,"selector":"Trade","tradedate":"14/09/2022","settdate":"16/09/2022","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"GBTC","description":"Bought GBTC 200shs@USD13.35","ccy":"USD","qty":200,"consideration":2670.0,"clientnetamt":-2670.0,"costprice":13.35,"costvalue":-2670.0},
{"id":47,"selector":"Trade","tradedate":"14/09/2022","settdate":"16/09/2022","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"JEPI","description":"Bought JEPI 1000shs@USD53.24","ccy":"USD","qty":1000,"consideration":53240.0,"clientnetamt":-53240.0,"costprice":53.24,"costvalue":-53240.0},
{"id":48,"selector":"Trade","tradedate":"14/09/2022","settdate":"16/09/2022","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"XLE","description":"Bought XLE 500shs@USD84.86","ccy":"USD","qty":500,"consideration":42430.0,"clientnetamt":-42430.0,"costprice":84.86,"costvalue":-42430.0},
{"id":49,"selector":"Trade","tradedate":"14/09/2022","settdate":"16/09/2022","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"XLP","description":"Bought XLP 500shs@USD75.85","ccy":"USD","qty":500,"consideration":37925.0,"clientnetamt":-37925.0,"costprice":75.85,"costvalue":-37925.0},
{"id":50,"selector":"Trade","tradedate":"14/09/2022","settdate":"16/09/2022","clientId":"C00007630","accountId":"F00047041","txtype":"SELL","ticker":"VGT","description":"Sold VGT 35shs@USD350.79","ccy":"USD","qty":-35,"consideration":12277.65,"clientnetamt":12277.65,"costprice":250.0,"costvalue":8750.0},
{"id":51,"selector":"Cashflow","tradedate":"31/08/2022","settdate":"31/08/2022","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2022 08","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":52,"selector":"Cashflow","tradedate":"31/08/2022","settdate":"31/08/2022","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 08","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":53,"selector":"Cashflow","tradedate":"31/08/2022","settdate":"31/08/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 08","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":54,"selector":"Cashflow","tradedate":"09/12/2022","settdate":"09/12/2022","clientId":"C00007630","accountId":"F00040552","txtype":"Withdrawal","ticker":"CASH-USD","description":"Withdrawal - One Off","ccy":"USD","qty":0,"consideration":12000.0,"clientnetamt":-12000.0,"costprice":0,"costvalue":0},
{"id":55,"selector":"Dividend","tradedate":"30/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLE","description":"CashDiv XLE @USD1.3459per shs","ccy":"USD","qty":0,"consideration":768.17,"clientnetamt":768.17,"costprice":0,"costvalue":768.17},
{"id":56,"selector":"Dividend","tradedate":"30/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLP","description":"CashDiv XLP @USD0.5363per shs","ccy":"USD","qty":0,"consideration":355.48,"clientnetamt":355.48,"costprice":0,"costvalue":355.48},
{"id":57,"selector":"Cashflow","tradedate":"30/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2022 06","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":58,"selector":"Cashflow","tradedate":"30/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 06","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":59,"selector":"Cashflow","tradedate":"30/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 06","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":60,"selector":"Trade","tradedate":"28/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"IXC","description":"Bought IXC 1000shs@USD38.38","ccy":"USD","qty":1000,"consideration":38380.0,"clientnetamt":-38380.0,"costprice":38.38,"costvalue":-38380.0},
{"id":61,"selector":"Trade","tradedate":"28/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"XLE","description":"Bought XLE 154shs@USD84.86","ccy":"USD","qty":154,"consideration":13068.44,"clientnetamt":-13068.44,"costprice":84.86,"costvalue":-13068.44},
{"id":62,"selector":"Trade","tradedate":"28/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","txtype":"SELL","ticker":"BITQ","description":"Sold BITQ 2000shs@USD5.52","ccy":"USD","qty":-2000,"consideration":11040.0,"clientnetamt":11040.0,"costprice":28.15,"costvalue":56300.0},
{"id":63,"selector":"Trade","tradedate":"28/06/2022","settdate":"30/06/2022","clientId":"C00007630","accountId":"F00047041","txtype":"SELL","ticker":"GBTC","description":"Sold GBTC 900shs@USD13.62","ccy":"USD","qty":-900,"consideration":12258.0,"clientnetamt":12258.0,"costprice":13.35,"costvalue":12015.0},
{"id":64,"selector":"Cashflow","tradedate":"31/05/2022","settdate":"31/05/2022","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2022 05","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":65,"selector":"Cashflow","tradedate":"31/05/2022","settdate":"31/05/2022","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 05","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":66,"selector":"Cashflow","tradedate":"31/05/2022","settdate":"31/05/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 05","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":67,"selector":"Dividend","tradedate":"31/03/2022","settdate":"31/03/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLP","description":"CashDiv XLP @USD0.4698per shs","ccy":"USD","qty":0,"consideration":311.33,"clientnetamt":311.33,"costprice":0,"costvalue":311.33},
{"id":68,"selector":"Cashflow","tradedate":"31/03/2022","settdate":"31/03/2022","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2022 03","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":69,"selector":"Cashflow","tradedate":"31/03/2022","settdate":"31/03/2022","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 03","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":70,"selector":"Cashflow","tradedate":"31/03/2022","settdate":"31/03/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 03","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":71,"selector":"Cashflow","tradedate":"28/02/2022","settdate":"28/02/2022","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2022 02","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":72,"selector":"Cashflow","tradedate":"28/02/2022","settdate":"28/02/2022","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 02","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":73,"selector":"Cashflow","tradedate":"28/02/2022","settdate":"28/02/2022","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2022 02","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":74,"selector":"Dividend","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLP","description":"CashDiv XLP @USD0.5268per shs","ccy":"USD","qty":0,"consideration":349.07,"clientnetamt":349.07,"costprice":0,"costvalue":349.07},
{"id":75,"selector":"Cashflow","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2021 12","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":76,"selector":"Cashflow","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2021 12","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":77,"selector":"Cashflow","tradedate":"31/12/2021","settdate":"31/12/2021","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2021 12","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":78,"selector":"Trade","tradedate":"16/12/2021","settdate":"20/12/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"SMH","description":"Bought SMH 200shs@USD258.62","ccy":"USD","qty":200,"consideration":51724.0,"clientnetamt":-51724.0,"costprice":258.62,"costvalue":-51724.0},
{"id":79,"selector":"Trade","tradedate":"16/12/2021","settdate":"20/12/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"BITQ","description":"Bought BITQ 2000shs@USD28.15","ccy":"USD","qty":2000,"consideration":56300.0,"clientnetamt":-56300.0,"costprice":28.15,"costvalue":-56300.0},
{"id":80,"selector":"Trade","tradedate":"16/12/2021","settdate":"20/12/2021","clientId":"C00007630","accountId":"F00047041","txtype":"SELL","ticker":"BITX","description":"Sold BITX 1600shs@USD25.86","ccy":"USD","qty":-1600,"consideration":41376.0,"clientnetamt":41376.0,"costprice":24.26,"costvalue":38816.0},
{"id":81,"selector":"Trade","tradedate":"16/12/2021","settdate":"20/12/2021","clientId":"C00007630","accountId":"F00047041","txtype":"SELL","ticker":"GBTC","description":"Sold GBTC 700shs@USD29.08","ccy":"USD","qty":-700,"consideration":20356.0,"clientnetamt":20356.0,"costprice":13.35,"costvalue":9345.0},
{"id":82,"selector":"Trade","tradedate":"16/12/2021","settdate":"20/12/2021","clientId":"C00007630","accountId":"F00047041","txtype":"SELL","ticker":"MSTR","description":"Sold MSTR 200shs@USD348.41","ccy":"USD","qty":-200,"consideration":69682.0,"clientnetamt":69682.0,"costprice":320.18,"costvalue":64036.0},
{"id":83,"selector":"Trade","tradedate":"19/02/2021","settdate":"23/02/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"SGOV","description":"Bought SGOV 31shs@USD100.0180","ccy":"USD","qty":31,"consideration":3100.56,"clientnetamt":-3100.56,"costprice":100.02,"costvalue":-3100.62},
{"id":84,"selector":"Cashflow","tradedate":"30/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2021 09","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":85,"selector":"Cashflow","tradedate":"30/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2021 09","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":86,"selector":"Cashflow","tradedate":"30/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2021 09","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":87,"selector":"Dividend","tradedate":"30/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLP","description":"CashDiv XLP @USD0.4317per shs","ccy":"USD","qty":0,"consideration":286.09,"clientnetamt":286.09,"costprice":0,"costvalue":286.09},
{"id":88,"selector":"Trade","tradedate":"28/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"MSTR","description":"Bought MSTR 200shs@USD320.18","ccy":"USD","qty":200,"consideration":64036.0,"clientnetamt":-64036.0,"costprice":320.18,"costvalue":-64036.0},
{"id":89,"selector":"Trade","tradedate":"28/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"TSLA","description":"Bought TSLA 200shs@USD769.26","ccy":"USD","qty":200,"consideration":153852.0,"clientnetamt":-153852.0,"costprice":769.26,"costvalue":-153852.0},
{"id":90,"selector":"Trade","tradedate":"28/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"BITX","description":"Bought BITX 1600shs@USD24.26","ccy":"USD","qty":1600,"consideration":38816.0,"clientnetamt":-38816.0,"costprice":24.26,"costvalue":-38816.0},
{"id":91,"selector":"Trade","tradedate":"28/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"GBTC","description":"Bought GBTC 1800shs@USD34.31","ccy":"USD","qty":1800,"consideration":61758.0,"clientnetamt":-61758.0,"costprice":34.31,"costvalue":-61758.0},
{"id":92,"selector":"Trade","tradedate":"28/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","txtype":"SELL","ticker":"DBEU","description":"Sold DBEU 5shs@USD32.79","ccy":"USD","qty":-5,"consideration":163.95,"clientnetamt":163.95,"costprice":31.17,"costvalue":155.85},
{"id":93,"selector":"Trade","tradedate":"28/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","txtype":"SELL","ticker":"SGOV","description":"Sold SGOV 31shs@USD100.02","ccy":"USD","qty":-31,"consideration":3100.62,"clientnetamt":3100.62,"costprice":100.02,"costvalue":3100.62},
{"id":94,"selector":"Trade","tradedate":"28/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","txtype":"SELL","ticker":"VTI","description":"Sold VTI 100shs@USD236.07","ccy":"USD","qty":-100,"consideration":23607.0,"clientnetamt":23607.0,"costprice":197.9,"costvalue":19790.0},
{"id":95,"selector":"Trade","tradedate":"28/09/2021","settdate":"30/09/2021","clientId":"C00007630","accountId":"F00047041","txtype":"SELL","ticker":"VHT","description":"Sold VHT 160shs@USD252.9","ccy":"USD","qty":-160,"consideration":40464.0,"clientnetamt":40464.0,"costprice":245.57,"costvalue":39291.2},
{"id":96,"selector":"Cashflow","tradedate":"30/06/2021","settdate":"30/06/2021","clientId":"C00007630","accountId":"F00047041","txtype":"SR Fee","ticker":"CASH-USD","description":"Surrender Rebate Recharge 2021 06","ccy":"USD","qty":0,"consideration":627.36,"clientnetamt":-627.36,"costprice":0,"costvalue":0},
{"id":97,"selector":"Cashflow","tradedate":"30/06/2021","settdate":"30/06/2021","clientId":"C00007630","accountId":"F00040552","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2021 06","ccy":"USD","qty":0,"consideration":11.33,"clientnetamt":-11.33,"costprice":0,"costvalue":0},
{"id":98,"selector":"Cashflow","tradedate":"30/06/2021","settdate":"30/06/2021","clientId":"C00007630","accountId":"F00047041","txtype":"Fee","ticker":"Cash-USD","description":"Advisory Fee 2021 06","ccy":"USD","qty":0,"consideration":1694.22,"clientnetamt":-1694.22,"costprice":0,"costvalue":0},
{"id":99,"selector":"Dividend","tradedate":"30/06/2021","settdate":"30/06/2021","clientId":"C00007630","accountId":"F00047041","txtype":"Dividend","ticker":"XLP","description":"CashDiv XLP @USD0.3793per shs","ccy":"USD","qty":0,"consideration":166.95,"clientnetamt":166.95,"costprice":0,"costvalue":166.95},
{"id":100,"selector":"Trade","tradedate":"23/06/2021","settdate":"25/06/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"VTI","description":"Bought VTI 100shs@USD197.9","ccy":"USD","qty":100,"consideration":19790.0,"clientnetamt":-19790.0,"costprice":197.9,"costvalue":-19790.0},
{"id":101,"selector":"Trade","tradedate":"23/06/2021","settdate":"25/06/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"VHT","description":"Bought VHT 200shs@USD245.57","ccy":"USD","qty":200,"consideration":49114.0,"clientnetamt":-49114.0,"costprice":245.57,"costvalue":-49114.0},
{"id":102,"selector":"Trade","tradedate":"23/06/2021","settdate":"25/06/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"VGT","description":"Bought VGT 35shs@USD350.0","ccy":"USD","qty":35,"consideration":12250.0,"clientnetamt":-12250.0,"costprice":350.0,"costvalue":-12250.0},
{"id":103,"selector":"Trade","tradedate":"23/06/2021","settdate":"25/06/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"XLP","description":"Bought XLP 163shs@USD75.85","ccy":"USD","qty":163,"consideration":12363.55,"clientnetamt":-12363.55,"costprice":75.85,"costvalue":-12363.55},
{"id":104,"selector":"Trade","tradedate":"23/06/2021","settdate":"25/06/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"XLE","description":"Bought XLE 346shs@USD57.27","ccy":"USD","qty":346,"consideration":19815.42,"clientnetamt":-19815.42,"costprice":57.27,"costvalue":-19815.42},
{"id":105,"selector":"Trade","tradedate":"23/06/2021","settdate":"25/06/2021","clientId":"C00007630","accountId":"F00047041","txtype":"BUY","ticker":"SMH","description":"Bought SMH 100shs@USD265.0","ccy":"USD","qty":100,"consideration":26500.0,"clientnetamt":-26500.0,"costprice":265.0,"costvalue":-26500.0},
{"id":106,"selector":"Cashflow","tradedate":"19/02/2021","settdate":"19/02/2021","clientId":"C00007630","accountId":"F00047041","txtype":"SR","ticker":"CASH-USD","description":"Surrender Rebate","ccy":"USD","qty":0,"consideration":208779.93,"clientnetamt":208779.93,"costprice":0,"costvalue":0},
{"id":107,"selector":"Cashflow","tradedate":"19/02/2021","settdate":"19/02/2021","clientId":"C00007630","accountId":"F00047041","txtype":"Deposit","ticker":"CASH-USD","description":"Initial Deposit","ccy":"USD","qty":0,"consideration":1533348.06,"clientnetamt":1533348.06,"costprice":0,"costvalue":0},
{"id":108,"selector":"Cashflow","tradedate":"01/02/2021","settdate":"01/02/2021","clientId":"C00007630","accountId":"F00040552","txtype":"Deposit","ticker":"CASH-USD","description":"Initial Deposit","ccy":"USD","qty":0,"consideration":83683.18,"clientnetamt":83683.18,"costprice":0,"costvalue":0},
];

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
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?16:20,fontWeight:700,color:C.white,marginRight:isMobile?10:24,flexShrink:0}}>
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
const Dashboard = ({setSection, setSelectedClient, selectedCcy}) => {
  const isMobile = useIsMobile();
  const sym = CCY_SYMBOLS[selectedCcy] || "$";
  const totalAUM = Object.values(VALUATIONS).reduce((s,v) => s + convertAmount(v.totalAssetValuation, "USD", selectedCcy), 0);
  const totalCash = Object.values(VALUATIONS).reduce((s,v) => s + convertAmount(v.totalCashBalance, "USD", selectedCcy), 0);
  const totalLiabilities = Object.values(VALUATIONS).reduce((s,v) => s + convertAmount(v.totalLiabilities, "USD", selectedCcy), 0);

  return (
    <div style={{padding:isMobile?"14px 12px":24}}>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:3,textTransform:"uppercase",color:C.teal,marginBottom:3}}>Platform overview</div>
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?20:26,fontWeight:700,color:C.navy}}>Aggregate Dashboard</div>
      </div>

      <div style={{background:C.navy,borderRadius:12,padding:isMobile?"16px":24,marginBottom:14,display:"flex",flexWrap:"wrap",gap:16,justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.38)",marginBottom:5}}>Total AUM ({selectedCcy})</div>
          <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?28:36,fontWeight:700,color:C.white,letterSpacing:-1}}>{sym}{fmt(totalAUM,0)}</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:4}}>Net of {sym}{fmt(totalLiabilities,0)} liabilities</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[
            {label:"Active clients", value:CLIENTS.length.toString()},
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
        {CLIENTS.map(c => {
          const val = VALUATIONS[c.id];
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
const ClientDetail = ({clientId, onBack, selectedCcy, setPreviewClient}) => {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("valuation");
  const [search, setSearch] = useState("");
  const [txFilter, setTxFilter] = useState("all");
  const sym = CCY_SYMBOLS[selectedCcy] || "$";

  const client = CLIENTS.find(c => c.id === clientId);
  const val = VALUATIONS[clientId];
  const holdings = HOLDINGS[clientId] || [];
  const withdrawals = WITHDRAWALS[clientId] || [];
  const distributions = DISTRIBUTIONS[clientId] || [];
  const txns = TXNS.filter(t => t.clientId === clientId);

  const filteredTxns = useMemo(() => {
    let d = txns;
    if (txFilter !== "all") d = d.filter(t => t.selector.toLowerCase() === txFilter || t.txtype.toLowerCase() === txFilter);
    if (search) d = d.filter(t => [t.description, t.ticker, t.txtype].some(v => v && v.toLowerCase().includes(search.toLowerCase())));
    return d;
  }, [txns, txFilter, search]);

  if (!client) return <div style={{padding:24}}>Client not found</div>;

  const tabs = [["valuation","Valuation"],["holdings","Holdings"],["transactions","Transactions"],["withdrawals","Withdrawals"],["distribution","Distribution"],["crm","CRM"]];

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
const ClientsList = ({selectedClient, setSelectedClient, selectedCcy, setPreviewClient}) => {
  const [search, setSearch] = useState("");
  const isMobile = useIsMobile();
  const sym = CCY_SYMBOLS[selectedCcy] || "$";

  if (selectedClient) {
    return <ClientDetail clientId={selectedClient} onBack={()=>setSelectedClient(null)} selectedCcy={selectedCcy} setPreviewClient={setPreviewClient}/>;
  }

  const filtered = CLIENTS.filter(c =>
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
      <div style={{fontSize:12,color:C.faint,marginBottom:12}}>{filtered.length} client{filtered.length!==1?"s":""}</div>
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
              const val = VALUATIONS[c.id];
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
const WithdrawalsPage = ({selectedCcy}) => {
  const sym = CCY_SYMBOLS[selectedCcy] || "$";
  const allWithdrawals = Object.entries(WITHDRAWALS).flatMap(([clientId, wds]) =>
    wds.map(w => ({ ...w, clientId, clientName: CLIENTS.find(c=>c.id===clientId)?.name || clientId }))
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


// --- CLIENT PORTAL ----------------------------------------------------------
const ClientPortal = ({user, logout, selectedCcy, setCcy}) => {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("valuation");
  const [search, setSearch] = useState("");
  const [txFilter, setTxFilter] = useState("all");
  const sym = CCY_SYMBOLS[selectedCcy] || "$";

  // Find client by Auth0 clientId claim or default to first client for demo
  const client = CLIENTS.find(c => c.id === user?.clientId) || CLIENTS[0];
  const clientId = client?.id;
  const val = VALUATIONS[clientId];
  const holdings = HOLDINGS[clientId] || [];
  const withdrawals = WITHDRAWALS[clientId] || [];
  const distributions = DISTRIBUTIONS[clientId] || [];
  const txns = TXNS.filter(t => t.clientId === clientId);

  const filteredTxns = useMemo(() => {
    let d = txns;
    if (txFilter !== "all") d = d.filter(t => t.selector.toLowerCase() === txFilter || t.txtype.toLowerCase() === txFilter);
    if (search) d = d.filter(t => [t.description, t.ticker, t.txtype].some(v => v && v.toLowerCase().includes(search.toLowerCase())));
    return d;
  }, [txns, txFilter, search]);

  if (!client) return <div style={{padding:24,color:C.faint}}>No client account found.</div>;

  const tabs = [["valuation","Valuation"],["holdings","Holdings"],["transactions","Transactions"],["withdrawals","Withdrawals"],["distribution","Distribution"]];

  return (
    <div style={{fontFamily:"'Inter',sans-serif",background:"#F2F5F9",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      {/* Client Nav */}
      <div style={{background:C.navy,display:"flex",alignItems:"center",padding:"0 16px",height:54,position:"sticky",top:0,zIndex:200,borderBottom:"1px solid rgba(0,184,176,0.15)"}}>
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:isMobile?16:20,fontWeight:700,color:C.white,marginRight:"auto"}}>
          <span style={{color:C.teal}}>i-</span>Convergence
        </div>
        <CCYSelector selectedCcy={selectedCcy} onChange={setCcy}/>
        <div style={{width:32,height:32,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontSize:12,fontWeight:600,marginLeft:12,cursor:"pointer"}} title={user?.email}>
          {client.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
        </div>
        {!isMobile && <button onClick={logout} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.6)",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"'Inter',sans-serif",marginLeft:10}}>Sign out</button>}
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
    </div>
  );
};

// --- APP ---------------------------------------------------------------------
export default function App() {
  const {user, loading, error, login, logout} = useAuth();
  const [section, setSection] = useState("dashboard");
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedCcy, setSelectedCcy] = useState("USD");
  const [previewClient, setPreviewClient] = useState(null);
  const isMobile = useIsMobile();

  useEffect(()=>{
    const style = document.createElement("style");
    style.innerHTML = `*{box-sizing:border-box;}body{overflow-x:hidden;margin:0;padding:0;}@keyframes spin{to{transform:rotate(360deg)}}`;
    style.id = "mn-global";
    if (!document.getElementById("mn-global")) document.head.appendChild(style);
    return () => { const el = document.getElementById("mn-global"); if(el) el.remove(); };
  }, []);

  const handleSection = (s) => { setSection(s); if(s !== "clients") setSelectedClient(null); };

  if (loading) return (
    <div style={{minHeight:"100vh",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontFamily:"Space Grotesk,sans-serif",fontSize:28,fontWeight:700,color:C.white,marginBottom:20}}><span style={{color:C.teal}}>i-</span>Convergence</div>
        <div style={{width:32,height:32,border:"3px solid rgba(0,184,176,0.3)",borderTop:"3px solid "+C.teal,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto"}}/>
      </div>
    </div>
  );

  if (!user) return <LoginScreen onLogin={login} loading={loading} error={error}/>;

  // Adviser previewing client view
  if (previewClient) return <ClientPortal user={{...user, clientId: previewClient}} logout={()=>setPreviewClient(null)} selectedCcy={selectedCcy} setCcy={setSelectedCcy}/>;

  // Client role - show client portal only
  if (user.isClient && !user.isAdviser) return <ClientPortal user={user} logout={logout} selectedCcy={selectedCcy} setCcy={setSelectedCcy}/>;

  return (
    <div style={{fontFamily:"'Inter',sans-serif",background:"#F2F5F9",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <Nav section={section} setSection={handleSection} selectedCcy={selectedCcy} setCcy={setSelectedCcy} user={user} logout={logout}/>
      <div style={{flex:1,overflowY:"auto",paddingBottom:isMobile?68:0}}>
        {section==="dashboard" && <Dashboard setSection={handleSection} setSelectedClient={setSelectedClient} selectedCcy={selectedCcy}/>}
        {section==="clients" && <ClientsList selectedClient={selectedClient} setSelectedClient={setSelectedClient} selectedCcy={selectedCcy} setPreviewClient={setPreviewClient}/>}
        {section==="withdrawals" && <WithdrawalsPage selectedCcy={selectedCcy}/>}
        {section==="connect" && <Connect/>}
      </div>
    </div>
  );
}
