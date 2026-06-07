/* ═══════════════════════════════════════════
   NOVATRADE — Main Application JavaScript
   Deriv WebSocket API Integration
   ═══════════════════════════════════════════ */

'use strict';

// ─── GLOBALS ───
const DERIV_WS_URL = 'wss://ws.binaryws.com/websockets/v3?app_id=1089';
const MARKETS = {
  'R_10':     { name: 'Volatility 10 (1s) Index',  decimals: 2 },
  'R_25':     { name: 'Volatility 25 (1s) Index',  decimals: 2 },
  'R_50':     { name: 'Volatility 50 (1s) Index',  decimals: 2 },
  'R_75':     { name: 'Volatility 75 (1s) Index',  decimals: 2 },
  'R_100':    { name: 'Volatility 100 (1s) Index', decimals: 2 },
  '1HZ10V':   { name: 'Volatility 10 Index',       decimals: 3 },
  '1HZ25V':   { name: 'Volatility 25 Index',       decimals: 3 },
  '1HZ50V':   { name: 'Volatility 50 Index',       decimals: 3 },
  '1HZ75V':   { name: 'Volatility 75 Index',       decimals: 3 },
  '1HZ100V':  { name: 'Volatility 100 Index',      decimals: 3 },
  'JD10':     { name: 'Jump 10 Index',             decimals: 2 },
  'JD25':     { name: 'Jump 25 Index',             decimals: 2 },
  'JD50':     { name: 'Jump 50 Index',             decimals: 2 },
  'JD75':     { name: 'Jump 75 Index',             decimals: 2 },
  'JD100':    { name: 'Jump 100 Index',            decimals: 2 },
};

const ANALYSIS_MARKETS = ['R_100', 'R_75', 'R_50', 'R_25', 'R_10', '1HZ100V', '1HZ50V'];

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
  // Risk banner from localStorage
  if (localStorage.getItem('nt_risk_dismissed')) {
    document.getElementById('riskBanner').style.display = 'none';
  }
});

function handleHashNav() {
  const hash = window.location.hash.replace('#', '');
  const pages = ['dashboard', 'bot-builder', 'analysis', 'free-bots', 'auto-trader'];
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
  window.location.hash = page;

  // Close mobile nav
  document.getElementById('navTabs').classList.remove('open');

  // Page-specific init
  if (page === 'analysis') initAnalysisPage();
  if (page === 'auto-trader' && state.apiToken) fetchBalance();
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

function createWS(onOpen, onMessage, onClose, onError) {
  const ws = new WebSocket(DERIV_WS_URL);
  ws.onopen = onOpen || (() => {});
  ws.onmessage = e => { try { onMessage(JSON.parse(e.data)); } catch(err) {} };
  ws.onclose = onClose || (() => {});
  ws.onerror = onError || (() => {});
  return ws;
}

function wsSend(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ─── TOKEN ───
function checkSavedToken() {
  if (state.apiToken) {
    authorizeToken(state.apiToken);
  }
}

function authorizeToken(token) {
  const ws = createWS(
    () => wsSend(ws, { authorize: token }),
    (msg) => {
      if (msg.authorize) {
        state.userInfo = msg.authorize;
        state.currency = msg.authorize.currency || 'AUD';
        updateUserBadge(msg.authorize);
        document.getElementById('currencyLabel').textContent = state.currency;
        ws.close();
      } else if (msg.error) {
        showToast('⚠️ Invalid token: ' + msg.error.message);
        localStorage.removeItem('nt_token');
        state.apiToken = null;
        ws.close();
      }
    }
  );
}

function updateUserBadge(user) {
  const badge = document.getElementById('userBadge');
  const initials = document.getElementById('userInitials');
  const name = user.fullname || user.loginid || 'NT';
  initials.textContent = name.slice(0, 2).toUpperCase();
  badge.classList.remove('hidden');
  document.getElementById('navTabs').querySelector('[data-page]');
  showToast('✅ Connected as ' + (user.fullname || user.loginid));
}

function fetchBalance() {
  if (!state.apiToken) return;
  const ws = createWS(
    () => wsSend(ws, { authorize: state.apiToken }),
    (msg) => {
      if (msg.authorize) {
        wsSend(ws, { balance: 1 });
      } else if (msg.balance) {
        const bal = msg.balance.balance.toFixed(2) + ' ' + msg.balance.currency;
        document.getElementById('autoBalance').textContent = bal;
        ws.close();
      }
    }
  );
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
  if (tab === 'tool') { initMarketCards(); startAtool(); }
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
      <button class="auto-trade-btn" onclick="showAutoTradeSettings('${symbol}')">Auto ⚙</button>
    </div>
    <div class="eo-trade-row" id="eotrade-${symbol}">
      <button class="eo-trade-btn even-btn" onclick="placeTrade('${symbol}','DIGITEVEN')">
        <span class="eo-trade-label">Even</span>
        <span class="eo-trade-pct" id="even-pct-${symbol}">—%</span>
        <span class="eo-trade-payout" id="even-pay-${symbol}">Payout AUD —</span>
      </button>
      <button class="eo-trade-btn odd-btn" onclick="placeTrade('${symbol}','DIGITODD')">
        <span class="eo-trade-label">Odd</span>
        <span class="eo-trade-pct" id="odd-pct-${symbol}">—%</span>
        <span class="eo-trade-payout" id="odd-pay-${symbol}">Payout AUD —</span>
      </button>
    </div>
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

  // Even/Odd trade buttons
  const evenCount = digits.filter(d => d % 2 === 0).length;
  const oddCount = total - evenCount;
  const evenPct = ((evenCount / total) * 100).toFixed(1);
  const oddPct = ((oddCount / total) * 100).toFixed(1);

  const evenPctEl = document.getElementById('even-pct-' + symbol);
  const oddPctEl = document.getElementById('odd-pct-' + symbol);
  if (evenPctEl) evenPctEl.textContent = evenPct + '%';
  if (oddPctEl) oddPctEl.textContent = oddPct + '%';

  // Fetch payout via proposal
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
function placeTrade(symbol, contractType) {
  if (!state.apiToken) {
    showToast('⚠️ Please connect your API token first');
    showApiModal();
    return;
  }
  const stakeEl = document.getElementById('stake-' + symbol);
  const durEl = document.getElementById('tdur-' + symbol);
  const stake = parseFloat(stakeEl?.value || 0.5);
  const dur = parseInt(durEl?.value || 1);

  const ws = createWS(
    () => wsSend(ws, { authorize: state.apiToken }),
    (msg) => {
      if (msg.authorize) {
        wsSend(ws, {
          proposal: 1,
          amount: stake,
          basis: 'stake',
          contract_type: contractType,
          currency: state.currency,
          duration: dur,
          duration_unit: 't',
          symbol: symbol,
        });
      } else if (msg.proposal) {
        wsSend(ws, { buy: msg.proposal.id, price: msg.proposal.ask_price });
      } else if (msg.buy) {
        showToast('✅ Trade placed! Contract: ' + msg.buy.contract_id);
        ws.close();
      } else if (msg.error) {
        showToast('❌ ' + msg.error.message);
        ws.close();
      }
    }
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
const APP_ID = '1089';
const OAUTH_URL = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=en&brand=deriv`;
const REDIRECT_URI = window.location.origin + window.location.pathname;

function loginWithOAuth() {
  closeModal('loginModal');
  closeModal('signupModal');
  document.getElementById('oauthLoading').classList.remove('hidden');
  // Redirect to Deriv OAuth
  window.location.href = OAUTH_URL + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
}

// Handle OAuth callback — Deriv returns token1, acct1 etc in URL params
function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const token1 = params.get('token1');
  const acct1 = params.get('acct1');
  const cur1 = params.get('cur1');

  if (token1) {
    // Clean URL without reloading
    window.history.replaceState({}, document.title, window.location.pathname + '#dashboard');

    // Save token
    state.apiToken = token1;
    localStorage.setItem('nt_token', token1);
    if (acct1) localStorage.setItem('nt_acct', acct1);
    if (cur1) {
      state.currency = cur1;
      localStorage.setItem('nt_currency', cur1);
    }

    // Authorize with Deriv
    authorizeToken(token1);
    showToast('✅ Logged in via Deriv!');
    navigate('dashboard');
  }
}

// Run OAuth check on page load
handleOAuthCallback();

/* ═══════════════════════════════════════════
   ACCOUNT MENU
   ═══════════════════════════════════════════ */

function showAccountMenu() {
  if (!state.userInfo) return;
  const user = state.userInfo;
  document.getElementById('accountAvatar').textContent = (user.fullname || user.loginid || 'NT').slice(0, 2).toUpperCase();
  document.getElementById('accountName').textContent = user.fullname || 'Trader';
  document.getElementById('accountId').textContent = user.loginid || '—';
  fetchAndShowBalance();
  openModal('accountModal');
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

function logout() {
  state.apiToken = null;
  state.userInfo = null;
  localStorage.removeItem('nt_token');
  localStorage.removeItem('nt_acct');
  localStorage.removeItem('nt_currency');
  document.getElementById('userBadge').classList.add('hidden');
  closeModal('accountModal');
  showToast('👋 Logged out successfully');
  navigate('dashboard');
}

function dismissRisk() {
  document.getElementById('riskBanner').style.display = 'none';
  localStorage.setItem('nt_risk_dismissed', '1');
}



// ═══════════════════════════════════════════
// ANALYSIS TOOL - LIVE DATA
// ═══════════════════════════════════════════
function atoolMarketChange() {
  startAtool();
}
function atoolUpdate() { startAtool(); }
function startAtool() {
  if (state.atoolWs) {
    try { state.atoolWs.close(); } catch(e) {}
  }
  state.atoolTicks = [];
  const symbol = document.getElementById('atoolMarket').value;
  const ticksNeeded = parseInt(document.getElementById('atoolTicks').value) || 120;
  state.atoolWs = createWS(
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
  const dec = MARKETS[symbol]?.decimals || 2;
  const digits = state.atoolTicks.map(p => Math.floor(p * Math.pow(10, dec)) % 10);
  const lastPrice = state.atoolTicks[state.atoolTicks.length - 1];
  const priceEl = document.getElementById('atoolPrice');
  if (priceEl) priceEl.textContent = lastPrice.toFixed(dec);
  const evenCount = digits.filter(d => d % 2 === 0).length;
  const oddCount = digits.length - evenCount;
  const evenCountEl = document.getElementById('atoolEvenCount');
  const oddCountEl = document.getElementById('atoolOddCount');
  if (evenCountEl) evenCountEl.textContent = evenCount;
  if (oddCountEl) oddCountEl.textContent = oddCount;
  const last20 = digits.slice(-20);
  const patternEl = document.getElementById('atoolPattern');
  if (patternEl) {
    patternEl.innerHTML = last20.map(d =>
      '<div class="atool-pattern-dot ' + (d % 2 === 0 ? 'even' : 'odd') + '">' + (d % 2 === 0 ? 'E' : 'O') + '</div>'
    ).join('');
  }
  const evenPct = ((evenCount / digits.length) * 100).toFixed(1);
  const oddPct = ((oddCount / digits.length) * 100).toFixed(1);
  const evenBar = document.getElementById('atoolEvenBar');
  const oddBar = document.getElementById('atoolOddBar');
  if (evenBar) { evenBar.style.width = evenPct + '%'; evenBar.textContent = evenPct + '%'; }
  if (oddBar) { oddBar.style.width = oddPct + '%'; oddBar.textContent = oddPct + '%'; }
}
