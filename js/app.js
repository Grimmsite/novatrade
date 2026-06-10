/* ═══════════════════════════════════════════
   NOVATRADE — Main Application JavaScript
   Deriv WebSocket API Integration
   ═══════════════════════════════════════════ */

'use strict';

// ─── GLOBALS ───
const DERIV_WS_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089"; // legacy fallback
const DERIV_APP_ID = '33uSXfChgY8KVaryv2Z5C';
const DERIV_API_BASE = 'https://api.derivws.com';
const ATOOL_WS_URL = "wss://ws.binaryws.com/websockets/v3?app_id=36544";
const MARKETS = {
  'R_10':     { name: 'Volatility 10 Index',       decimals: 3 },
  'R_25':     { name: 'Volatility 25 Index',       decimals: 3 },
  'R_50':     { name: 'Volatility 50 Index',       decimals: 4 },
  'R_75':     { name: 'Volatility 75 Index',       decimals: 4 },
  'R_100':    { name: 'Volatility 100 Index',      decimals: 2 },
  '1HZ10V':   { name: 'Volatility 10 (1s) Index',  decimals: 2 },
  '1HZ25V':   { name: 'Volatility 25 (1s) Index',  decimals: 2 },
  '1HZ50V':   { name: 'Volatility 50 (1s) Index',  decimals: 2 },
  '1HZ75V':   { name: 'Volatility 75 (1s) Index',  decimals: 2 },
  '1HZ100V':  { name: 'Volatility 100 (1s) Index', decimals: 2 },
  'JD10':     { name: 'Jump 10 Index',             decimals: 2 },
  'JD25':     { name: 'Jump 25 Index',             decimals: 2 },
  'JD50':     { name: 'Jump 50 Index',             decimals: 2 },
  'JD75':     { name: 'Jump 75 Index',             decimals: 2 },
  'JD100':    { name: 'Jump 100 Index',            decimals: 2 },
};

const ANALYSIS_MARKETS = ['R_100', 'R_75', 'R_50', 'R_25', 'R_10'];

const QUOTES = [
  '"🚀 Every tick is an opportunity. Stay ready."',
  '"🔥 Small consistent profits build big accounts."',
  '"💡 Discipline is the bridge between goals and results."',
  '"⚡ The market rewards patience and punishes greed."',
  '"🌟 Trade smart. Manage risk. Stay consistent."',
  '"📈 A good trader knows when not to trade."',
];

// ─── STATE ───
let state = {
  currentPage: 'dashboard',
  apiToken: localStorage.getItem('nt_token') || null,
  bearerToken: localStorage.getItem('nt_token') || null,
  accountId: localStorage.getItem('nt_account_id') || null,
  userInfo: null,
  ws: null,
  dcircleWs: null,
  atoolWs: null,
  atoolTicks: [],
  analysisWs: null,
  autoTraderWs: null,
  botRunning: false,
  execFast: false,
  tickCount: 120,
  dcircleMarket: 'R_10',
  dcircleTicks: [],
  analysisData: {},      // { symbol: { ticks: [], lastPrice: 0 } }
  analysisWsMap: {},     // symbol -> ws
  autoScanInterval: null,
  autoTraderRunning: false,
  botsData: [],
  signalStrength: 5,
  favMarkets: JSON.parse(localStorage.getItem('nt_favs') || '[]'),
  vhSettings: { balance: 1000, stopLoss: 100 },
  currency: 'AUD',
};

// ─── INIT ───
document.addEventListener('DOMContentLoaded', () => {
  setHeroQuote();
  renderFreeBots();
  checkSavedToken();
  handleHashNav();
  window.addEventListener('hashchange', handleHashNav);
  setTimeout(function(){ updateBannerHeight(); }, 50);
  setTimeout(function(){ startAtool(true); }, 500);
  // Risk banner from localStorage
  if (localStorage.getItem('nt_risk_dismissed')) {
    document.getElementById('riskBanner').style.display = 'none';
    updateBannerHeight();
  }
});

function handleHashNav() {
  const hash = window.location.hash.replace('#', '');
  const pages = ['dashboard', 'bot-builder', 'analysis', 'free-bots', 'auto-trader', 'ai-scalper'];
  if (pages.includes(hash)) navigate(hash);
}

// ─── NAVIGATION ───
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  const tab = document.querySelector(`.nav-tab[data-page="${page}"]`);
  if (tab) tab.classList.add('active');

  state.currentPage = page;
  // Show banner only on dashboard
  var banner = document.getElementById('riskBanner');
  if (banner) {
    if (page === 'dashboard') {
      banner.style.display = '';
      document.documentElement.style.setProperty('--banner-h', banner.offsetHeight + 'px');
    } else {
      banner.style.display = 'none';
      document.documentElement.style.setProperty('--banner-h', '0px');
    }
  }
  window.location.hash = page;

  // Close mobile nav
  document.getElementById('navTabs').classList.remove('open');

  // Page-specific init
  if (page === 'analysis') initAnalysisPage();
  if (page === 'ai-scalper') aiScalperInit();
}

// ─── HAMBURGER ───
document.getElementById('hamburgerBtn').addEventListener('click', () => {
  document.getElementById('navTabs').classList.toggle('open');
});

// ─── HERO QUOTE ───
function setHeroQuote() {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  document.getElementById('heroQuote').textContent = q;
  setInterval(() => {
    const q2 = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    document.getElementById('heroQuote').textContent = q2;
  }, 8000);
}

// ═══════════════════════════════════════════
// DERIV WEBSOCKET HELPERS
// ═══════════════════════════════════════════

function createWS(onOpen, onMessage, onClose, onError, wsUrl) {
  const ws = new WebSocket(wsUrl || DERIV_WS_URL);
  ws.onopen = onOpen || (() => {});
  ws.onmessage = e => { try { onMessage(JSON.parse(e.data)); } catch(err) {} };
  ws.onclose = onClose || (() => {});
  ws.onerror = onError || (() => {});
  return ws;
}

// Get OTP-authenticated WebSocket URL for an account
async function getAuthWsUrl(bearerToken, accountId) {
  const res = await fetch(
    DERIV_API_BASE + '/trading/v1/options/accounts/' + accountId + '/otp',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + bearerToken,
        'Deriv-App-ID': DERIV_APP_ID
      }
    }
  );
  const data = await res.json();
  if (!data.data || !data.data.url) throw new Error('OTP failed: ' + JSON.stringify(data));
  return data.data.url;
}

function wsSend(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ─── TOKEN ───
function checkSavedToken() {
  if (state.bearerToken) {
    authorizeToken(state.bearerToken);
  }
}

async function authorizeToken(bearerToken) {
  try {
    // Step 1: get accounts list
    const acctRes = await fetch(DERIV_API_BASE + '/trading/v1/options/accounts', {
      headers: {
        'Authorization': 'Bearer ' + bearerToken,
        'Deriv-App-ID': DERIV_APP_ID
      }
    });
    const acctData = await acctRes.json();
    if (!acctData.data || !acctData.data.length) throw new Error('No accounts found');

    // Use first account (prefer real over demo)
    const accounts = acctData.data;
    const account = accounts.find(function(a){ return a.account_type === "real"; }) || accounts[0];
    const accountId = account.account_id;

    state.accountId = accountId;
    state.allAccounts = accounts;
    state.bearerToken = bearerToken;
    state.currency = account.currency || 'USD';
    localStorage.setItem('nt_token', bearerToken);
    localStorage.setItem('nt_account_id', accountId);

    // Step 2: get OTP WebSocket URL
    const wsUrl = await getAuthWsUrl(bearerToken, accountId);

    // Step 3: connect and get user info via balance
    const ws = createWS(
      () => ws.send(JSON.stringify({ balance: 1, subscribe: 1 })),
      (msg) => {
        if (msg.balance) {
          state.userInfo = { loginid: accountId, currency: msg.balance.currency, fullname: accountId };
          state.currency = msg.balance.currency || 'USD';
          const bal = msg.balance.balance.toFixed(2) + ' ' + msg.balance.currency;
          updateUserBadge(state.userInfo);
          document.getElementById('currencyLabel').textContent = state.currency;
          ws.close();
        } else if (msg.error) {
          showToast('⚠️ Connection error: ' + msg.error.message);
          ws.close();
        }
      },
      null, null, wsUrl
    );
  } catch(e) {
    showToast('⚠️ Login failed: ' + e.message);
    localStorage.removeItem('nt_token');
    localStorage.removeItem('nt_account_id');
    state.apiToken = null;
  }
}

function updateUserBadge(user) {
  var badge = document.getElementById("userBadge");
  var initials = document.getElementById("userInitials");
  var name = user.fullname || user.loginid || "NT";
  initials.textContent = name.slice(0, 2).toUpperCase();
  badge.classList.remove("hidden");
  var loginBtn = document.querySelector(".btn-login");
  var signupBtn = document.querySelector(".btn-signup");
  if (loginBtn) loginBtn.style.display = "none";
  if (signupBtn) signupBtn.style.display = "none";
  var tg = document.getElementById("acctToggle"); if (tg) tg.style.display = "flex"; updateToggle();
  updateDbotFrame();
  fetchBalance();
  showToast("Connected as " + (user.fullname || user.loginid));
  // Begin market scanning in background
  aiScanMarkets();
}

async function fetchBalance() {
  try {
    const wsUrl = await getAuthWsUrl(state.bearerToken, state.accountId);
    const ws = createWS(
      () => ws.send(JSON.stringify({ balance: 1, subscribe: 1 })),
      (msg) => {
        if (msg.balance) {
          const bal = msg.balance.balance.toFixed(2) + ' ' + msg.balance.currency;
          const el1 = document.getElementById('autoBalance');
          const el2 = document.getElementById('heroBalance');
          const el3 = document.getElementById('accountBalance');
          if (el1) el1.textContent = bal;
          if (el2) el2.textContent = bal;
          if (el3) el3.textContent = 'Balance: ' + bal;
          state.balance = msg.balance.balance;
          state.currency = msg.balance.currency;
          var navBal = document.getElementById('navBalance');
          var navHolder = document.getElementById('navBalanceHolder');
          if (navBal) navBal.textContent = bal;
          if (navHolder) navHolder.style.display = 'flex';
        }
      },
      null, null, wsUrl
    );
  } catch(e) { console.error('fetchBalance error:', e); }
}

// ═══════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════

function showApiModal() { openModal('apiModal'); }
function showLoginModal() { openModal('loginModal'); }
function showSignupModal() { openModal('signupModal'); }
function showVHSettings() { openModal('vhModal'); }
function showQuickStrategy() { openModal('quickStratModal'); }

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

function connectApiToken() {
  const token = document.getElementById('apiTokenInput').value.trim();
  if (!token) { showToast('Please enter an API token'); return; }
  const status = document.getElementById('connectionStatus');
  status.className = 'connection-status';
  status.textContent = '⏳ Connecting...';
  status.classList.remove('hidden');

  const ws = createWS(
    () => wsSend(ws, { authorize: token }),
    (msg) => {
      if (msg.authorize) {
        state.apiToken = token;
        localStorage.setItem('nt_token', token);
        state.userInfo = msg.authorize;
        updateUserBadge(msg.authorize);
        status.className = 'connection-status success';
        status.textContent = '✅ Connected as ' + (msg.authorize.fullname || msg.authorize.loginid);
        ws.close();
        setTimeout(() => closeModal('apiModal'), 1500);
      } else if (msg.error) {
        status.className = 'connection-status error';
        status.textContent = '❌ ' + msg.error.message;
        ws.close();
      }
    }
  );
}

function loginWithToken() {
  document.getElementById('apiTokenInput').value = document.getElementById('loginTokenInput').value;
  closeModal('loginModal');
  showApiModal();
  connectApiToken();
}

function saveVHSettings() {
  state.vhSettings.balance = parseFloat(document.getElementById('vhBalance').value) || 1000;
  state.vhSettings.stopLoss = parseFloat(document.getElementById('vhStopLoss').value) || 100;
  showToast('✅ Virtual Hook settings saved');
  closeModal('vhModal');
}

// ═══════════════════════════════════════════
// BOT RUNNER
// ═══════════════════════════════════════════

function toggleBot() {
  state.botRunning = !state.botRunning;
  const runBtns = document.querySelectorAll('.run-btn');
  runBtns.forEach(btn => {
    if (state.botRunning) {
      btn.innerHTML = '<span class="run-icon">■</span> Stop';
      btn.classList.add('running');
    } else {
      btn.innerHTML = '<span class="run-icon">▶</span> Run';
      btn.classList.remove('running');
    }
  });
  const statusBar = document.getElementById('botStatusBar');
  if (statusBar) {
    statusBar.textContent = state.botRunning ? '🟢 Bot is running...' : 'Bot is not running';
    statusBar.style.color = state.botRunning ? '#2ecc71' : '';
  }
  showToast(state.botRunning ? '▶ Bot started' : '■ Bot stopped');
}

function toggleExecSpeed() {
  state.execFast = !state.execFast;
  document.querySelectorAll('.exec-speed').forEach(el => {
    el.textContent = state.execFast ? 'FAST' : 'SLOW';
    el.classList.toggle('fast', state.execFast);
  });
  showToast('Execution: ' + (state.execFast ? '⚡ FAST' : '🐢 SLOW'));
}

// ═══════════════════════════════════════════
// BOT BUILDER
// ═══════════════════════════════════════════

function refreshBuilder() {
  const frame = document.getElementById('dbotFrame');
  if (frame) frame.src = frame.src;
  showToast('↺ Builder refreshed');
}

function loadXMLFile() { document.getElementById('xmlFileInput').click(); }

function handleXMLUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.name.endsWith('.xml')) { showToast('⚠️ Please select an XML file'); return; }
  showToast('📁 XML loaded: ' + file.name);
  navigate('bot-builder');
  // In a real integration, pass XML to DBot via postMessage
  const frame = document.getElementById('dbotFrame');
  if (frame && frame.contentWindow) {
    const reader = new FileReader();
    reader.onload = ev => {
      frame.contentWindow.postMessage({ type: 'load_xml', xml: ev.target.result }, '*');
    };
    reader.readAsText(file);
  }
}

function saveBot() {
  showToast('💾 Bot saved');
  const frame = document.getElementById('dbotFrame');
  if (frame && frame.contentWindow) {
    frame.contentWindow.postMessage({ type: 'save' }, '*');
  }
}

function exportXML() {
  showToast('💾 Exporting XML...');
  const frame = document.getElementById('dbotFrame');
  if (frame && frame.contentWindow) {
    frame.contentWindow.postMessage({ type: 'export_xml' }, '*');
  }
}

function toggleBlocksList() { showToast('☰ Blocks list'); }
function showChart() { showToast('📈 Chart view'); }
function showSummary() { showToast('📋 Summary'); }
function showTransactions() { showToast('🎯 Transactions'); }
function showHistory() { showToast('📉 Trade history'); }
function undoAction() {
  const frame = document.getElementById('dbotFrame');
  if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'undo' }, '*');
  showToast('↩ Undo');
}
function redoAction() {
  const frame = document.getElementById('dbotFrame');
  if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'redo' }, '*');
  showToast('↪ Redo');
}
function zoomIn() {
  const frame = document.getElementById('dbotFrame');
  if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'zoom_in' }, '*');
}
function zoomOut() {
  const frame = document.getElementById('dbotFrame');
  if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'zoom_out' }, '*');
}
function toggleBlocksMenu() {
  const frame = document.getElementById('dbotFrame');
  if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'toggle_blocks_menu' }, '*');
  showToast('Blocks Menu');
}
function toggleTradePanel() {
  const panel = document.getElementById('tradeParamsPanel');
  if (panel) panel.classList.toggle('open');
}

function loadQuickStrategy(type) {
  closeModal('quickStratModal');
  navigate('bot-builder');
  showToast('⚡ Loading ' + type + ' strategy...');
  const frame = document.getElementById('dbotFrame');
  if (frame && frame.contentWindow) {
    frame.contentWindow.postMessage({ type: 'quick_strategy', strategy: type }, '*');
  }
}

// ═══════════════════════════════════════════
// DCIRCLE ANALYSIS
// ═══════════════════════════════════════════

function initAnalysisPage() {
  initMarketCards();
  state.dcircleMarket = state.dcircleMarket || document.getElementById('dcircleMarket').value;
  startDcircle();
  if (document.getElementById('atab-tool').classList.contains('active')) {
    startScanAll();
  }
}

function switchAnalysisTab(tab) {
  document.querySelectorAll('.atab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.analysis-tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('atab-' + tab).classList.add('active');
  document.getElementById('analysis-' + tab).classList.add('active');
  if (tab === 'tool') { initMarketCards(); if (!state.atoolWs || state.atoolWs.readyState > 1) { startAtool(); } else { updateAtoolDisplay(); } }
  if (tab === 'dcircle') startDcircle();
}

function dcircleMarketChange() {
  state.dcircleMarket = document.getElementById('dcircleMarket').value;
  state.dcircleTicks = [];
  startDcircle();
}

function dcircleTradeTypeChange() { updateDcircleDisplay(); }
function updateDcircle() { startDcircle(); }

function startDcircle() {
  if (state.dcircleWs) {
    try { state.dcircleWs.close(); } catch(e) {}
  }
  state.dcircleTicks = [];
  updateDcircleDisplay();

  const symbol = state.dcircleMarket;
  const ticksNeeded = parseInt(document.getElementById('dcircleTicks').value) || 120;

  state.dcircleWs = createWS(
    () => {
      // Get tick history first
      wsSend(state.dcircleWs, {
        ticks_history: symbol,
        count: ticksNeeded,
        end: 'latest',
        style: 'ticks',
      });
    },
    (msg) => {
      if (msg.history && msg.history.prices) {
        state.dcircleTicks = msg.history.prices.map(p => parseFloat(p));
        updateDcircleDisplay();
        // Subscribe to live ticks
        wsSend(state.dcircleWs, { ticks: symbol, subscribe: 1 });
      } else if (msg.tick) {
        const price = parseFloat(msg.tick.quote);
        state.dcircleTicks.push(price);
        if (state.dcircleTicks.length > 1000) state.dcircleTicks.shift();
        document.getElementById('dcirclePrice').textContent = price.toFixed(MARKETS[symbol]?.decimals || 2);
        const lastDigit = Math.floor(price * Math.pow(10, MARKETS[symbol]?.decimals || 2)) % 10;
        document.getElementById('dcircleLastDigit').textContent = lastDigit;
        updateDcircleDisplay();
      }
    },
    () => {},
    () => {}
  );
}

function updateDcircleDisplay() {
  const ticks = state.dcircleTicks;
  const symbol = state.dcircleMarket;
  const dec = MARKETS[symbol]?.decimals || 2;
  const tickCount = parseInt(document.getElementById('dcircleTicks').value) || 120;
  const useTicks = ticks.slice(-tickCount);

  if (useTicks.length === 0) return;

  const lastPrice = useTicks[useTicks.length - 1];
  document.getElementById('dcirclePrice').textContent = lastPrice.toFixed(dec);
  const lastDigit = Math.floor(lastPrice * Math.pow(10, dec)) % 10;
  document.getElementById('dcircleLastDigit').textContent = lastDigit;

  const tradeType = document.getElementById('dcircleTradeType').value;

  if (tradeType === 'even_odd') {
    const digits = useTicks.map(p => Math.floor(p * Math.pow(10, dec)) % 10);
    const evenCount = digits.filter(d => d % 2 === 0).length;
    const oddCount = digits.length - evenCount;
    const evenPct = ((evenCount / digits.length) * 100).toFixed(1);
    const oddPct = ((oddCount / digits.length) * 100).toFixed(1);
    document.getElementById('evenPct').textContent = evenPct + '%';
    document.getElementById('oddPct').textContent = oddPct + '%';
    document.getElementById('eoResult').style.display = 'flex';

    const evenBar = document.getElementById('evenBar');
    const oddBar = document.getElementById('oddBar');
    if (parseFloat(evenPct) > parseFloat(oddPct)) {
      evenBar.classList.add('dominant'); oddBar.classList.remove('dominant');
      setSignalRec('📊 Signal: Trade EVEN (' + evenPct + '%)', 'bullish');
    } else {
      oddBar.classList.add('dominant'); evenBar.classList.remove('dominant');
      setSignalRec('📊 Signal: Trade ODD (' + oddPct + '%)', 'bearish');
    }
  } else if (tradeType === 'over_under') {
    const digits = useTicks.map(p => Math.floor(p * Math.pow(10, dec)) % 10);
    const over5 = digits.filter(d => d > 4).length;
    const under5 = digits.length - over5;
    const overPct = ((over5 / digits.length) * 100).toFixed(1);
    const underPct = ((under5 / digits.length) * 100).toFixed(1);
    document.getElementById('evenPct').textContent = 'OVER ' + overPct + '%';
    document.getElementById('oddPct').textContent = 'UNDER ' + underPct + '%';
    document.getElementById('eoResult').style.display = 'flex';
    const dominant = parseFloat(overPct) > parseFloat(underPct) ? 'Over' : 'Under';
    setSignalRec('📊 Signal: Trade ' + dominant.toUpperCase(), dominant === 'Over' ? 'bullish' : 'bearish');
  } else if (tradeType === 'rise_fall') {
    let rises = 0;
    for (let i = 1; i < useTicks.length; i++) {
      if (useTicks[i] > useTicks[i-1]) rises++;
    }
    const total = useTicks.length - 1;
    const risePct = ((rises / total) * 100).toFixed(1);
    const fallPct = (100 - parseFloat(risePct)).toFixed(1);
    document.getElementById('evenPct').textContent = 'RISE ' + risePct + '%';
    document.getElementById('oddPct').textContent = 'FALL ' + fallPct + '%';
    document.getElementById('eoResult').style.display = 'flex';
    setSignalRec('📊 Signal: Trade ' + (parseFloat(risePct) > 50 ? 'RISE' : 'FALL'), parseFloat(risePct) > 50 ? 'bullish' : 'bearish');
  } else {
    document.getElementById('eoResult').style.display = 'none';
    setSignalRec('Select trade type to see signal', '');
  }
}

function setSignalRec(text, type) {
  const el = document.getElementById('signalRec');
  el.textContent = text;
  el.className = 'signal-recommendation';
  if (type) el.classList.add(type);
}

// ═══════════════════════════════════════════
// ANALYSIS TOOL — MULTI-MARKET DIGIT SCANNER
// ═══════════════════════════════════════════

function initMarketCards() {
  const container = document.getElementById('marketsContainer');
  container.innerHTML = '';
  ANALYSIS_MARKETS.forEach(symbol => {
    if (!state.analysisData[symbol]) {
      state.analysisData[symbol] = { ticks: [], lastPrice: 0 };
    }
    container.appendChild(createMarketCard(symbol));
    startMarketWS(symbol);
  });
}

function startMarketWS(symbol) {
  if (state.analysisWsMap[symbol]) {
    try { state.analysisWsMap[symbol].close(); } catch(e) {}
  }

  const ws = createWS(
    () => {
      wsSend(ws, {
        ticks_history: symbol,
        count: state.tickCount,
        end: 'latest',
        style: 'ticks',
      });
    },
    (msg) => {
      if (msg.history && msg.history.prices) {
        state.analysisData[symbol] = {
          ticks: msg.history.prices.map(p => parseFloat(p)),
          lastPrice: parseFloat(msg.history.prices[msg.history.prices.length - 1] || 0),
        };
        updateMarketCard(symbol);
        wsSend(ws, { ticks: symbol, subscribe: 1 });
      } else if (msg.tick && msg.tick.symbol === symbol) {
        const price = parseFloat(msg.tick.quote);
        if (!state.analysisData[symbol]) state.analysisData[symbol] = { ticks: [], lastPrice: 0 };
        state.analysisData[symbol].ticks.push(price);
        state.analysisData[symbol].lastPrice = price;
        if (state.analysisData[symbol].ticks.length > 1000) state.analysisData[symbol].ticks.shift();
        updateMarketCard(symbol);
      }
    },
    () => {},
    () => {}
  );
  state.analysisWsMap[symbol] = ws;
}

function createMarketCard(symbol) {
  const info = MARKETS[symbol] || { name: symbol };
  const card = document.createElement('div');
  card.className = 'market-card';
  card.id = 'mcard-' + symbol;

  const isFav = state.favMarkets.includes(symbol);
  card.innerHTML = `
    <div class="market-card-header">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="market-fav" onclick="toggleFav('${symbol}')" title="Favourite">${isFav ? '⭐' : '☆'}</button>
        <span class="market-card-name">${info.name}</span>
      </div>
      <span class="market-card-price" id="price-${symbol}">—</span>
    </div>
    <div class="digits-grid" id="dgrid-${symbol}">
      ${[0,1,2,3,4,5,6,7,8,9].map(d => `
        <div class="digit-ring" id="dring-${symbol}-${d}">
          <div class="ring-container">
            <svg class="ring-svg" width="66" height="66" viewBox="0 0 66 66">
              <circle class="ring-bg" cx="33" cy="33" r="27"/>
              <circle class="ring-fill" id="rfill-${symbol}-${d}" cx="33" cy="33" r="27"
                stroke-dasharray="0 169.6" />
            </svg>
            <div class="ring-label">
              <span class="ring-num">${d}</span>
              <span class="ring-pct" id="rpct-${symbol}-${d}">—%</span>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="last-digits-row" id="ldigits-${symbol}"></div>
    <div class="trade-settings-row" style="margin-bottom:8px">
      <label>Trade type</label>
      <select id="ttype-${symbol}" onchange="updateMarketCard('${symbol}')">
        <option value="even_odd">Even / Odd</option>
        <option value="over_under">Over / Under</option>
        <option value="match_diff">Match / Differs</option>
      </select>
      <label>Stake</label>
      <input type="number" id="stake-${symbol}" value="0.5" min="0.35" step="0.01" style="width:65px" />
      <label>Ticks</label>
      <input type="number" id="tdur-${symbol}" value="1" min="1" style="width:50px" />
      <span id="pred-wrap-${symbol}" style="display:none">
        <label>Prediction</label>
        <input type="number" id="tpred-${symbol}" value="5" min="0" max="9" style="width:50px" onchange="updateMarketCard('${symbol}')"/>
      </span>
      <button class="auto-trade-btn" onclick="showAutoTradeSettings('${symbol}')">Auto ⚙</button>
    </div>
    <div class="eo-trade-row" id="eotrade-${symbol}">
      <button class="eo-trade-btn even-btn" id="even-btn-${symbol}" onclick="placeTrade('${symbol}','DIGITEVEN')">
        <span class="eo-trade-label" id="even-label-${symbol}">Even</span>
        <span class="eo-trade-pct" id="even-pct-${symbol}">—%</span>
        <span class="eo-trade-payout" id="even-pay-${symbol}">Payout AUD —</span>
      </button>
      <button class="eo-trade-btn odd-btn" id="odd-btn-${symbol}" onclick="placeTrade('${symbol}','DIGITODD')">
        <span class="eo-trade-label" id="odd-label-${symbol}">Odd</span>
        <span class="eo-trade-pct" id="odd-pct-${symbol}">—%</span>
        <span class="eo-trade-payout" id="odd-pay-${symbol}">Payout AUD —</span>
      </button>
    </div>
    <div id="trade-result-${symbol}" style="display:none;text-align:center;padding:6px;border-radius:6px;font-weight:600;font-size:14px;margin-top:6px"></div>
  `;
  return card;
}

function updateMarketCard(symbol) {
  const data = state.analysisData[symbol];
  if (!data || data.ticks.length === 0) return;

  const dec = MARKETS[symbol]?.decimals || 2;
  const useTicks = data.ticks.slice(-state.tickCount);
  const digits = useTicks.map(p => Math.floor(p * Math.pow(10, dec)) % 10);
  const total = digits.length;

  // Price
  const priceEl = document.getElementById('price-' + symbol);
  if (priceEl) priceEl.textContent = data.lastPrice.toFixed(dec);

  // Digit frequencies
  const freq = new Array(10).fill(0);
  digits.forEach(d => freq[d]++);
  const pcts = freq.map(f => f / total);

  const sorted = [...pcts.map((p, i) => ({ i, p }))].sort((a, b) => b.p - a.p);
  const mostIdx = sorted[0].i;
  const secondMostIdx = sorted[1].i;
  const leastIdx = sorted[sorted.length - 1].i;
  const secondLeastIdx = sorted[sorted.length - 2].i;

  const CIRC = 2 * Math.PI * 27;

  for (let d = 0; d < 10; d++) {
    const pct = pcts[d];
    const fillEl = document.getElementById('rfill-' + symbol + '-' + d);
    const pctEl = document.getElementById('rpct-' + symbol + '-' + d);
    const ringEl = document.getElementById('dring-' + symbol + '-' + d);
    if (!fillEl || !pctEl || !ringEl) continue;

    const dashArr = (pct * CIRC).toFixed(2) + ' ' + CIRC.toFixed(2);
    fillEl.setAttribute('stroke-dasharray', dashArr);

    pctEl.textContent = (pct * 100).toFixed(1) + '%';
    ringEl.className = "digit-ring";
    // Remove dot from all rings
    const oldDot = ringEl.querySelector(".current-dot");
    if (oldDot) oldDot.remove();

    if (d === mostIdx) {
      fillEl.style.stroke = '#2ecc71';
    } else if (d === secondMostIdx) {
      fillEl.style.stroke = '#7f8c8d';
    } else if (d === leastIdx) {
      fillEl.style.stroke = '#e74c3c';
    } else if (d === secondLeastIdx) {
      fillEl.style.stroke = '#e67e22';
    } else {
      fillEl.style.stroke = 'var(--gold)';
    }
  }

  // Add dot to current last digit ring
  const lastD = digits[digits.length - 1];
  for (let d = 0; d < 10; d++) {
    const ringEl = document.getElementById("dring-" + symbol + "-" + d);
    if (!ringEl) continue;
    const oldDot = ringEl.querySelector(".current-dot");
    if (oldDot) oldDot.remove();
    if (d === lastD) { ringEl.classList.add("current-digit"); } else { ringEl.classList.remove("current-digit"); } if (false) {
      const dot = document.createElement("div");
      dot.className = "current-dot";
      ringEl.querySelector(".ring-container").appendChild(dot);
    }
  }
  // Last digits row (last 10)
  const lastDigitsEl = document.getElementById('ldigits-' + symbol);
  if (lastDigitsEl) {
    const last10 = digits.slice(-10);
    lastDigitsEl.innerHTML = last10.map((d, i) => `
      <div class="last-digit-box ${d % 2 === 0 ? 'even-digit' : 'odd-digit'}${i === last10.length - 1 ? ' new-digit' : ''}">${d}</div>
    `).join('');
  }

  const tradeType = document.getElementById('ttype-' + symbol)?.value || 'even_odd';
  const evenPctEl = document.getElementById('even-pct-' + symbol);
  const oddPctEl = document.getElementById('odd-pct-' + symbol);
  const evenLabelEl = document.getElementById('even-label-' + symbol);
  const oddLabelEl = document.getElementById('odd-label-' + symbol);
  const evenBtnEl = document.getElementById('even-btn-' + symbol);
  const oddBtnEl = document.getElementById('odd-btn-' + symbol);
  const predWrap = document.getElementById('pred-wrap-' + symbol);
  const predVal = parseInt(document.getElementById('tpred-' + symbol)?.value ?? 5);
  if (tradeType === 'over_under' || tradeType === 'match_diff') {
    if (predWrap) predWrap.style.display = 'inline';
  } else {
    if (predWrap) predWrap.style.display = 'none';
  }
  if (tradeType === 'over_under') {
    const overCount = digits.filter(d => d > predVal).length;
    const underCount = digits.filter(d => d < predVal).length;
    const overPct = ((overCount / total) * 100).toFixed(1);
    const underPct = ((underCount / total) * 100).toFixed(1);
    if (evenPctEl) evenPctEl.textContent = overPct + '%';
    if (oddPctEl) oddPctEl.textContent = underPct + '%';
    if (evenLabelEl) evenLabelEl.textContent = 'Over ' + predVal;
    if (oddLabelEl) oddLabelEl.textContent = 'Under ' + predVal;
    if (evenBtnEl) evenBtnEl.onclick = function(){ placeTrade(symbol, 'DIGITOVER', predVal); };
    if (oddBtnEl) oddBtnEl.onclick = function(){ placeTrade(symbol, 'DIGITUNDER', predVal); };
  } else if (tradeType === 'match_diff') {
    const topDigit = sorted[0].i; const topPct = (sorted[0].p*100).toFixed(1);
    const lowDigit = sorted[sorted.length-1].i; const lowPct = (sorted[sorted.length-1].p*100).toFixed(1);
    if (evenPctEl) evenPctEl.textContent = 'MATCH ' + topDigit + ' (' + topPct + '%)';
    if (oddPctEl) oddPctEl.textContent = 'DIFF ' + lowDigit + ' (' + lowPct + '%)';
    if (evenLabelEl) evenLabelEl.textContent = 'Match';
    if (oddLabelEl) oddLabelEl.textContent = 'Differs';
    if (evenBtnEl) evenBtnEl.onclick = function(){ placeTrade(symbol, 'DIGITMATCH', topDigit); };
    if (oddBtnEl) oddBtnEl.onclick = function(){ placeTrade(symbol, 'DIGITDIFF', lowDigit); };
  } else {
    const evenCount = digits.filter(d => d % 2 === 0).length;
    const evenPct = ((evenCount / total) * 100).toFixed(1);
    const oddPct = (100 - parseFloat(evenPct)).toFixed(1);
    if (evenPctEl) evenPctEl.textContent = 'EVEN ' + evenPct + '%';
    if (oddPctEl) oddPctEl.textContent = 'ODD ' + oddPct + '%';
    if (evenLabelEl) evenLabelEl.textContent = 'Even';
    if (oddLabelEl) oddLabelEl.textContent = 'Odd';
    if (evenBtnEl) evenBtnEl.onclick = function(){ placeTrade(symbol, 'DIGITEVEN'); };
    if (oddBtnEl) oddBtnEl.onclick = function(){ placeTrade(symbol, 'DIGITODD'); };
  }
  fetchPayout(symbol);
}
function fetchPayout(symbol) {
  const stake = parseFloat(document.getElementById('stake-' + symbol)?.value || 0.5);
  const ws = createWS(
    () => wsSend(ws, {
      proposal: 1,
      amount: stake,
      basis: 'stake',
      contract_type: 'DIGITEVEN',
      currency: state.currency,
      duration: 1,
      duration_unit: 't',
      symbol: symbol,
    }),
    (msg) => {
      if (msg.proposal) {
        const payout = parseFloat(msg.proposal.payout).toFixed(2);
        const evenPayEl = document.getElementById('even-pay-' + symbol);
        const oddPayEl = document.getElementById('odd-pay-' + symbol);
        if (evenPayEl) evenPayEl.textContent = 'Payout ' + state.currency + ' ' + payout;
        if (oddPayEl) oddPayEl.textContent = 'Payout ' + state.currency + ' ' + payout;
      }
      ws.close();
    }
  );
}

// ─── TICK SELECTOR ───
function setTickCount(n) {
  state.tickCount = n;
  document.querySelectorAll('.tick-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent) === n);
  });
  // Refresh all market cards
  ANALYSIS_MARKETS.forEach(s => updateMarketCard(s));
}

// ─── SIGNALS DROPDOWN ───
function toggleSignalsDropdown() {
  document.getElementById('signalsMenu').classList.toggle('hidden');
}
function setSignalStrength(n) {
  state.signalStrength = n;
  document.querySelector('.signals-badge').textContent = n === 10 ? 'All Signals' : n + ' Strong';
  document.getElementById('signalsMenu').classList.add('hidden');
  showToast('Signal strength: ' + n);
}

// ─── AUTO SCAN ───
function startAutoScan() {
  if (state.autoScanInterval) {
    clearInterval(state.autoScanInterval);
    state.autoScanInterval = null;
    showToast('⏹ Auto Scan stopped');
    return;
  }
  showToast('⚡ Auto Scan started');
  state.autoScanInterval = setInterval(() => {
    ANALYSIS_MARKETS.forEach(s => updateMarketCard(s));
  }, 3000);
}

function scanAll() {
  showToast('⚙ Scanning all markets...');
  if (document.getElementById('marketsContainer').children.length === 0) {
    initMarketCards();
  } else {
    ANALYSIS_MARKETS.forEach(s => updateMarketCard(s));
  }
}

function startScanAll() {
  if (document.getElementById('marketsContainer').children.length === 0) {
    initMarketCards();
  }
}

// ─── TRADE PLACEMENT ───
// Cache auth WS URL for 25 seconds to avoid per-trade HTTP round-trip
var _bmdWsUrlCache = null;
var _bmdWsUrlExpiry = 0;
async function getCachedWsUrl() {
  if (_bmdWsUrlCache && Date.now() < _bmdWsUrlExpiry) return _bmdWsUrlCache;
  _bmdWsUrlCache = await getAuthWsUrl(state.bearerToken, state.accountId);
  _bmdWsUrlExpiry = Date.now() + 25000;
  return _bmdWsUrlCache;
}

async function placeTrade(symbol, contractType, barrier) {
  if (!state.bearerToken) {
    showToast('Please log in first');
    showLoginModal();
    return;
  }
  const stakeEl = document.getElementById('stake-' + symbol);
  const durEl = document.getElementById('tdur-' + symbol);
  const stake = parseFloat(stakeEl?.value || 0.5);
  const dur = parseInt(durEl?.value || 1);
  const wsUrl = await getCachedWsUrl();
  const ws = createWS(
    function() {
      wsSend(ws, {
        proposal: 1,
        amount: stake,
        basis: 'stake',
        contract_type: contractType,
        currency: state.currency,
        duration: dur,
        duration_unit: 't',
        underlying_symbol: symbol,
        ...(barrier !== undefined && barrier !== null ? { barrier: barrier } : {}),
      });
    },
    function(msg) {
      if (msg.proposal) {
        wsSend(ws, { buy: msg.proposal.id, price: msg.proposal.ask_price });
      } else if (msg.buy) {
        showToast('Trade placed!');
        wsSend(ws, { proposal_open_contract: 1, contract_id: msg.buy.contract_id, subscribe: 1 });
      } else if (msg.proposal_open_contract && msg.proposal_open_contract.is_sold) {
        var poc = msg.proposal_open_contract;
        var won = poc.profit >= 0;
        var resultEl = document.getElementById('trade-result-' + symbol);
        if (resultEl) {
          resultEl.style.display = 'block';
          resultEl.style.background = won ? '#1a3a1a' : '#3a1a1a';
          resultEl.style.color = won ? '#4caf50' : '#f44336';
          resultEl.textContent = won
            ? '✅ WIN  +' + parseFloat(poc.profit).toFixed(2)
            : '❌ LOSS  ' + parseFloat(poc.profit).toFixed(2);
          setTimeout(function() { if (resultEl) resultEl.style.display = 'none'; }, 4000);
        }
        fetchBalance();
        ws.close();
      } else if (msg.error) {
        showToast('Error: ' + msg.error.message);
        ws.close();
      }
    },
    null, null, wsUrl
  );
}
function showAutoTradeSettings(symbol) {
  showToast('⚙ Auto trade settings for ' + (MARKETS[symbol]?.name || symbol));
}

// ─── FAVOURITES ───
function toggleFav(symbol) {
  const idx = state.favMarkets.indexOf(symbol);
  if (idx >= 0) {
    state.favMarkets.splice(idx, 1);
  } else {
    state.favMarkets.push(symbol);
  }
  localStorage.setItem('nt_favs', JSON.stringify(state.favMarkets));
  const btn = document.querySelector(`#mcard-${symbol} .market-fav`);
  if (btn) btn.textContent = state.favMarkets.includes(symbol) ? '⭐' : '☆';
}

// ═══════════════════════════════════════════
// FREE BOTS
// ═══════════════════════════════════════════

const BOTS_DATA = [
  { name: 'Even/Odd Martingale', type: 'even_odd', desc: 'Trades Even/Odd with martingale recovery. Doubles stake after each loss up to 5 steps.', tags: ['Even/Odd', 'Martingale', 'V100'], premium: false },
  { name: 'Rise/Fall D\'Alembert', type: 'rise_fall', desc: 'Rise/Fall strategy using D\'Alembert staking. Increases by 1 unit after loss, decreases by 1 after win.', tags: ['Rise/Fall', 'D\'Alembert', 'V50'], premium: false },
  { name: 'Over 2 Digit Hunter', type: 'over_under', desc: 'Targets last digit over 2. High win rate with controlled martingale. Recommended for V25.', tags: ['Over/Under', 'Martingale', 'V25'], premium: false },
  { name: 'Match Differ Sniper', type: 'match_diff', desc: 'Identifies hot digits and trades Match on them. Uses last 30 ticks for digit frequency.', tags: ['Match/Diff', 'Hot Digit', 'V10'], premium: false },
  { name: 'Ultimate Even/Odd Pro', type: 'even_odd', desc: 'Premium bot with 3-level martingale, auto stop loss, and win target. Battle-tested strategy.', tags: ['Even/Odd', 'Premium', 'All Markets'], premium: true },
  { name: 'Volatility Scalper X', type: 'rise_fall', desc: 'Ultra-fast scalping bot for 1s indices. Trades Rise/Fall with 1-tick contracts. Requires fast execution.', tags: ['Rise/Fall', 'Scalping', 'V100 1s'], premium: true },
  { name: 'Oscar\'s Grind Even/Odd', type: 'even_odd', desc: 'Uses Oscar\'s Grind system for steady profit accumulation on Even/Odd trades.', tags: ['Even/Odd', 'Oscar\'s Grind', 'V75'], premium: false },
  { name: 'Under 7 Recovery Bot', type: 'over_under', desc: 'Trades Under 7 with intelligent recovery when losing streak detected. Uses 3-step martingale.', tags: ['Over/Under', 'Recovery', 'V100'], premium: false },
  { name: 'Digit Differs AI', type: 'match_diff', desc: 'Scans last 100 ticks to find coldest digit, then trades Differs against it. Smart cold digit avoidance.', tags: ['Match/Diff', 'AI', 'V50'], premium: true },
  { name: '1-3-2-4 Staking Bot', type: 'rise_fall', desc: 'Low-risk staking sequence bot for Rise/Fall trades. Conservative but steady approach.', tags: ['Rise/Fall', '1324', 'V25'], premium: false },
  { name: 'Even Odd Frequency Bot', type: 'even_odd', desc: 'Analyzes last 120 ticks, trades when one side has >55% dominance. Signal-based entries only.', tags: ['Even/Odd', 'Signal', 'All Markets'], premium: false },
  { name: 'Over 4 Power Bot', type: 'over_under', desc: 'Premium over 4 strategy with configurable martingale levels and auto profit lock-in.', tags: ['Over/Under', 'Premium', 'V100'], premium: true },
];

state.botsData = BOTS_DATA;

function renderFreeBots(filter = 'all') {
  const grid = document.getElementById('botsGrid');
  if (!grid) return;
  const filtered = filter === 'all' ? BOTS_DATA : BOTS_DATA.filter(b => b.type === filter);
  grid.innerHTML = filtered.map((bot, i) => `
    <div class="bot-card">
      <div class="bot-card-header">
        <span class="bot-card-name">${bot.name}</span>
        <span class="bot-card-badge ${bot.premium ? 'badge-premium' : 'badge-free'}">${bot.premium ? '👑 Premium' : 'Free'}</span>
      </div>
      <p class="bot-card-desc">${bot.desc}</p>
      <div class="bot-card-meta">
        ${bot.tags.map(t => `<span class="meta-tag">${t}</span>`).join('')}
      </div>
      <div class="bot-card-actions">
        <button class="load-bot-btn" onclick="loadBotInBuilder('${bot.name}')">Load Bot →</button>
        <button class="preview-bot-btn" onclick="previewBot(${i})">Preview</button>
      </div>
    </div>
  `).join('');
}

function filterBots(type) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderFreeBots(type);
}

function loadBotInBuilder(name) {
  showToast('📁 Loading: ' + name);
  navigate('bot-builder');
}

function previewBot(i) {
  const bot = BOTS_DATA[i];
  showToast('👁 Preview: ' + bot.name);
}

// ═══════════════════════════════════════════
// AUTO TRADER
// ═══════════════════════════════════════════

function startAutoTrader() {
  if (!state.apiToken) {
    showToast('⚠️ Please connect your API token first');
    showApiModal();
    return;
  }
  const market = document.getElementById('autoMarket').value;
  const tradeType = document.getElementById('autoTradeType').value;
  const stake = parseFloat(document.getElementById('autoStake').value);
  const takeProfit = parseFloat(document.getElementById('autoTakeProfit').value);
  const stopLoss = parseFloat(document.getElementById('autoStopLoss').value);
  const martingale = parseFloat(document.getElementById('autoMartingale').value);
  const maxSteps = parseInt(document.getElementById('autoMaxSteps').value);

  state.autoTraderRunning = true;
  document.querySelector('.start-auto-btn').classList.add('hidden');
  document.getElementById('stopAutoBtn').classList.remove('hidden');
  document.getElementById('autoWins').textContent = '0';
  document.getElementById('autoLosses').textContent = '0';
  document.getElementById('autoPnl').textContent = '0.00';

  showToast('▶ Auto Trader started on ' + (MARKETS[market]?.name || market));

  let wins = 0, losses = 0, pnl = 0, currentStake = stake, step = 0;

  function runTrade() {
    if (!state.autoTraderRunning) return;

    const ws = createWS(
      () => wsSend(ws, { authorize: state.apiToken }),
      (msg) => {
        if (msg.authorize) {
          wsSend(ws, {
            proposal: 1,
            amount: currentStake,
            basis: 'stake',
            contract_type: tradeType,
            currency: state.currency,
            duration: 1,
            duration_unit: 't',
            symbol: market,
          });
        } else if (msg.proposal) {
          if (!state.autoTraderRunning) { ws.close(); return; }
          wsSend(ws, { buy: msg.proposal.id, price: msg.proposal.ask_price });
        } else if (msg.buy) {
          const contractId = msg.buy.contract_id;
          wsSend(ws, { proposal_open_contract: 1, contract_id: contractId, subscribe: 1 });
        } else if (msg.proposal_open_contract && msg.proposal_open_contract.is_sold) {
          const poc = msg.proposal_open_contract;
          const profit = poc.profit;
          pnl += profit;
          if (profit > 0) {
            wins++;
            currentStake = stake;
            step = 0;
            document.getElementById('autoWins').textContent = wins;
          } else {
            losses++;
            if (step < maxSteps) {
              currentStake = parseFloat((currentStake * martingale).toFixed(2));
              step++;
            } else {
              currentStake = stake;
              step = 0;
            }
            document.getElementById('autoLosses').textContent = losses;
          }
          document.getElementById('autoPnl').textContent = (pnl >= 0 ? '+' : '') + pnl.toFixed(2);
          document.getElementById('autoPnl').style.color = pnl >= 0 ? 'var(--green)' : 'var(--red)';
          ws.close();

          if (pnl >= takeProfit) {
            stopAutoTrader();
            showToast('🎉 Take profit reached! +' + pnl.toFixed(2));
            return;
          }
          if (pnl <= -stopLoss) {
            stopAutoTrader();
            showToast('🛑 Stop loss hit! ' + pnl.toFixed(2));
            return;
          }
          setTimeout(runTrade, 500);
        } else if (msg.error) {
          showToast('❌ ' + msg.error.message);
          ws.close();
        }
      }
    );
    state.autoTraderWs = ws;
  }

  runTrade();
}

function stopAutoTrader() {
  state.autoTraderRunning = false;
  if (state.autoTraderWs) { try { state.autoTraderWs.close(); } catch(e) {} }
  document.querySelector('.start-auto-btn').classList.remove('hidden');
  document.getElementById('stopAutoBtn').classList.add('hidden');
  showToast('■ Auto Trader stopped');
}

// ═══════════════════════════════════════════
// TOAST NOTIFICATION
// ═══════════════════════════════════════════

let toastTimeout;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 2800);
}

// ─── RISK BANNER DISMISS ───
document.getElementById('riskBanner').querySelector('button').addEventListener('click', () => {
  localStorage.setItem('nt_risk_dismissed', '1');
});

// ─── CLOSE DROPDOWNS ON OUTSIDE CLICK ───
document.addEventListener('click', e => {
  if (!e.target.closest('.signals-dropdown')) {
    const menu = document.getElementById('signalsMenu');
    if (menu) menu.classList.add('hidden');
  }
  if (!e.target.closest('.nav-tabs') && !e.target.closest('.hamburger')) {
    document.getElementById('navTabs').classList.remove('open');
  }
});

// ─── KEYBOARD SHORTCUTS ───
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    document.getElementById('navTabs').classList.remove('open');
  }
});

console.log('%c NovaTrade v1.0 ', 'background:#c9a84c;color:#000;font-weight:bold;font-size:14px;padding:4px 8px;border-radius:4px;');
console.log('%c Powered by Deriv WebSocket API ', 'color:#c9a84c;font-size:11px;');

/* ═══════════════════════════════════════════
   OAUTH LOGIN — Deriv OAuth2
   ═══════════════════════════════════════════ */

// ⚠️ Replace with your real App ID once registered on api.deriv.com
const APP_ID = '33uSXfChgY8KVaryv2Z5C';
const OAUTH_URL = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=en&brand=deriv`;
const REDIRECT_URI = window.location.origin + window.location.pathname;

function loginWithOAuth() {
  closeModal('loginModal');

  // Generate PKCE code_verifier
  var arr = new Uint8Array(64);
  crypto.getRandomValues(arr);
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  var codeVerifier = Array.from(arr).map(function(v){ return chars[v % chars.length]; }).join('');

  // Generate state
  var stateArr = new Uint8Array(16);
  crypto.getRandomValues(stateArr);
  var state = Array.from(stateArr).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');

  // Derive code_challenge (SHA-256)
  crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier)).then(function(hash) {
    var codeChallenge = btoa(String.fromCharCode.apply(null, new Uint8Array(hash)))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

    sessionStorage.setItem('pkce_cv', codeVerifier);
    sessionStorage.setItem('oauth_state', state);

    // Embed code_verifier in redirect_uri so backend can retrieve it
    var redirectUri = 'https://novatrade-api.onrender.com/callback';
    var authUrl = 'https://auth.deriv.com/oauth2/auth' +
      '?response_type=code' +
      '&client_id=33uSXfChgY8KVaryv2Z5C' +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&scope=trade+account_manage' +
      '&state=' + encodeURIComponent('CV.' + codeVerifier + '.' + state) +
      '&code_challenge=' + codeChallenge +
      '&code_challenge_method=S256';

    window.location.href = authUrl;
  });
}

// Handle OAuth callback — Deriv returns token1, acct1 etc in URL params
function handleOAuthCallback() {
  var params = new URLSearchParams(window.location.search);
  var token = params.get('oauth_token');
  var authError = params.get('auth_error');
  var returnedState = params.get('state');

  if (authError) {
    showToast('Login failed: ' + decodeURIComponent(authError));
    window.history.replaceState({}, '', '/');
    return;
  }

  if (!token) return;

  var storedState = sessionStorage.getItem('oauth_state');
  if (storedState && returnedState && storedState !== returnedState) {
    showToast('Security error: state mismatch. Please try logging in again.');
    window.history.replaceState({}, '', '/');
    return;
  }

  sessionStorage.removeItem('pkce_cv');
  sessionStorage.removeItem('oauth_state');

  var accessToken = decodeURIComponent(token);
  state.apiToken = accessToken;
  state.bearerToken = accessToken;
  localStorage.setItem('nt_token', accessToken);

  window.history.replaceState({}, '', '/');
  authorizeToken(accessToken);
}

// Run OAuth check on page load
handleOAuthCallback();

/* ═══════════════════════════════════════════
   ACCOUNT MENU
   ═══════════════════════════════════════════ */

function showAccountMenu() {
  if (!state.userInfo) return;
  var user = state.userInfo;
  document.getElementById("accountAvatar").textContent = (user.fullname || user.loginid || "NT").slice(0, 2).toUpperCase();
  document.getElementById("accountName").textContent = user.fullname || "Trader";
  document.getElementById("accountId").textContent = user.loginid || "---";
  fetchAndShowBalance();
  openModal("accountModal");
  renderAccountSwitcher();
}

function fetchAndShowBalance() {
  if (!state.apiToken) return;
  const ws = createWS(
    () => wsSend(ws, { authorize: state.apiToken }),
    (msg) => {
      if (msg.authorize) {
        wsSend(ws, { balance: 1 });
      } else if (msg.balance) {
        const bal = msg.balance.balance.toFixed(2) + ' ' + msg.balance.currency;
        document.getElementById('accountBalance').textContent = 'Balance: ' + bal;
        document.getElementById('autoBalance').textContent = bal;
        ws.close();
      }
    }
  );
}

function updateToggle() {
  var el = document.getElementById("acctToggle");
  var demoBtn = document.getElementById("toggleDemo");
  var realBtn = document.getElementById("toggleReal");
  if (!el) return;
  var acct = (state.allAccounts || []).find(function(a){ return a.account_id === state.accountId; }) || {};
  var isReal = acct.account_type === "real";
  demoBtn.style.background = isReal ? "" : "#f0c040";
  demoBtn.style.color = isReal ? "#aaa" : "#000";
  realBtn.style.background = isReal ? "#f0c040" : "";
  realBtn.style.color = isReal ? "#000" : "#aaa";
}

async function toggleAccount() {
  var accounts = state.allAccounts || [];
  if (accounts.length <= 1) return;
  var other = accounts.find(function(a){ return a.account_id !== state.accountId; });
  if (!other) return;
  await switchAccount(other.account_id);
  updateToggle();
}

function renderAccountSwitcher() {
  var el = document.getElementById("accountSwitcher");
  if (!el) return;
  var accounts = state.allAccounts || [];
  if (accounts.length <= 1) { el.innerHTML = ""; return; }
  var html = '<p style="font-size:12px;color:#aaa;margin:0 0 6px">Switch Account</p>';
  for (var x = 0; x < accounts.length; x++) {
    var a = accounts[x];
    var active = a.account_id === state.accountId;
    var type = a.account_type === "real" ? "Real" : "Demo";
    var label = type + " - " + a.account_id + " (" + a.currency + ")";
    var style = "display:block;width:100%;text-align:left;padding:8px 12px;"
      + "margin-bottom:4px;border-radius:6px;cursor:pointer;color:#fff;"
      + "border:1px solid " + (active ? "#f0c040" : "#444") + ";"
      + "background:" + (active ? "#2a2200" : "#1a1a1a") + ";";
    var check = active ? " ✓" : "";
    html += '<button data-acct="' + a.account_id + '"' + ' style="' + style + '">'+label+check+'</button>';
  }
  el.innerHTML = html;
  var btns = el.querySelectorAll("button");
  for (var b = 0; b < btns.length; b++) {
    btns[b].addEventListener("click", function() {
      switchAccount(this.getAttribute("data-acct"));
    });
  }
}

async function switchAccount(accountId) {
  if (!state.bearerToken) return;
  state.accountId = accountId;
  localStorage.setItem("nt_account_id", accountId);
  var acct = (state.allAccounts || []).filter(function(a){ return a.account_id === accountId; })[0] || {};
  state.currency = acct.currency || state.currency;
  renderAccountSwitcher();
  await fetchBalance();
  var type = acct.account_type === "real" ? "Real" : "Demo";
  updateToggle();
  showToast("Switched to " + type + " account");
}

function logout() {
  state.apiToken = null;
  state.userInfo = null;
  localStorage.removeItem('nt_token');
  localStorage.removeItem('nt_acct');
  localStorage.removeItem('nt_currency');
  document.getElementById('userBadge').classList.add('hidden');
  document.querySelectorAll('button, a').forEach(el => {
    const t = el.textContent.trim();
    if (t === 'Log In' || t === 'Sign Up') el.classList.remove('hidden');
  });
  closeModal('accountModal');
  showToast('👋 Logged out successfully');
  navigate('dashboard');
}





// ═══════════════════════════════════════════
// ANALYSIS TOOL - LIVE DATA
// ═══════════════════════════════════════════
function atoolMarketChange() {
  if (state.atoolWs) {
    try { state.atoolWs.close(); } catch(e) {}
    state.atoolWs = null;
  }
  state.atoolTicks = [];
  startAtool();
}
function atoolUpdate() { if (document.getElementById("atoolTradeType") && state.atoolTicks && state.atoolTicks.length) { updateAtoolDisplay(); } else { startAtool(); } }
function startAtool(fastLoad) {
  if (state.atoolWs) {
    try { state.atoolWs.close(); } catch(e) {}
    state.atoolWs = null;
  }
  state.atoolTicks = [];
  const symbol = document.getElementById('atoolMarket').value;
  const ticksNeeded = fastLoad ? 20 : (parseInt(document.getElementById('atoolTicks').value) || 50);
  state.atoolWs = new WebSocket(ATOOL_WS_URL);
  state.atoolWs.onopen = () => {
    wsSend(state.atoolWs, { ticks_history: symbol, count: ticksNeeded, end: "latest", style: "ticks" });
  };
  state.atoolWs.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.history && msg.history.prices) {
        state.atoolTicks = msg.history.prices.map(p => parseFloat(p));
        updateAtoolDisplay();
        wsSend(state.atoolWs, { ticks: symbol, subscribe: 1 });
        if (fastLoad) { setTimeout(function(){ startAtool(false); }, 500); }
      } else if (msg.tick) {
        state.atoolTicks.push(parseFloat(msg.tick.quote));
        if (state.atoolTicks.length > 1000) state.atoolTicks.shift();
        updateAtoolDisplay();
      }
    } catch(e) {}
  };
  state.atoolWs.onclose = () => {};
  if (false) createWS(
    () => {
      wsSend(state.atoolWs, { ticks_history: symbol, count: ticksNeeded, end: 'latest', style: 'ticks' });
    },
    (msg) => {
      if (msg.history && msg.history.prices) {
        state.atoolTicks = msg.history.prices.map(p => parseFloat(p));
        updateAtoolDisplay();
        wsSend(state.atoolWs, { ticks: symbol, subscribe: 1 });
      } else if (msg.tick) {
        state.atoolTicks.push(parseFloat(msg.tick.quote));
        if (state.atoolTicks.length > 1000) state.atoolTicks.shift();
        updateAtoolDisplay();
      }
    },
    () => {},
    () => {}
  );
}
function updateAtoolDisplay() {
  const symbol = document.getElementById('atoolMarket').value;
  const tradeType = document.getElementById('atoolTradeType').value;
  const dec = MARKETS[symbol]?.decimals || 2;
  const digits = state.atoolTicks.map(p => Math.floor(p * Math.pow(10, dec)) % 10);
  const lastPrice = state.atoolTicks[state.atoolTicks.length - 1];
  const priceEl = document.getElementById('atoolPrice');
  if (priceEl) priceEl.textContent = lastPrice.toFixed(dec);
  const total = digits.length;
  const boxes = document.querySelectorAll('.atool-count-box');
  const labelA = boxes[0] ? boxes[0].querySelector('.atool-count-label') : null;
  const labelB = boxes[1] ? boxes[1].querySelector('.atool-count-label') : null;
  const evenCountEl = document.getElementById('atoolEvenCount');
  const oddCountEl = document.getElementById('atoolOddCount');
  const evenBar = document.getElementById('atoolEvenBar');
  const oddBar = document.getElementById('atoolOddBar');
  const patternEl = document.getElementById('atoolPattern');
  const patternTitle = document.getElementById('atoolPatternTitle');
  const probLabelA = document.getElementById('atoolProbLabelA');
  const probLabelB = document.getElementById('atoolProbLabelB');
  if (tradeType === 'over_under') {
    const over5 = digits.filter(d => d > 4).length, under5 = total - over5;
    const op = ((over5/total)*100).toFixed(1), up = ((under5/total)*100).toFixed(1);
    if (labelA) labelA.textContent = 'Over';
    if (patternTitle) patternTitle.textContent = '⊞ Over/Under Pattern';
    if (probLabelA) probLabelA.textContent = 'Over';
    if (probLabelB) probLabelB.textContent = 'Under';
    if (labelB) labelB.textContent = 'Under';
    if (evenCountEl) evenCountEl.textContent = over5;
    if (oddCountEl) oddCountEl.textContent = under5;
    if (evenBar) { evenBar.style.width = op+'%'; evenBar.textContent = op+'%'; }
    if (oddBar) { oddBar.style.width = up+'%'; oddBar.textContent = up+'%'; }
    if (patternEl) patternEl.innerHTML = digits.slice(-20).map(d => '<div class="atool-pattern-dot '+(d>4?'even':'odd')+'">'+(d>4?'O':'U')+'</div>').join('');
  } else if (tradeType === 'rise_fall') {
    let rises = 0;
    for (let i = 1; i < state.atoolTicks.length; i++) if (state.atoolTicks[i] > state.atoolTicks[i-1]) rises++;
    const falls = state.atoolTicks.length - 1 - rises;
    const rp = ((rises/(state.atoolTicks.length-1))*100).toFixed(1), fp = (100-parseFloat(rp)).toFixed(1);
    if (labelA) labelA.textContent = 'Rise';
    if (patternTitle) patternTitle.textContent = '⊞ Rise/Fall Pattern';
    if (probLabelA) probLabelA.textContent = 'Rise';
    if (probLabelB) probLabelB.textContent = 'Fall';
    if (labelB) labelB.textContent = 'Fall';
    if (evenCountEl) evenCountEl.textContent = rises;
    if (oddCountEl) oddCountEl.textContent = falls;
    if (evenBar) { evenBar.style.width = rp+'%'; evenBar.textContent = rp+'%'; }
    if (oddBar) { oddBar.style.width = fp+'%'; oddBar.textContent = fp+'%'; }
    if (patternEl) patternEl.innerHTML = digits.slice(-20).map(function(_,i){ var r=i>0&&state.atoolTicks[state.atoolTicks.length-20+i]>state.atoolTicks[state.atoolTicks.length-21+i]; return '<div class="atool-pattern-dot '+(r?'even':'odd')+'">'+(r?'R':'F')+'</div>'; }).join('');
  } else if (tradeType === 'digit_freq') {
    const freq = new Array(10).fill(0); digits.forEach(d => freq[d]++);
    const top = freq.indexOf(Math.max.apply(null,freq)), bot = freq.indexOf(Math.min.apply(null,freq));
    if (labelA) labelA.textContent = 'Hot';
    if (patternTitle) patternTitle.textContent = '⊞ Digit Frequency Pattern';
    if (probLabelA) probLabelA.textContent = 'Hot Digit';
    if (probLabelB) probLabelB.textContent = 'Cold Digit';
    if (labelB) labelB.textContent = 'Cold';
    if (evenCountEl) evenCountEl.textContent = top;
    if (oddCountEl) oddCountEl.textContent = bot;
    if (evenBar) { evenBar.style.width = ((freq[top]/total)*100).toFixed(1)+'%'; evenBar.textContent = 'Digit '+top+' ('+((freq[top]/total)*100).toFixed(1)+'%)'; }
    if (oddBar) { oddBar.style.width = ((freq[bot]/total)*100).toFixed(1)+'%'; oddBar.textContent = 'Digit '+bot+' ('+((freq[bot]/total)*100).toFixed(1)+'%)'; }
    if (patternEl) patternEl.innerHTML = digits.slice(-20).map(d => '<div class="atool-pattern-dot '+(d===top?'even':d===bot?'odd':'')+'">' + d + '</div>').join('');
  } else {
    const ec = digits.filter(d => d % 2 === 0).length, oc = total - ec;
    const ep = ((ec/total)*100).toFixed(1), op2 = ((oc/total)*100).toFixed(1);
    if (labelA) labelA.textContent = 'Even';
    if (patternTitle) patternTitle.textContent = '⊞ Even/Odd Pattern';
    if (probLabelA) probLabelA.textContent = 'Even';
    if (probLabelB) probLabelB.textContent = 'Odd';
    if (labelB) labelB.textContent = 'Odd';
    if (evenCountEl) evenCountEl.textContent = ec;
    if (oddCountEl) oddCountEl.textContent = oc;
    if (evenBar) { evenBar.style.width = ep+'%'; evenBar.textContent = ep+'%'; }
    if (oddBar) { oddBar.style.width = op2+'%'; oddBar.textContent = op2+'%'; }
    if (patternEl) patternEl.innerHTML = digits.slice(-20).map(d => '<div class="atool-pattern-dot '+(d%2===0?'even':'odd')+'">'+(d%2===0?'E':'O')+'</div>').join('');
  }
}

function updateDbotFrame() {
  var frame = document.getElementById('dbotFrame');
  if (!frame) return;
  var acct = (state.allAccounts || []).find(function(a){ return a.account_id === state.accountId; }) || {};
  var token = state.bearerToken;
  var accountId = state.accountId;
  var currency = acct.currency || state.currency || 'USD';
  if (!token || !accountId) return;
  var url = 'https://bot.deriv.com/?acct1=' + encodeURIComponent(accountId)
    + '&token1=' + encodeURIComponent(token)
    + '&cur1=' + encodeURIComponent(currency);
  frame.src = url;
}

// ═══════════════════════════════════════════
// NATIVE BOT RUNNER
// ═══════════════════════════════════════════

var BRUN_BOTS = [
  { id:'rise_fall_pro',    name:'Rise Fall Pro',      desc:'Martingale CALL — R_50, 3 ticks',              risk:'MEDIUM', icon:'📈', cfg:{ symbol:'R_50',  ct:'CALL',       barrier:null, dur:3, dur_unit:'t', multiplier:2.1  } },
  { id:'even_odd_master',  name:'Even Odd Master',    desc:'Martingale DIGITEVEN — R_100, 1 tick',         risk:'MEDIUM', icon:'🎯', cfg:{ symbol:'R_100', ct:'DIGITEVEN',  barrier:null, dur:1, dur_unit:'t', multiplier:2.15 } },
  { id:'over_under_elite', name:'Over Under Elite',   desc:'Martingale DIGITOVER barrier 4 — R_100, 1 tick',risk:'HIGH',  icon:'⚡', cfg:{ symbol:'R_100', ct:'DIGITOVER',  barrier:4,    dur:1, dur_unit:'t', multiplier:2.3  } },
  { id:'sniper',           name:'Sniper',             desc:'Martingale DIGITOVER barrier 4 x2.2 — R_100',  risk:'HIGH',  icon:'🎯', cfg:{ symbol:'R_100', ct:'DIGITOVER',  barrier:4,    dur:1, dur_unit:'t', multiplier:2.2  } },
  { id:'volatility_hunter',name:'Volatility Hunter',  desc:'CALL on R_75, 5 ticks, base stake 2',          risk:'LOW',   icon:'🔥', cfg:{ symbol:'R_75',  ct:'CALL',       barrier:null, dur:5, dur_unit:'t', multiplier:2.1  } }
];

var brun = {
  running:false, stopped:false, bot:null,
  stake:1, initStake:1, tp:10, sl:10, maxTrades:100,
  pnl:0, trades:0, wins:0, losses:0,
  ws:null
};



function brunOnStrategyChange() {
  var s = document.getElementById('brun_strategy').value;
  var mRow = document.getElementById('brun_mult_row');
  var dRow = document.getElementById('brun_dalembert_row');
  if (mRow) mRow.style.display = (s === 'martingale' || s === 'reverse_martingale') ? '' : 'none';
  if (dRow) dRow.style.display = (s === 'dalembert' || s === 'reverse_dalembert' || s === 'oscars_grind') ? '' : 'none';
}

function brunOnTradeTypeChange() {
  var tt = document.getElementById('brun_trade_type').value;
  var ct = document.getElementById('brun_ct');
  var br = document.getElementById('brun_barrier_row');
  if (!ct) return;
  var opts = {
    evenodd: [['DIGITEVEN','Even'],['DIGITODD','Odd']],
    overunder: [['DIGITOVER','Over'],['DIGITUNDER','Under']],
    risefall: [['CALL','Rise (CALL)'],['PUT','Fall (PUT)']],
    matchdiff: [['DIGITMATCH','Matches'],['DIGITDIFF','Differs']],
    higherlower: [['CALL','Higher'],['PUT','Lower']]
  };
  ct.innerHTML = (opts[tt]||[]).map(function(o){ return '<option value="'+o[0]+'">'+o[1]+'</option>'; }).join('');
  brunToggleBarrier();
}


function brunLoadSymbols() {
  var sel = document.getElementById('brun_symbol');
  if (!sel) return;
  var ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
  ws.onopen = function() {
    ws.send(JSON.stringify({ active_symbols: 'brief', product_type: 'basic' }));
  };
  ws.onmessage = function(e) {
    var msg = JSON.parse(e.data);
    ws.close();
    if (!msg.active_symbols) return;
    var groups = {};
    msg.active_symbols.forEach(function(s) {
      var g = s.market_display_name || s.market || 'Other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    });
    sel.innerHTML = '';
    Object.keys(groups).sort().forEach(function(g) {
      var og = document.createElement('optgroup');
      og.label = g;
      groups[g].forEach(function(s) {
        var o = document.createElement('option');
        o.value = s.symbol;
        o.textContent = s.display_name;
        if (s.symbol === 'R_50') o.selected = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  };
  ws.onerror = function() {
    sel.innerHTML = '<option value="R_50">Volatility 50 (fallback)</option>';
  };
}

function brunToggleBarrier() {
  var ct = document.getElementById('brun_ct');
  var row = document.getElementById('brun_barrier_row');
  if (!ct || !row) return;
  var needs = ['DIGITOVER','DIGITUNDER'].indexOf(ct.value) !== -1;
  row.style.display = needs ? '' : 'none';
}

function brunPopulateSettings(bot) {
  var cfg = bot.cfg;
  var sym  = document.getElementById('brun_symbol');
  var ct   = document.getElementById('brun_ct');
  var dur  = document.getElementById('brun_dur');
  var duru = document.getElementById('brun_dur_unit');
  var barr = document.getElementById('brun_barrier');
  var mult = document.getElementById('brun_mult');
  var stk  = document.getElementById('brun_stake');
  if (sym)  sym.value  = cfg.symbol    || 'R_100';
  // Sync trade type to match bot's contract type
  var ctToTT = {'DIGITEVEN':'evenodd','DIGITODD':'evenodd','DIGITOVER':'overunder','DIGITUNDER':'overunder','CALL':'risefall','PUT':'risefall','DIGITMATCH':'matchdiff','DIGITDIFF':'matchdiff'};
  var ttEl = document.getElementById('brun_trade_type');
  if (ttEl && cfg.ct) { ttEl.value = ctToTT[cfg.ct] || 'risefall'; brunOnTradeTypeChange(); }
  if (ct)   ct.value   = cfg.ct        || 'CALL';
  if (dur)  dur.value  = cfg.dur       || 1;
  if (duru) duru.value = cfg.dur_unit  || 't';
  if (barr) barr.value = cfg.barrier !== null && cfg.barrier !== undefined ? cfg.barrier : 4;
  if (mult) mult.value = cfg.multiplier|| 2.1;
  if (stk)  stk.value  = cfg.initStake  || 1;
  // If symbol not yet in dropdown, add it as a fallback option
  if (sym && cfg.symbol) {
    var found = Array.from(sym.options).some(function(o){ return o.value === cfg.symbol; });
    if (!found) { var o = document.createElement('option'); o.value = cfg.symbol; o.textContent = cfg.symbol+' (from bot)'; sym.appendChild(o); }
    sym.value = cfg.symbol;
  }
  brunToggleBarrier();
}

function brunOpenModal() {
  var list = document.getElementById("brun-modal-list");
  var modal = document.getElementById("brun-modal");
  if (!list || !modal) return;
  list.innerHTML = BRUN_BOTS.map(function(b) {
    var rc = b.risk==="LOW"?"#4caf50":b.risk==="MEDIUM"?"#f0c040":"#f44336";
    var active = brun.bot && brun.bot.id === b.id ? " brun-mcard-active" : "";
    return '<div class="brun-mcard'+active+'" onclick="brunPickBot(\''+b.id+'\')">'
      +'<span class="brun-mcard-icon">'+b.icon+'</span>'
      +'<div class="brun-mcard-info"><div class="brun-mcard-name">'+b.name+'</div><div class="brun-mcard-desc">'+b.desc+'</div></div>'
      +'<span class="brun-badge" style="color:'+rc+';border-color:'+rc+'">'+b.risk+'</span></div>';
  }).join("");
  modal.style.display = "flex";
}

function brunCloseModal() {
  var modal = document.getElementById("brun-modal");
  if (modal) modal.style.display = "none";
}

function brunPickBot(id) {
  brunCloseModal();
  brunSelect(id);
}

function brunRender() {
  var el = document.getElementById('brun-library');
  if (!el) return;
  el.innerHTML = BRUN_BOTS.map(function(b) {
    var rc = b.risk==='LOW'?'#4caf50':b.risk==='MEDIUM'?'#f0c040':'#f44336';
    var active = brun.bot && brun.bot.id === b.id ? ' brun-card-active' : '';
    return '<div class="brun-card'+active+'" onclick="brunSelect(\''+b.id+'\')">'
      +'<span class="brun-card-icon">'+b.icon+'</span>'
      +'<div class="brun-card-info"><div class="brun-card-name">'+b.name+'</div>'
      +'<div class="brun-card-desc">'+b.desc+'</div></div>'
      +'<span class="brun-badge" style="color:'+rc+';border-color:'+rc+'">'+b.risk+'</span>'
      +'</div>';
  }).join('');
}

function brunSelect(id) {
  if (brun.running) return;
  brun.bot = BRUN_BOTS.find(function(b){ return b.id===id; }) || null;
  brunRender();
  var nm = document.getElementById('brun-active-name');
  var rb = document.getElementById('brunRunBtn');
  if (nm) nm.textContent = brun.bot ? brun.bot.name : 'No bot selected';
  if (rb) rb.disabled = !brun.bot || !state.bearerToken;
  if (brun.bot) brunPopulateSettings(brun.bot);
  brunSetStatus('idle', brun.bot ? 'Ready — press Run to start' : 'Select a bot and press Run');
}

function brunLoadXML(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var cfg = brunParseXML(e.target.result);
    if (!cfg) { showToast('Could not parse XML bot'); return; }
    var b = { id:'custom_'+Date.now(), name:file.name.replace('.xml',''), desc:'Custom uploaded bot', risk:'MEDIUM', icon:'📂', cfg:cfg };
    BRUN_BOTS.push(b);
    brunRender();
    brunSelect(b.id);
    showToast('Bot loaded: '+b.name);
  };
  reader.readAsText(file);
}

function brunParseXML(xmlStr) {
  try {
    var doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
    var mkt = doc.querySelector('block[type="trade_definition_market"]');
    var symbol = mkt ? ((mkt.querySelector('field[name="SYMBOL_LIST"]')||mkt.querySelector('field[name="SYMBOL"]')||{}).textContent||'R_100') : 'R_100';
    var opts = doc.querySelector('block[type="trade_definition_tradeoptions"]');
    var dur = opts ? parseInt((opts.querySelector('field[name="DURATION_VALUE"]')||{}).textContent||'1') : 1;
    var dur_unit = opts ? ((opts.querySelector('field[name="DURATION_UNIT"]')||{}).textContent||'t') : 't';
    var purch = doc.querySelector('block[type="purchase"]');
    var ct = purch ? ((purch.querySelector('field[name="PURCHASE_LIST"]')||{}).textContent||'CALL') : 'CALL';
    var barrier = null;
    if (purch) { var bv = purch.querySelector('value[name="BARRIEROFFSET"] field[name="NUM"], value[name="BARRIER"] field[name="NUM"]'); if (bv) barrier = parseFloat(bv.textContent); }
    var initStake = 1;
    var bp = doc.querySelector('statement[name="BEFORE_PURCHASE_STATEMENT"]');
    if (bp) { var nums = bp.querySelectorAll('field[name="NUM"]'); if (nums.length) initStake = parseFloat(nums[0].textContent)||1; }
    var multiplier = 2.0;
    var ap = doc.querySelector('statement[name="AFTER_PURCHASE_STATEMENT"]');
    if (ap) { var mn = ap.querySelectorAll('block[type="math_arithmetic"] field[name="NUM"]'); if (mn.length) multiplier = parseFloat(mn[0].textContent)||2.0; }
    return { symbol:symbol, ct:ct, barrier:barrier, dur:dur, dur_unit:dur_unit, multiplier:multiplier, initStake:initStake };
  } catch(e) { console.error('XML parse error',e); return null; }
}

function brunSetStatus(type, text) {
  var dot = document.getElementById('brun-dot');
  var txt = document.getElementById('brun-status');
  if (dot) dot.className = 'brun-dot '+type;
  if (txt) txt.textContent = text;
}

function brunUpdateStats() {
  var pnlEl = document.getElementById('brun_pnl');
  if (document.getElementById('brun_trades'))    document.getElementById('brun_trades').textContent    = brun.trades;
  if (document.getElementById('brun_wins'))      document.getElementById('brun_wins').textContent      = brun.wins;
  if (document.getElementById('brun_losses'))    document.getElementById('brun_losses').textContent    = brun.losses;
  if (document.getElementById('brun_cur_stake')) document.getElementById('brun_cur_stake').textContent = '$'+brun.stake.toFixed(2);
  if (pnlEl) { pnlEl.textContent=(brun.pnl>=0?'+':'')+'$'+brun.pnl.toFixed(2); pnlEl.style.color=brun.pnl>=0?'#4caf50':'#f44336'; }
}

function brunAddLog(entry) {
  var log = document.getElementById('brun-log');
  if (!log) return;
  var ph = log.querySelector('.brun-log-empty');
  if (ph) ph.remove();
  var c = entry.won ? '#4caf50' : '#f44336';
  var row = document.createElement('div');
  row.className = 'brun-log-row';
  row.innerHTML = '<span class="brun-log-time">'+new Date().toLocaleTimeString()+'</span>'
    +'<span class="brun-log-ct">'+entry.ct+'</span>'
    +'<span class="brun-log-stake">$'+entry.stake.toFixed(2)+'</span>'
    +'<span style="color:'+c+';font-weight:700">'+(entry.won?'WIN':'LOSS')+'</span>'
    +'<span style="color:'+c+';font-weight:700">'+(entry.profit>=0?'+':'')+'$'+entry.profit.toFixed(2)+'</span>';
  log.insertBefore(row, log.firstChild);
  while (log.children.length > 60) log.removeChild(log.lastChild);
}

async function brunStart() {
  if (!state.bearerToken || !state.accountId) { showToast('Please log in first'); return; }
  if (!brun.bot) { showToast('Select a bot first'); return; }
  if (brun.running) return;
  // Read all settings from panel
  brun.bot.cfg.symbol    = document.getElementById('brun_symbol').value;
  brun.bot.cfg.ct        = document.getElementById('brun_ct').value;
  brun.bot.cfg.dur       = parseInt(document.getElementById('brun_dur').value)||1;
  brun.bot.cfg.dur_unit  = document.getElementById('brun_dur_unit').value;
  var barrierRow = document.getElementById('brun_barrier_row');
  brun.bot.cfg.barrier   = (barrierRow && barrierRow.style.display!=='none') ? parseInt(document.getElementById('brun_barrier').value) : null;
  brun.bot.cfg.multiplier= parseFloat(document.getElementById('brun_mult').value)||2.1;
  brun.initStake = parseFloat(document.getElementById('brun_stake').value)||1;
  brun.stake     = brun.initStake;
  brun.tp        = parseFloat(document.getElementById('brun_tp').value)||10;
  brun.sl        = parseFloat(document.getElementById('brun_sl').value)||10;
  brun.maxTrades = parseInt(document.getElementById('brun_max').value)||100;
  brun.pnl=0; brun.trades=0; brun.wins=0; brun.losses=0;
  brun.stopped=false; brun.running=true;
  document.getElementById('brunRunBtn').style.display='none';
  document.getElementById('brunStopBtn').style.display='';
  document.getElementById('brun-log').innerHTML='';
  brunUpdateStats();
  brunSetStatus('running','Connecting...');
  try {
    var wsUrl = await getAuthWsUrl(state.bearerToken, state.accountId);
    brun.ws = new WebSocket(wsUrl);
    brun.ws.onopen    = function(){ brunSetStatus('running','Running — '+brun.bot.name); brunNextTrade(); };
    brun.ws.onmessage = function(e){ brunHandleMsg(JSON.parse(e.data)); };
    brun.ws.onerror   = function(){ brunStop(); showToast('WebSocket error — bot stopped'); };
    brun.ws.onclose   = function(){ if (brun.running){ brunSetStatus('idle','Connection closed'); brun.running=false; } };
  } catch(err) { brunStop(); showToast('Connect failed: '+err.message); }
}

function brunNextTrade() {
  if (brun.stopped || !brun.running) return;
  if (brun.trades >= brun.maxTrades)            { brunStop(); showToast('Max trades reached'); return; }
  if (brun.pnl <= -Math.abs(brun.sl))           { brunStop(); showToast('Stop loss hit'); return; }
  if (brun.pnl >= Math.abs(brun.tp))            { brunStop(); showToast('Take profit hit'); return; }
  var cfg = brun.bot.cfg;
  var proposal = { proposal:1, amount:parseFloat(brun.stake.toFixed(2)), basis:'stake',
    contract_type:cfg.ct, currency:state.currency||'USD',
    duration:cfg.dur, duration_unit:cfg.dur_unit, underlying_symbol:cfg.symbol };
  if (cfg.barrier !== null && cfg.barrier !== undefined) proposal.barrier = cfg.barrier;
  brunSetStatus('running','Trade #'+(brun.trades+1)+' — stake $'+brun.stake.toFixed(2));
  brun.ws.send(JSON.stringify(proposal));
}

function brunHandleMsg(msg) {
  if (msg.error) {
    brunSetStatus('error','Error: '+msg.error.message);
    setTimeout(function(){ if (brun.running) brunNextTrade(); }, 2000);
    return;
  }
  if (msg.msg_type==='proposal' && msg.proposal) {
    brun.ws.send(JSON.stringify({ buy:msg.proposal.id, price:msg.proposal.ask_price }));
    return;
  }
  if (msg.msg_type==='buy' && msg.buy) {
    brun.ws.send(JSON.stringify({ proposal_open_contract:1, contract_id:msg.buy.contract_id, subscribe:1 }));
    return;
  }
  if (msg.msg_type==='proposal_open_contract' && msg.proposal_open_contract) {
    var poc = msg.proposal_open_contract;
    if (!poc.is_sold) return;
    var execMs = Date.now() - (ai._tradeStart||Date.now());
    aiLog('⚡ Execution: '+execMs+'ms total','info');
    var won    = poc.profit > 0;
    var profit = parseFloat(poc.profit)||0;
    var stake  = parseFloat(poc.buy_price)||brun.stake;
    brun.trades++; brun.pnl += profit;
    if (won) { brun.wins++;   brun.stake = brun.initStake; }
    else     { brun.losses++; brun.stake = parseFloat((brun.stake * brun.bot.cfg.multiplier).toFixed(2)); }
    brunAddLog({ ct:brun.bot.cfg.ct, stake:stake, won:won, profit:profit });
    brunUpdateStats();
    setTimeout(function(){ if (brun.running && !brun.stopped) brunNextTrade(); }, 500);
  }
}

function brunStop() {
  brun.running=false; brun.stopped=true;
  if (brun.ws) { try{ brun.ws.close(); }catch(e){} brun.ws=null; }
  var rb = document.getElementById('brunRunBtn');
  var sb = document.getElementById('brunStopBtn');
  if (rb) rb.style.display='';
  if (sb) sb.style.display='none';
  brunSetStatus('idle','Stopped — '+brun.trades+' trades, P&L: '+(brun.pnl>=0?'+':'')+'$'+brun.pnl.toFixed(2));
}

document.addEventListener('DOMContentLoaded', function(){ brunRender(); brunLoadSymbols(); });

// ═══════════════════════════════════════════════════════════
//  AI SCALPER ENGINE
// ═══════════════════════════════════════════════════════════
var ai = {
  running:false, scanning:false, ws:null, scanWs:{},
  pnl:0, trades:0, wins:0, losses:0, stake:1, initStake:1,
  recStep:0, stopped:false,
  cfg:{tp:20,sl:10,max:200,conf:65,mult:1.8,maxRec:3,ticks:50},
  marketData:{}, // symbol -> {ticks:[], lastPrice:0, wins:0, trades:0, digitHistory:[], patternMemory:{}}
  currentSymbol:null, currentCt:null,
  scanSymbols:['R_10','R_25','R_50','R_75','R_100','1HZ10V','1HZ25V','1HZ50V','1HZ75V','1HZ100V'],
  cooldown:{}, // sym -> timestamp, skip market for 30s after loss
  wsErrors:0,
  consecLosses:0, // consecutive loss counter
  paused:false,   // smart pause state
  sessionStart:0, // session start timestamp
  timerInterval:null,
  chartData:[],   // P&L history for chart
  startBalance:0, // balance at session start
  statsRefreshInterval:null, // digit stats refresh timer
  // Pattern memory: per symbol per contract type, track last 200 outcomes
  memory:{}, // sym -> { under8:{outcomes:[], streak:0}, over1:{outcomes:[], streak:0} }
  // Volatility tracker
  volatility:{}, // sym -> rolling stddev
  // Hot/cold streak tracker
  sessionBias:{} // sym -> { under8bias:0, over1bias:0 } updated after each trade
};

function aiScalperInit() {
  // nothing needed on page open
}
function aiToggleStakeMode() {
  var mode = document.getElementById('ai_stake_mode').value;
  document.getElementById('ai_stake_fixed_wrap').style.display = mode === 'fixed' ? '' : 'none';
  document.getElementById('ai_stake_pct_wrap').style.display   = mode === 'percent' ? '' : 'none';
}

function aiLog(msg, type, pnl) {
  var log = document.getElementById('ai-log');
  if (!log) return;
  var t = new Date().toLocaleTimeString();
  var pnlHtml = pnl !== undefined
    ? '<span class="ai-log-pnl '+(pnl>=0?'pos':'neg')+'">'+(pnl>=0?'+':'')+pnl.toFixed(2)+'</span>'
    : '';
  var el = document.createElement('div');
  el.className = 'ai-log-entry '+(type||'info');
  el.innerHTML = '<span class="ai-log-time">'+t+'</span><span class="ai-log-msg">'+msg+'</span>'+pnlHtml;
  log.insertBefore(el, log.firstChild);
  while (log.children.length > 120) log.removeChild(log.lastChild);
}

function aiSetStatus(type, text) {
  var dot = document.getElementById('aiDot');
  var txt = document.getElementById('aiStatusText');
  if (dot) { dot.className = 'ai-dot '+type; }
  if (txt) txt.textContent = text;
}

function aiUpdateStats() {
  var wr = ai.trades > 0 ? Math.round((ai.wins/ai.trades)*100) : 0;
  var pnlEl = document.getElementById('ai_pnl');
  if (pnlEl) { pnlEl.textContent = (ai.pnl>=0?'+':'')+ai.pnl.toFixed(2); pnlEl.style.color = ai.pnl>=0?'#4caf50':'#f44336'; }
  var t = document.getElementById('ai_trades'); if(t) t.textContent = ai.trades;
  var w = document.getElementById('ai_wins'); if(w) w.textContent = ai.wins;
  var l = document.getElementById('ai_losses'); if(l) l.textContent = ai.losses;
  var wr2 = document.getElementById('ai_winrate'); if(wr2) wr2.textContent = wr+'%';
  var cs = document.getElementById('ai_curstake'); if(cs) cs.textContent = '$'+ai.stake.toFixed(2);
}

function aiUpdateSignals(freq, pat, mom) {
  var f = document.getElementById('ai_sig_freq'); if(f) f.style.width=freq+'%';
  var fp = document.getElementById('ai_sig_freq_pct'); if(fp) fp.textContent=freq+'%';
  var p = document.getElementById('ai_sig_pat'); if(p) p.style.width=pat+'%';
  var pp = document.getElementById('ai_sig_pat_pct'); if(pp) pp.textContent=pat+'%';
  var m = document.getElementById('ai_sig_mom'); if(m) m.style.width=mom+'%';
  var mp = document.getElementById('ai_sig_mom_pct'); if(mp) mp.textContent=mom+'%';
}

// ══ WORLD CLASS AI ANALYSIS ENGINE ════════════════════════

// Layer 1: Frequency Analysis (last 100 ticks)
function aiAnalyzeDigitFreq(ticks, decimals, sym) {
  if (ticks.length < 30) return null;
  // Priority: 1) Deriv's own 1000-tick stats, 2) our prefetch, 3) live ticks
  var digits, total;
  if (sym && ai.marketData[sym] && ai.marketData[sym].derivDigitFreq && ai.marketData[sym].derivDigitTotal >= 100) {
    // Use Deriv's authoritative digit distribution
    var dFreq = ai.marketData[sym].derivDigitFreq;
    var dTot  = ai.marketData[sym].derivDigitTotal;
    digits = [];
    for (var d=0; d<10; d++) for (var n=0; n<dFreq[d]; n++) digits.push(d);
    total = dTot;
  } else if (sym && ai.marketData[sym] && ai.marketData[sym].digitFreq && ai.marketData[sym].digitTotal >= 100) {
    var freq = ai.marketData[sym].digitFreq;
    digits = [];
    for (var d=0; d<10; d++) for (var n=0; n<freq[d]; n++) digits.push(d);
    total = ai.marketData[sym].digitTotal;
  } else {
    digits = ticks.slice(-100).map(function(p){
      return Math.floor(p * Math.pow(10, decimals||2)) % 10;
    });
    total = digits.length;
  }
  // Always use raw ticks for recent/veryRecent — never the reconstructed sorted array
  var rawTicks = ticks.slice(-Math.min(ticks.length, 1000));
  var rawRecent     = rawTicks.slice(-20).map(function(p){ return Math.floor(p * Math.pow(10, decimals||2)) % 10; });
  var rawVeryRecent = rawTicks.slice(-10).map(function(p){ return Math.floor(p * Math.pow(10, decimals||2)) % 10; });

  // DIGITUNDER 8: loses when digit >= 8
  var loss8_all  = digits.filter(function(d){ return d >= 8; }).length;
  var loss8_rec  = rawRecent.filter(function(d){ return d >= 8; }).length;
  var loss8_vrec = rawVeryRecent.filter(function(d){ return d >= 8; }).length;
  var under8Conf = Math.min(93,
    ((total - loss8_all) / total * 100) * 0.4 +
    ((20 - loss8_rec)    / 20    * 100) * 0.35 +
    ((10 - loss8_vrec)   / 10    * 100) * 0.25
  );

  // DIGITOVER 1: loses when digit <= 1
  var loss1_all  = digits.filter(function(d){ return d <= 1; }).length;
  var loss1_rec  = rawRecent.filter(function(d){ return d <= 1; }).length;
  var loss1_vrec = rawVeryRecent.filter(function(d){ return d <= 1; }).length;
  var over1Conf = Math.min(93,
    ((total - loss1_all) / total * 100) * 0.4 +
    ((20 - loss1_rec)    / 20    * 100) * 0.35 +
    ((10 - loss1_vrec)   / 10    * 100) * 0.25
  );

  if (under8Conf >= over1Conf) return { ct:'DIGITUNDER', barrier:8, confidence: under8Conf };
  return { ct:'DIGITOVER', barrier:1, confidence: over1Conf };
}

// Layer 2: Pattern Learning (streak + outcome memory)
function aiAnalyzePattern(ticks, sym, decimals) {
  if (!ticks || ticks.length < 20) return null;
  var digits = ticks.slice(-50).map(function(p){
    return Math.floor(p * Math.pow(10, decimals||2)) % 10;
  });

  // Extended streak detection over last 20 ticks for reliability
  var last20 = digits.slice(-20);
  var last10 = digits.slice(-10);
  var danger8_20 = last20.filter(function(d){ return d >= 8; }).length;
  var danger1_20 = last20.filter(function(d){ return d <= 1; }).length;
  var danger8_10 = last10.filter(function(d){ return d >= 8; }).length;
  var danger1_10 = last10.filter(function(d){ return d <= 1; }).length;

  // Weight recent 10 more heavily than last 20
  var danger8 = danger8_10 * 0.6 + danger8_20 * 0.4;
  var danger1 = danger1_10 * 0.6 + danger1_20 * 0.4;

  // Tighter penalty: even 1.5 weighted danger digits starts hurting
  var under8PatConf = Math.min(93, 75 + (1.5 - danger8) * 7);
  var over1PatConf  = Math.min(93, 75 + (1.5 - danger1) * 7);

  // Pattern memory boost: use historical win rate for this symbol+contract
  var mem = ai.memory && ai.memory[sym];
  if (mem) {
    var u8outcomes = mem.under8.outcomes.slice(-30);
    var o1outcomes = mem.over1.outcomes.slice(-30);
    if (u8outcomes.length >= 5) {
      var u8wr = u8outcomes.filter(Boolean).length / u8outcomes.length;
      under8PatConf = Math.min(93, under8PatConf * 0.6 + u8wr * 100 * 0.4);
    }
    if (o1outcomes.length >= 5) {
      var o1wr = o1outcomes.filter(Boolean).length / o1outcomes.length;
      over1PatConf = Math.min(93, over1PatConf * 0.6 + o1wr * 100 * 0.4);
    }
    // Consecutive loss protection: if last 3 trades on a type all lost, skip it
    var lastU8 = mem.under8.outcomes.slice(-3);
    var lastO1 = mem.over1.outcomes.slice(-3);
    if (lastU8.length === 3 && lastU8.every(function(x){ return !x; })) under8PatConf -= 20;
    if (lastO1.length === 3 && lastO1.every(function(x){ return !x; })) over1PatConf  -= 20;
  }

  if (under8PatConf >= over1PatConf) return { ct:'DIGITUNDER', barrier:8, confidence: under8PatConf };
  return { ct:'DIGITOVER', barrier:1, confidence: over1PatConf };
}

// Layer 3: Momentum / Volatility Filter
function aiAnalyzeMomentum(ticks, sym) {
  if (!ticks || ticks.length < 20) return null;
  var digits = ticks.slice(-50).map(function(p){
    return Math.floor(p * Math.pow(10, 2)) % 10;
  });

  // Volatility filter: if market is in extreme run of high/low digits, momentum favors reversion
  var last20 = digits.slice(-20);
  var last10 = digits.slice(-10);
  var highCount20 = last20.filter(function(d){ return d >= 8; }).length;
  var lowCount20  = last20.filter(function(d){ return d <= 1; }).length;
  var highCount10 = last10.filter(function(d){ return d >= 8; }).length;
  var lowCount10  = last10.filter(function(d){ return d <= 1; }).length;

  // Weighted: last 10 = 60%, last 20 = 40%
  var highCount = highCount10 * 0.6 + highCount20 * 0.4;
  var lowCount  = lowCount10  * 0.6 + lowCount20  * 0.4;

  // Reversion signal: 3+ weighted high digits = UNDER likely next
  if (highCount >= 3) return { ct:'DIGITUNDER', barrier:8, confidence: Math.min(93, 70 + highCount * 4) };
  if (lowCount  >= 3) return { ct:'DIGITOVER',  barrier:1, confidence: Math.min(93, 70 + lowCount  * 4) };

  // Neutral: edge to whichever side has fewer danger digits recently
  var under8MomConf = Math.min(88, 75 + (2 - highCount) * 6);
  var over1MomConf  = Math.min(88, 75 + (2 - lowCount)  * 6);

  if (under8MomConf >= over1MomConf) return { ct:'DIGITUNDER', barrier:8, confidence: under8MomConf };
  return { ct:'DIGITOVER', barrier:1, confidence: over1MomConf };
}

function aiPickBestSignal(ticks, decimals, sym) {
  var freqSig = aiAnalyzeDigitFreq(ticks, decimals, sym);
  var patSig  = aiAnalyzePattern(ticks, sym, decimals);
  var momSig  = aiAnalyzeMomentum(ticks, sym);
  var fC = freqSig ? Math.round(freqSig.confidence) : 0;
  var pC = patSig  ? Math.round(patSig.confidence)  : 0;
  var mC = momSig  ? Math.round(momSig.confidence)  : 0;
  aiUpdateSignals(fC, pC, mC);

  // Weighted consensus: freq=40%, pattern=35%, momentum=25%
  // Both under8 and over1 get a weighted score, pick the winner
  function scoreFor(ct) {
    var scores = [], weights = [];
    // If layer agrees: use its confidence. If disagrees: use inverse as penalty. If null: skip.
    if (freqSig) { scores.push(freqSig.ct === ct ? freqSig.confidence : Math.max(0, 100 - freqSig.confidence - 30)); weights.push(0.40); }
    if (patSig)  { scores.push(patSig.ct  === ct ? patSig.confidence  : Math.max(0, 100 - patSig.confidence  - 30)); weights.push(0.35); }
    if (momSig)  { scores.push(momSig.ct  === ct ? momSig.confidence  : Math.max(0, 100 - momSig.confidence  - 30)); weights.push(0.25); }
    if (!scores.length) return 0;
    var totalW = weights.reduce(function(a,b){return a+b;},0);
    return scores.reduce(function(sum,s,i){return sum+s*weights[i];},0) / totalW;
  }
  var under8Score = scoreFor('DIGITUNDER');
  var over1Score  = scoreFor('DIGITOVER');
  var bestCt      = under8Score >= over1Score ? 'DIGITUNDER' : 'DIGITOVER';
  var bestBarrier = bestCt === 'DIGITUNDER' ? 8 : 1;
  var bestConf    = Math.max(under8Score, over1Score);

  // Require minimum confidence threshold
  var thresh = Math.max(ai.cfg.conf || 65, 75);
  if (bestConf < thresh) return null;

  var best = { ct: bestCt, barrier: bestBarrier, confidence: bestConf };
  return best;
}

// ── DIGIT STATS FROM DERIV ─────────────────────────────────
function aiFetchDigitStats(sym) {
  var ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
  ws.onopen = function() {
    ws.send(JSON.stringify({ ticks_history:sym, count:1000, end:'latest', style:'ticks' }));
  };
  ws.onmessage = function(e) {
    var msg = JSON.parse(e.data);
    if (msg.history && msg.history.prices) {
      var prices = msg.history.prices.map(Number);
      var freq = Array(10).fill(0);
      var dec = sym.indexOf('1HZ') !== -1 ? 2 : 2;
      prices.forEach(function(p) {
        freq[Math.floor(p * Math.pow(10, dec)) % 10]++;
      });
      var total = prices.length;
      if (!ai.marketData[sym]) ai.marketData[sym] = { ticks:[], lastPrice:0, wins:0, trades:0 };
      ai.marketData[sym].derivDigitFreq  = freq;
      ai.marketData[sym].derivDigitTotal = total;
      var loss8 = freq[8] + freq[9];
      var loss1 = freq[0] + freq[1];
      ai.marketData[sym].derivUnder8Pct = ((total - loss8) / total * 100).toFixed(1);
      ai.marketData[sym].derivOver1Pct  = ((total - loss1) / total * 100).toFixed(1);
      aiLog('📊 '+sym+' U8:'+ai.marketData[sym].derivUnder8Pct+'% O1:'+ai.marketData[sym].derivOver1Pct+'%','info');
      ws.close();
    }
  };
  ws.onerror = function() { ws.close(); };
}

// ── MARKET SCANNER ─────────────────────────────────────────

function aiScanMarkets() {
  ai.scanSymbols.forEach(function(sym) {
    if (ai.scanWs[sym]) return; // already scanning
    var ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
    ws.onopen = function() {
      ws.send(JSON.stringify({ ticks_history:sym, count:1000, end:'latest', style:'ticks' }));
      ws.send(JSON.stringify({ ticks:sym, subscribe:1 }));
    };
    ws.onmessage = function(e) {
      var msg = JSON.parse(e.data);
      if (!ai.marketData[sym]) {
        ai.marketData[sym] = { ticks:[], lastPrice:0, wins:0, trades:0 };
        ai.memory[sym] = {
          under8:{ outcomes:[], streak:0, lastCt:'DIGITUNDER' },
          over1: { outcomes:[], streak:0, lastCt:'DIGITOVER'  }
        };
        ai.volatility[sym] = 0;
        ai.sessionBias[sym] = { under8:0, over1:0 };
      }
      if (msg.history && msg.history.prices) {
        var prices = msg.history.prices.map(Number);
        // Merge with existing ticks, keep latest 1000
        ai.marketData[sym].ticks = prices.concat(ai.marketData[sym].ticks).slice(-1000);
        // Pre-calculate digit distribution from full history
        var dec = sym.indexOf('1HZ') !== -1 ? 2 : 2;
        var digits = prices.map(function(p){ return Math.floor(p * Math.pow(10, dec)) % 10; });
        var freq = Array(10).fill(0);
        digits.forEach(function(d){ freq[d]++; });
        ai.marketData[sym].digitFreq = freq;
        ai.marketData[sym].digitTotal = digits.length;
      }
      if (msg.tick && msg.tick.quote) {
        ai.marketData[sym].ticks.push(Number(msg.tick.quote));
        if (ai.marketData[sym].ticks.length > 500) ai.marketData[sym].ticks.shift();
        ai.marketData[sym].lastPrice = Number(msg.tick.quote);
        // Update rolling volatility (stddev of last 20 tick changes)
        var t = ai.marketData[sym].ticks;
        if (t.length >= 20) {
          var changes = [];
          for (var _i = t.length-20; _i < t.length-1; _i++) changes.push(Math.abs(t[_i+1]-t[_i]));
          var mean = changes.reduce(function(a,b){return a+b;},0)/changes.length;
          var variance = changes.reduce(function(a,b){return a+Math.pow(b-mean,2);},0)/changes.length;
          ai.volatility[sym] = Math.sqrt(variance);
        }
      }
    };
    ws.onerror = function() { ws.close(); delete ai.scanWs[sym]; };
    ws.onclose = function() { delete ai.scanWs[sym]; };
    ai.scanWs[sym] = ws;
  });
}

function aiDrawChart() {
  var canvas = document.getElementById('ai_pnl_chart');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.offsetWidth || 240;
  canvas.width = w; canvas.height = 80;
  ctx.clearRect(0,0,w,80);
  var data = ai.chartData;
  if (data.length < 2) return;
  var min = Math.min.apply(null,data), max = Math.max.apply(null,data);
  if (max === min) { max += 1; min -= 1; }
  var range = max - min;
  var step = w / (data.length-1);
  ctx.beginPath();
  data.forEach(function(v,i){
    var x = i*step, y = 80 - ((v-min)/range*70 + 5);
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.strokeStyle = ai.pnl >= 0 ? '#4caf50' : '#f44336';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Zero line
  var zeroY = 80 - ((0-min)/range*70+5);
  ctx.beginPath(); ctx.moveTo(0,zeroY); ctx.lineTo(w,zeroY);
  ctx.strokeStyle='#333'; ctx.lineWidth=1; ctx.stroke();
}

function aiUpdateMarketTable() {
  var el = document.getElementById('ai_market_table');
  if (!el) return;
  var rows = ai.scanSymbols.map(function(sym) {
    var d = ai.marketData[sym];
    if (!d) return '';
    var wr = d.trades > 0 ? Math.round(d.wins/d.trades*100) : '-';
    var u8 = d.derivUnder8Pct || '-';
    var o1 = d.derivOver1Pct  || '-';
    var cd = ai.cooldown[sym] && Date.now()-ai.cooldown[sym]<30000 ? '❄️' : '';
    return '<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #1a1a1a">'+
      '<span>'+cd+sym+'</span>'+
      '<span style="color:#4caf50">U8:'+u8+'%</span>'+
      '<span style="color:#64b5f6">O1:'+o1+'%</span>'+
      '<span style="color:#f0c040">WR:'+wr+'%</span>'+
      '</div>';
  }).join('');
  el.innerHTML = rows || 'Scanning...';
}

function aiPickBestMarket() {
  var now = Date.now();
  var candidates = [];

  ai.scanSymbols.forEach(function(sym) {
    var data = ai.marketData[sym];
    // Need at least 100 ticks for reliable analysis
    if (!data || data.ticks.length < 100) return;
    // Skip markets on cooldown (30s after a loss)
    if (ai.cooldown[sym] && now - ai.cooldown[sym] < 30000) return;
    var dec = sym.indexOf('1HZ') !== -1 ? 2 : 2;
    var sig = aiPickBestSignal(data.ticks, dec, sym);
    if (!sig) return;

    // ── STRICT LOSS AVOIDANCE FILTERS ──────────────────────
    // 1. Deriv historical edge: require 78%+ win rate for chosen contract
    if (sig.ct === 'DIGITUNDER') {
      var u8pct = parseFloat(data.derivUnder8Pct);
      if (!isNaN(u8pct) && u8pct < 78) return; // statistically weak market for this contract
    } else {
      var o1pct = parseFloat(data.derivOver1Pct);
      if (!isNaN(o1pct) && o1pct < 78) return;
    }

    // 2. Session performance: skip market if win rate < 50% after 5+ trades
    if (data.trades >= 5 && (data.wins / data.trades) < 0.50) return;

    // 3. Pattern memory: hard skip if last 3 on this contract all lost
    var mem = ai.memory[sym];
    if (mem) {
      var ctKey = sig.ct === 'DIGITUNDER' ? 'under8' : 'over1';
      var last3 = mem[ctKey].outcomes.slice(-3);
      if (last3.length === 3 && last3.every(function(x){ return !x; })) return;
    }

    // 4. Minimum confidence gate (must exceed configured threshold)
    if (sig.confidence < ai.cfg.conf) return;
    // ───────────────────────────────────────────────────────

    // Win rate bonus from session history
    var wrBonus = data.trades > 5 ? (data.wins / data.trades) * 15 : 0;
    // Tick quality bonus: more ticks = more reliable
    var tickBonus = Math.min(5, data.ticks.length / 100);
    var score = sig.confidence + wrBonus + tickBonus;
    candidates.push({ sym:sym, sig:sig, score:score });
  });

  if (!candidates.length) return null;

  // Cross-market consensus: check how many markets agree on contract type
  var under8Count = candidates.filter(function(c){ return c.sig.ct === 'DIGITUNDER'; }).length;
  var over1Count  = candidates.filter(function(c){ return c.sig.ct === 'DIGITOVER';  }).length;
  var majorCt = under8Count >= over1Count ? 'DIGITUNDER' : 'DIGITOVER';

  // Boost score for markets that agree with majority
  candidates.forEach(function(c) {
    if (c.sig.ct === majorCt) c.score += 5;
  });

  // Sort by score, pick best
  candidates.sort(function(a,b){ return b.score - a.score; });
  return candidates[0];
}

// ── TRADE LOOP ─────────────────────────────────────────────

async function aiStart() {
  if (!state.bearerToken || !state.accountId) { showToast('Please log in first'); return; }
  if (ai.running) return;
  // Auto stake from balance %
  var stakeMode = document.getElementById('ai_stake_mode') ? document.getElementById('ai_stake_mode').value : 'fixed';
  if (stakeMode === 'percent') {
    var balEl = document.getElementById('heroBalance');
    var bal = balEl ? parseFloat(balEl.textContent) : 0;
    if (bal > 0) {
      var pct = parseFloat(document.getElementById('ai_stake_pct').value) || 1;
      document.getElementById('ai_stake').value = (bal * pct / 100).toFixed(2);
    }
  }
  ai.startBalance = 0; // will be set on first balance check
  ai.consecLosses = 0;
  ai.paused = false;
  ai.chartData = [];
  ai.sessionStart = Date.now();
  // Session timer
  if (ai.timerInterval) clearInterval(ai.timerInterval);
  ai.timerInterval = setInterval(function(){
    if (!ai.running) { clearInterval(ai.timerInterval); return; }
    var elapsed = Math.floor((Date.now() - ai.sessionStart) / 1000);
    var m = Math.floor(elapsed/60), s = elapsed%60;
    var el = document.getElementById('ai_timer');
    if (el) el.textContent = m+'m '+s+'s';
  }, 1000);
  // Auto-refresh digit stats every 5 minutes
  if (ai.statsRefreshInterval) clearInterval(ai.statsRefreshInterval);
  ai.statsRefreshInterval = setInterval(function(){
    if (!ai.running) { clearInterval(ai.statsRefreshInterval); return; }
    ai.scanSymbols.forEach(function(sym){ aiFetchDigitStats(sym); });
  }, 300000);
  ai.cfg.tp      = parseFloat(document.getElementById('ai_tp').value)||20;
  ai.cfg.sl      = parseFloat(document.getElementById('ai_sl').value)||10;
  ai.cfg.max     = parseInt(document.getElementById('ai_max').value)||200;
  ai.cfg.conf    = parseFloat(document.getElementById('ai_conf').value)||65;
  ai.cfg.mult    = parseFloat(document.getElementById('ai_mult').value)||1.8;
  ai.cfg.maxRec  = parseInt(document.getElementById('ai_maxrec').value)||3;
  ai.cfg.ticks   = parseInt(document.getElementById('ai_ticks').value)||50;
  ai.initStake   = parseFloat(document.getElementById('ai_stake').value)||1;
  ai.stake       = ai.initStake;
  ai.pnl=0; ai.trades=0; ai.wins=0; ai.losses=0; ai.recStep=0; ai.consecLosses=0;
  ai.wsUrl = null;
  ai.wsErrors = 0;
  ai.stopped=false; ai.running=true;
  document.getElementById('aiStartBtn').style.display='none';
  document.getElementById('aiStopBtn').style.display='';
  document.getElementById('ai-log').innerHTML='';
  aiUpdateStats();
  aiSetStatus('scanning','Starting market scan...');
  aiLog('AI Scalper started — trading','info');
  // Wait for data to accumulate
  setTimeout(function(){ if (ai.running) aiTradeLoop(); }, 4000);
}

function aiStop() {
  ai.stopped=true; ai.running=false;
  if (ai.timerInterval) { clearInterval(ai.timerInterval); ai.timerInterval=null; }
  if (ai.statsRefreshInterval) { clearInterval(ai.statsRefreshInterval); ai.statsRefreshInterval=null; }
  if (ai.ws) { try{ai.ws.close();}catch(e){} ai.ws=null; }
  document.getElementById('aiStartBtn').style.display='';
  document.getElementById('aiStopBtn').style.display='none';
  aiSetStatus('idle','Stopped — P&L: '+(ai.pnl>=0?'+':'')+ai.pnl.toFixed(2));
  aiLog('Session ended — P&L: '+(ai.pnl>=0?'+':'')+ai.pnl.toFixed(2),'info');
}

async function aiTradeLoop() {
  if (ai.stopped || !ai.running) return;
  // Smart pause after consecutive losses
  if (ai.paused) {
    aiSetStatus('scanning','Paused — cooling down...');
    setTimeout(function(){ if(ai.running){ ai.paused=false; ai.consecLosses=0; aiLog('▶ Resuming after cooldown','info'); aiTradeLoop(); }}, 120000);
    return;
  }
  // Balance protection check
  if (ai.startBalance > 0) {
    var balEl = document.getElementById('heroBalance');
    var curBal = balEl ? parseFloat(balEl.textContent) : 0;
    var protect = parseFloat(document.getElementById('ai_bal_protect') ? document.getElementById('ai_bal_protect').value : 20) || 20;
    if (curBal > 0 && curBal < ai.startBalance * (1 - protect/100)) {
      aiStop(); showToast('⚠️ Balance protection triggered'); return;
    }
  }
  if (ai.trades >= ai.cfg.max) { aiStop(); showToast('Max trades reached'); return; }
  if (ai.pnl <= -Math.abs(ai.cfg.sl)) { aiStop(); showToast('Stop loss hit'); return; }
  if (ai.pnl >= Math.abs(ai.cfg.tp)) { aiStop(); showToast('Take profit reached!'); return; }

  aiSetStatus('scanning','Scanning markets...');
  var pick = aiPickBestMarket();
  if (!pick) {
    aiLog('No high-confidence signal — waiting...','info');
    setTimeout(function(){ if(ai.running) aiTradeLoop(); }, 500);
    return;
  }

  ai.currentSymbol = pick.sym;
  ai.currentCt     = pick.sig.ct;
  var mEl = document.getElementById('ai_market_display');
  if (mEl) mEl.textContent = pick.sym + ' — ' + pick.sig.ct + ' (' + (isNaN(pick.score) ? '?' : Math.round(pick.score)) + '% score)';
  ai._tradeStart = Date.now();
  aiLog('Signal: '+pick.sym+' | '+pick.sig.ct+(pick.sig.barrier!=null?' barrier:'+pick.sig.barrier:'')+' | conf:'+Math.round(pick.sig.confidence)+'%','info');

  try {
    if (!ai.wsUrl) ai.wsUrl = await getAuthWsUrl(state.bearerToken, state.accountId);
    if (!ai.running) return;
    ai.ws = new WebSocket(ai.wsUrl);
    ai.ws.onopen = function() {
      aiSetStatus('running','Trading '+pick.sym+' — stake $'+ai.stake.toFixed(2));
      var proposal = {
        proposal:1, amount:parseFloat(ai.stake.toFixed(2)), basis:'stake',
        contract_type:pick.sig.ct, currency:state.currency||'USD',
        duration:1, duration_unit:'t', underlying_symbol:pick.sym
      };
      if (pick.sig.barrier != null) proposal.barrier = pick.sig.barrier;
      ai.ws.send(JSON.stringify(proposal));
    };
    ai.ws.onmessage = function(e){ aiHandleMsg(JSON.parse(e.data), pick); };
    ai.ws.onerror   = function(){ ai.wsUrl=null; ai.wsErrors++; aiLog('WS error — retrying','info'); var delay = Math.min(5000, 1000 * ai.wsErrors); setTimeout(function(){if(ai.running)aiTradeLoop();},delay); };
    ai.ws.onclose   = function(){};
  } catch(err) {
    aiLog('Connect error: '+err.message,'info');
    setTimeout(function(){if(ai.running)aiTradeLoop();},1000);
  }
}

function aiHandleMsg(msg, pick) {
  if (msg.error) {
    aiLog('API error: '+msg.error.message,'info');
    setTimeout(function(){if(ai.running)aiTradeLoop();},500);
    return;
  }
  if (msg.msg_type==='proposal' && msg.proposal) {
    ai.ws.send(JSON.stringify({ buy:msg.proposal.id, price:msg.proposal.ask_price }));
    return;
  }
  if (msg.msg_type==='buy' && msg.buy) {
    ai.ws.send(JSON.stringify({ proposal_open_contract:1, contract_id:msg.buy.contract_id, subscribe:1 }));
    return;
  }
  if (msg.msg_type==='proposal_open_contract' && msg.proposal_open_contract) {
    var poc = msg.proposal_open_contract;
    if (!poc.is_sold) return;
    var won    = poc.profit > 0;
    var profit = parseFloat(poc.profit)||0;
    ai.pnl    += profit;
    ai.trades++;
    // Record outcome in pattern memory
    if (!ai.memory[pick.sym]) ai.memory[pick.sym] = {
      under8:{outcomes:[],streak:0}, over1:{outcomes:[],streak:0}
    };
    var memKey = pick.sig.ct === 'DIGITUNDER' ? 'under8' : 'over1';
    ai.memory[pick.sym][memKey].outcomes.push(won);
    if (ai.memory[pick.sym][memKey].outcomes.length > 200) ai.memory[pick.sym][memKey].outcomes.shift();

    if (won) {
      ai.wins++; ai.recStep=0; ai.stake=ai.initStake;
      ai.memory[pick.sym][memKey].streak = Math.max(0, (ai.memory[pick.sym][memKey].streak||0)) + 1;
      ai.consecLosses = 0;
      if (ai.marketData[pick.sym]) { ai.marketData[pick.sym].wins++; ai.marketData[pick.sym].trades++; }
      aiLog('WIN  '+pick.sym+' '+pick.sig.ct, 'win', profit);
    } else {
      ai.losses++;
      ai.memory[pick.sym][memKey].streak = Math.min(0, (ai.memory[pick.sym][memKey].streak||0)) - 1;
      if (ai.marketData[pick.sym]) ai.marketData[pick.sym].trades++;
      ai.cooldown[pick.sym] = Date.now();
      ai.consecLosses++;
      var pauseAfter = parseInt(document.getElementById('ai_pause_after') ? document.getElementById('ai_pause_after').value : 3) || 3;
      if (ai.consecLosses >= pauseAfter) {
        ai.paused = true;
        aiLog('⏸ '+pauseAfter+' consecutive losses — pausing 2 minutes','info');
      }
      if (ai.recStep < ai.cfg.maxRec) {
        ai.recStep++;
        ai.stake = parseFloat((ai.initStake * Math.pow(ai.cfg.mult, ai.recStep)).toFixed(2));
      } else {
        ai.recStep=0; ai.stake=ai.initStake;
        aiLog('Max recovery reached — resetting stake','info');
      }
      aiLog('LOSS '+pick.sym+' '+pick.sig.ct, 'loss', profit);
    }
    aiUpdateStats();
    // Update P&L chart
    ai.chartData.push(ai.pnl);
    aiDrawChart();
    // Update market performance table
    aiUpdateMarketTable();
    if (ai.ws) { try{ai.ws.close();}catch(e){} ai.ws=null; }
    ai.wsUrl=null; ai.wsErrors=0; // refresh wsUrl, reset error counter
    setTimeout(function(){if(ai.running)aiTradeLoop();},200);
  }
}

// Dynamic banner height
function updateBannerHeight() {
  var b = document.getElementById('riskBanner');
  var h = (b && b.offsetHeight > 0) ? b.offsetHeight : 0;
  document.documentElement.style.setProperty('--banner-h', h + 'px');
}
document.addEventListener('DOMContentLoaded', function() {
  updateBannerHeight();
  window.addEventListener('resize', updateBannerHeight);
});
function dismissRisk() {
  var b = document.getElementById('riskBanner');
  if (b) { b.style.display = 'none'; updateBannerHeight(); }
}

// ═══════════════════════════════════════════════════════════
// BULK MATCHES & DIFFERS ENGINE
// ═══════════════════════════════════════════════════════════
var bmd = {
  running: false,
  scanning: false,
  sym: null,
  scanWs: {},
  marketData: {}, // sym -> { ticks[], digitFreq[], digitTotal, confidence[] }
  digitWins: Array(10).fill(0),
  digitLosses: Array(10).fill(0),
  digitSkip: Array(10).fill(0), // consecutive losses per digit
  pnl: 0,
  trades: 0,
  wins: 0,
  losses: 0,
  roundsDone: 0,
  consecutiveLossRounds: 0,
  consecutiveWinRounds: 0,
  chartData: [],
  timerInterval: null,
  startTime: null,
  startBalance: 0,
  allSyms: ['R_10','R_25','R_50','R_75','R_100','1HZ10V','1HZ25V','1HZ50V','1HZ75V','1HZ100V']
};

function bmdLog(msg, type) {
  var log = document.getElementById('bmd-log');
  if (!log) return;
  var color = type === 'win' ? '#4caf50' : type === 'loss' ? '#f44336' : type === 'round' ? '#c9a84c' : '#888';
  var el = document.createElement('div');
  el.style.cssText = 'padding:3px 0;border-bottom:1px solid #111;font-size:.75rem;color:'+color;
  el.textContent = new Date().toLocaleTimeString() + '  ' + msg;
  log.insertBefore(el, log.firstChild);
  if (log.children.length > 200) log.removeChild(log.lastChild);
}

function bmdSetStatus(type, text) {
  var dot = document.getElementById('bmdDot');
  var txt = document.getElementById('bmdStatusText');
  if (dot) { dot.className = 'ai-dot ' + type; }
  if (txt) txt.textContent = text;
}

function bmdUpdateStats() {
  var wr = bmd.trades > 0 ? Math.round(bmd.wins / bmd.trades * 100) : 0;
  var pnlEl = document.getElementById('bmd_pnl');
  if (pnlEl) { pnlEl.textContent = (bmd.pnl >= 0 ? '+' : '') + bmd.pnl.toFixed(2); pnlEl.style.color = bmd.pnl >= 0 ? '#4caf50' : '#f44336'; }
  var setEl = function(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('bmd_rounds_done', bmd.roundsDone);
  setEl('bmd_trades', bmd.trades);
  setEl('bmd_wins', bmd.wins);
  setEl('bmd_losses', bmd.losses);
  setEl('bmd_winrate', wr + '%');
  // chart
  bmd.chartData.push(bmd.pnl);
  if (bmd.chartData.length > 60) bmd.chartData.shift();
  bmdDrawChart();
}

function bmdDrawChart() {
  var canvas = document.getElementById('bmd_pnl_chart');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.offsetWidth || 240;
  canvas.width = w; canvas.height = 70;
  ctx.clearRect(0, 0, w, 70);
  var data = bmd.chartData;
  if (data.length < 2) return;
  var min = Math.min.apply(null, data), max = Math.max.apply(null, data);
  if (max === min) { max += 1; min -= 1; }
  var range = max - min;
  var step = w / (data.length - 1);
  ctx.beginPath();
  data.forEach(function(v, i) {
    var x = i * step, y = 70 - ((v - min) / range * 60 + 5);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = bmd.pnl >= 0 ? '#4caf50' : '#f44336';
  ctx.lineWidth = 2; ctx.stroke();
  var zeroY = 70 - ((0 - min) / range * 60 + 5);
  ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(w, zeroY);
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
}

// ── DIGIT FREQUENCY ANALYSIS ───────────────────────────────
function bmdAnalyzeMarket(sym, prices, decimals) {
  var total = prices.length;

  function countFreq(arr) {
    var f = Array(10).fill(0);
    arr.forEach(function(p){ f[Math.floor(p*Math.pow(10,decimals))%10]++; });
    return f;
  }
  function getRanks(freq) {
    var ranks = Array(10).fill(0);
    freq.map(function(f,d){ return {d:d,f:f}; })
      .sort(function(a,b){ return b.f-a.f; })
      .forEach(function(x,i){ ranks[x.d]=i; });
    return ranks;
  }
  function makeDigits(freq, tot) {
    return freq.map(function(f,d){ return {d:d, count:f, pct: f/tot*100}; });
  }

  var freq1000 = countFreq(prices);
  var freq100  = countFreq(prices.slice(-100));
  var freq20   = countFreq(prices.slice(-20));

  var r1000 = getRanks(freq1000);
  var r100  = getRanks(freq100);
  var r20   = getRanks(freq20);

  // Combined rank: 50% long-term + 30% recent + 20% right now
  var digitsCombined = Array.from({length:10}, function(_,d) {
    var cr = r1000[d]*0.5 + r100[d]*0.3 + r20[d]*0.2;
    return { d:d, count:freq1000[d], pct:freq1000[d]/total*100, pctAll:freq1000[d]/total*100, combinedRank:cr, scoreMatch:(9-cr)*11, scoreDiff:cr*11 };
  });

  return {
    freq: freq1000, total: total,
    confidence: digitsCombined,        // keep for chart compatibility
    digits1000: makeDigits(freq1000, total),
    digits100:  makeDigits(freq100,  100),
    digits20:   makeDigits(freq20,   20),
    digitsCombined: digitsCombined
  };
}

function bmdPickDigits(analysis, mode) {
  var pool;
  if (mode && mode.indexOf('_20') !== -1) {
    pool = analysis.digits20.slice().sort(function(a,b){ return b.count-a.count; });
  } else if (mode && mode.indexOf('_100') !== -1) {
    pool = analysis.digits100.slice().sort(function(a,b){ return b.count-a.count; });
  } else if (mode && mode.indexOf('_1000') !== -1) {
    pool = analysis.digits1000.slice().sort(function(a,b){ return b.count-a.count; });
  } else {
    // Combined — sort by combinedRank ascending (0 = best match)
    pool = analysis.digitsCombined.slice().sort(function(a,b){ return a.combinedRank-b.combinedRank; });
  }
  // Match: only digits appearing 13%+ (edge above random 10%)
  // Differ: only digits appearing 7% or less (edge below random 10%)
  var matchDigits = pool.slice(0, 5).filter(function(d) { return d.pct >= 13; });
  var diffDigits  = pool.slice(5).filter(function(d) { return d.pct <= 7; });

  // Fallback: if no digits meet threshold, take top/bottom 3 anyway
  if (matchDigits.length === 0) matchDigits = pool.slice(0, 3);
  if (diffDigits.length === 0)  diffDigits  = pool.slice(7);

  return { matchDigits: matchDigits, diffDigits: diffDigits };
}

function bmdRenderFreqChart(sym, analysis) {
  var el = document.getElementById('bmd_freq_chart');
  if (!el) return;
  var conf = analysis.confidence;
  var matchTop5 = conf.slice().sort(function(a,b){ return b.scoreMatch-a.scoreMatch; }).slice(0,5).map(function(c){ return c.d; });
  var diffTop5  = conf.slice().sort(function(a,b){ return b.scoreDiff-a.scoreDiff;  }).slice(0,5).map(function(c){ return c.d; });
  var maxPct = Math.max.apply(null, conf.map(function(c){ return c.pctAll; }));
  el.innerHTML = conf.map(function(c) {
    var cls = matchTop5.indexOf(c.d) !== -1 ? 'match' : diffTop5.indexOf(c.d) !== -1 ? 'diff' : 'neutral';
    var h = Math.max(4, Math.round(c.pctAll / maxPct * 80));
    return '<div class="bmd-freq-bar-wrap">'+
      '<div class="bmd-freq-pct">'+c.pctAll.toFixed(1)+'%</div>'+
      '<div class="bmd-freq-bar '+cls+'" style="height:'+h+'px"></div>'+
      '<div class="bmd-freq-label">'+c.d+'</div>'+
      '</div>';
  }).join('');
  var lbl = document.getElementById('bmd_market_label');
  if (lbl) lbl.textContent = sym + ' — ' + analysis.total + ' ticks';
}

// ── MARKET SCANNER & AUTO-PICK ─────────────────────────────
function bmdScanAll(callback) {
  var syms = bmd.allSyms;
  var done = 0;
  bmdSetStatus('scanning', 'Scanning all markets...');
  syms.forEach(function(sym) {
    var ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
    ws.onopen = function() {
      ws.send(JSON.stringify({ ticks_history: sym, count: 1000, end: 'latest', style: 'ticks' }));
    };
    ws.onmessage = function(e) {
      var msg = JSON.parse(e.data);
      if (msg.history && msg.history.prices) {
        var prices = msg.history.prices.map(Number);
        var dec = sym.indexOf('1HZ') !== -1 ? 2 : 2;
        var analysis = bmdAnalyzeMarket(sym, prices, dec);
        bmd.marketData[sym] = { prices: prices, decimals: dec, analysis: analysis };
        ws.close();
        done++;
        if (done === syms.length) callback();
      }
    };
    ws.onerror = function() { ws.close(); done++; if (done === syms.length) callback(); };
  });
}

function bmdPickBestMarket() {
  // Best market = highest deviation from uniform 10% across top 5 combined digits
  var best = null, bestSkew = -1;
  bmd.allSyms.forEach(function(sym) {
    var d = bmd.marketData[sym];
    if (!d) return;
    var top5 = d.analysis.digitsCombined.slice().sort(function(a,b){ return a.combinedRank-b.combinedRank; }).slice(0,5);
    var skew = top5.reduce(function(s,c){ return s + Math.abs(c.pct - 10); }, 0);
    if (skew > bestSkew) { bestSkew = skew; best = sym; }
  });
  // Require minimum skew of 5% — flat markets have no edge
  if (bestSkew < 5) { bmdLog('All markets flat (skew '+bestSkew.toFixed(1)+'%) — waiting', 'info'); return null; }
  return best;
}

// ── TRADE EXECUTION ────────────────────────────────────────
// Single WS per trade: proposal → buy → result on same connection (no second WS)
function bmdPlaceTrade(sym, contractType, digit, stake, wsUrl, onResult) {
  var done = false;
  var timeout = setTimeout(function() {
    if (!done) { done = true; ws.close(); onResult(false, -stake, digit, 'timeout'); }
  }, 15000);
  var ws = createWS(
    function() {
      wsSend(ws, {
        proposal: 1, amount: parseFloat(stake.toFixed(2)), basis: 'stake',
        contract_type: contractType, currency: state.currency || 'USD',
        duration: 1, duration_unit: 't', underlying_symbol: sym, barrier: digit
      });
    },
    function(msg) {
      if (msg.error) {
        if (!done) { done = true; clearTimeout(timeout); onResult(false, 0, digit, msg.error.message); ws.close(); }
        return;
      }
      if (msg.proposal) {
        wsSend(ws, { buy: msg.proposal.id, price: msg.proposal.ask_price });
      }
      if (msg.buy) {
        wsSend(ws, { proposal_open_contract: 1, contract_id: msg.buy.contract_id, subscribe: 1 });
      }
      if (msg.proposal_open_contract && msg.proposal_open_contract.is_sold) {
        if (!done) {
          done = true;
          clearTimeout(timeout);
          var profit = parseFloat(msg.proposal_open_contract.profit);
          onResult(profit >= 0, profit, digit, null);
          ws.close();
        }
      }
    },
    function() { if (!done) { done = true; clearTimeout(timeout); onResult(false, -stake, digit, 'WS closed'); } },
    function() { if (!done) { done = true; clearTimeout(timeout); onResult(false, -stake, digit, 'WS error'); } },
    wsUrl
  );
}

// ── ROUND EXECUTION ────────────────────────────────────────
async function bmdRunRound(sym, contractType, digits, stake) {
  var wsUrls = await Promise.all(digits.map(function() {
    return getAuthWsUrl(state.bearerToken, state.accountId);
  }));
  return new Promise(function(resolve) {
    var results = [];
    var pending = digits.length;
    if (pending === 0) { resolve([]); return; }

    digits.forEach(function(digitConf, i) {
      var d = digitConf.d;
      bmdPlaceTrade(sym, contractType, d, stake, wsUrls[i], function(won, profit, digit, err) {
        if (err) bmdLog('Trade error digit '+digit+': '+err, 'info');
        results.push({ digit: digit, won: won, profit: profit });
        pending--;
        if (pending === 0) {
          results.forEach(function(r) {
            if (r.won) { bmd.digitWins[r.digit]++; bmd.digitSkip[r.digit] = Math.max(0, bmd.digitSkip[r.digit] - 1); }
            else        { bmd.digitLosses[r.digit]++; bmd.digitSkip[r.digit]++; }
            bmd.trades++;
            if (r.won) bmd.wins++; else bmd.losses++;
            bmd.pnl += r.profit;
            bmdUpdateDigitCard(r.digit);
          });
          bmdUpdateStats();
          resolve(results);
        }
      });
    });
  });
}

function bmdUpdateDigitCard(d) {
  var w = document.getElementById('bmd_dw_' + d);
  var l = document.getElementById('bmd_dl_' + d);
  var card = document.getElementById('bmd_dperf_' + d);
  if (w) w.textContent = bmd.digitWins[d] + 'W';
  if (l) l.textContent = bmd.digitLosses[d] + 'L';
  if (card) {
    card.classList.remove('hot', 'cold');
    if (bmd.digitWins[d] > bmd.digitLosses[d]) card.classList.add('hot');
    else if (bmd.digitLosses[d] > bmd.digitWins[d]) card.classList.add('cold');
  }
}

function bmdAddRoundCard(roundNum, results, roundPnl) {
  var log = document.getElementById('bmd_rounds_log');
  if (!log) return;
  var icons = results.map(function(r) { return r.won ? '✅' : '❌'; }).join('');
  var card = document.createElement('div');
  card.className = 'bmd-round-card';
  var pnlClass = roundPnl >= 0 ? 'pos' : 'neg';
  card.innerHTML = '<span class="bmd-round-label">Round ' + roundNum + '</span>' +
    '<span class="bmd-round-results">' + icons + '</span>' +
    '<span class="bmd-round-pnl ' + pnlClass + '">' + (roundPnl >= 0 ? '+' : '') + roundPnl.toFixed(2) + '</span>';
  log.insertBefore(card, log.firstChild);
  if (log.children.length > 30) log.removeChild(log.lastChild);
}

// ── MAIN LOOP ──────────────────────────────────────────────
async function bmdMainLoop() {
  if (!bmd.running) return;

  var maxRounds   = parseInt(document.getElementById('bmd_rounds').value) || 10;
  var stopLossR   = parseInt(document.getElementById('bmd_stop_loss_rounds').value) || 3;
  var tpRounds    = parseInt(document.getElementById('bmd_tp_rounds').value) || 5;
  var stake       = parseFloat(document.getElementById('bmd_stake').value) || 1;
  var minConf     = parseFloat(document.getElementById('bmd_min_conf').value) || 60;
  var contractTypeSel = document.getElementById('bmd_type').value;
  var balProtect  = parseFloat(document.getElementById('bmd_bal_protect').value) || 20;

  if (bmd.roundsDone >= maxRounds) { bmdStop(); bmdLog('Max rounds reached', 'round'); return; }
  if (bmd.consecutiveLossRounds >= stopLossR) { bmdStop(); bmdLog('Stop: ' + stopLossR + ' consecutive losing rounds', 'round'); return; }
  if (bmd.consecutiveWinRounds >= tpRounds)  { bmdStop(); bmdLog('Take profit: ' + tpRounds + ' consecutive winning rounds', 'round'); return; }

  // Balance protection
  if (bmd.startBalance > 0) {
    var balEl = document.getElementById('heroBalance');
    var curBal = balEl ? parseFloat(balEl.textContent) : 0;
    if (curBal > 0 && curBal < bmd.startBalance * (1 - balProtect / 100)) {
      bmdStop(); bmdLog('Balance protection triggered', 'round'); return;
    }
  }

  // Resolve symbol
  var sym = document.getElementById('bmd_sym').value;
  if (sym === 'auto') {
    bmdSetStatus('scanning', 'Scanning all markets for best signal...');
    await new Promise(function(res) { bmdScanAll(res); });
    sym = bmdPickBestMarket();
    if (!sym) { bmdLog('No market data — retrying in 3s', 'info'); setTimeout(bmdMainLoop, 3000); return; }
    bmdLog('Auto-picked: ' + sym, 'info');
  } else {
    // Fetch fresh data for selected symbol
    if (!bmd.marketData[sym]) {
      bmdSetStatus('scanning', 'Fetching ' + sym + ' data...');
      await new Promise(function(res) {
        var ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
        ws.onopen = function() { ws.send(JSON.stringify({ ticks_history: sym, count: 1000, end: 'latest', style: 'ticks' })); };
        ws.onmessage = function(e) {
          var msg = JSON.parse(e.data);
          if (msg.history && msg.history.prices) {
            var prices = msg.history.prices.map(Number);
            var dec = sym.indexOf('1HZ') !== -1 ? 2 : 2;
            var analysis = bmdAnalyzeMarket(sym, prices, dec);
            bmd.marketData[sym] = { prices: prices, decimals: dec, analysis: analysis };
            ws.close(); res();
          }
        };
        ws.onerror = function() { ws.close(); res(); };
      });
    }
  }

  var d = bmd.marketData[sym];
  if (!d) { bmdLog('No data for ' + sym, 'info'); setTimeout(bmdMainLoop, 2000); return; }

  bmdRenderFreqChart(sym, d.analysis);

  var picked = bmdPickDigits(d.analysis, contractTypeSel);
  bmd.sym = sym;

  var roundResults = [];
  var roundPnl = 0;

  if (contractTypeSel === 'DIGITMATCH' || contractTypeSel === 'both') {
    if (picked.matchDigits.length === 0) { bmdLog('No match candidates', 'info'); }
    else {
      bmdSetStatus('running', 'Placing ' + picked.matchDigits.length + ' MATCH trades on ' + sym);
      bmdLog('Round '+(bmd.roundsDone+1)+' MATCH: digits '+picked.matchDigits.map(function(c){return c.d;}).join(','), 'round');
      var res = await bmdRunRound(sym, 'DIGITMATCH', picked.matchDigits, stake);
      roundResults = roundResults.concat(res);
    }
  }
  if (contractTypeSel === 'DIGITDIFF' || contractTypeSel === 'both') {
    if (picked.diffDigits.length === 0) { bmdLog('No differ candidates', 'info'); }
    else {
      bmdSetStatus('running', 'Placing ' + picked.diffDigits.length + ' DIFFER trades on ' + sym);
      bmdLog('Round '+(bmd.roundsDone+1)+' DIFFER: digits '+picked.diffDigits.map(function(c){return c.d;}).join(','), 'round');
      var res2 = await bmdRunRound(sym, 'DIGITDIFF', picked.diffDigits, stake);
      roundResults = roundResults.concat(res2);
    }
  }

  if (roundResults.length > 0) {
    roundPnl = roundResults.reduce(function(s, r) { return s + r.profit; }, 0);
    var roundWins = roundResults.filter(function(r){ return r.won; }).length;
    bmd.roundsDone++;
    if (roundPnl >= 0) { bmd.consecutiveWinRounds++; bmd.consecutiveLossRounds = 0; }
    else               { bmd.consecutiveLossRounds++; bmd.consecutiveWinRounds = 0; }
    bmdAddRoundCard(bmd.roundsDone, roundResults, roundPnl);
    bmdLog('Round '+bmd.roundsDone+' done: '+roundWins+'/'+roundResults.length+' won  P&L '+(roundPnl>=0?'+':'')+roundPnl.toFixed(2), 'round');
    // Refresh balance and market data for next round
    fetchBalance();
    delete bmd.marketData[sym];
  }

  if (bmd.running) setTimeout(bmdMainLoop, 500);
}

// ── START / STOP ───────────────────────────────────────────
async function bmdStart() {
  if (!state.bearerToken || !state.accountId) { showToast('Please log in first'); return; }
  if (bmd.running) return;

  // Reset state
  bmd.running = true;
  bmd.pnl = 0; bmd.trades = 0; bmd.wins = 0; bmd.losses = 0;
  bmd.roundsDone = 0; bmd.consecutiveLossRounds = 0; bmd.consecutiveWinRounds = 0;
  bmd.digitWins = Array(10).fill(0); bmd.digitLosses = Array(10).fill(0);
  bmd.digitSkip = Array(10).fill(0);
  bmd.chartData = []; bmd.marketData = {};

  // Reset digit cards
  for (var d = 0; d <= 9; d++) { bmdUpdateDigitCard(d); }
  document.getElementById('bmd_rounds_log').innerHTML = '';
  document.getElementById('bmd-log').innerHTML = '';

  var balEl = document.getElementById('heroBalance');
  bmd.startBalance = balEl ? parseFloat(balEl.textContent) : 0;

  document.getElementById('bmdStartBtn').style.display = 'none';
  document.getElementById('bmdStopBtn').style.display = '';
  bmdSetStatus('scanning', 'Starting...');

  bmd.startTime = Date.now();
  bmd.timerInterval = setInterval(function() {
    var el = document.getElementById('bmd_timer');
    if (!el) return;
    var s = Math.floor((Date.now() - bmd.startTime) / 1000);
    el.textContent = Math.floor(s/60) + 'm ' + (s%60) + 's';
  }, 1000);

  bmdLog('Session started', 'round');
  bmdMainLoop();
}

function bmdStop() {
  bmd.running = false;
  if (bmd.timerInterval) { clearInterval(bmd.timerInterval); bmd.timerInterval = null; }
  document.getElementById('bmdStartBtn').style.display = '';
  document.getElementById('bmdStopBtn').style.display = 'none';
  bmdSetStatus('idle', 'Stopped — P&L: ' + (bmd.pnl >= 0 ? '+' : '') + bmd.pnl.toFixed(2));
  bmdLog('Session stopped. Total P&L: ' + (bmd.pnl >= 0 ? '+' : '') + bmd.pnl.toFixed(2), 'round');
}
// deploy trigger Wed Jun 10 21:37:59 EAST 2026
