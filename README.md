# NovaTrade 🌟
**Your Ultimate Companion in Deriv Automations**

A feature-complete Deriv trading automation platform with real-time analysis, bot builder, free bots, and auto trader. Black & Gold premium theme.

---

## 🚀 Features
- **Dashboard** — Quick access to all tools
- **Bot Builder** — Full DBot integration via iframe (load/save/export XML)
- **Analysis Tool** — DCIRCLE + Digit Scanner with live Deriv WebSocket data
- **Free Bots** — 12 ready-made strategies (free & premium)
- **Auto Trader** — Automated trading with martingale, take profit & stop loss
- **API Token Login** — Secure Deriv account connection
- **Virtual Hook** — Simulate trades without real money

---

## 📁 Project Structure

```
novatrade/
├── index.html          # Main app (single page application)
├── css/
│   └── style.css       # Black & Gold premium theme
├── js/
│   └── app.js          # All logic + Deriv WebSocket API
└── README.md
```

---

## 🛠 Local Setup (Git Bash)

```bash
# 1. Clone your repo (after pushing)
git clone https://github.com/YOUR_USERNAME/novatrade.git
cd novatrade

# 2. Open locally
start index.html       # Windows
open index.html        # Mac
```

No build step needed — pure HTML/CSS/JS.

---

## 📤 Deploy to GitHub

```bash
# Inside the novatrade folder:

git init
git add .
git commit -m "Initial NovaTrade release"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/novatrade.git
git push -u origin main
```

---

## ☁️ Deploy to Render (Free Static Site)

1. Go to [render.com](https://render.com) → **New** → **Static Site**
2. Connect your GitHub account
3. Select the `novatrade` repository
4. Set these options:
   - **Name:** `novatrade`
   - **Branch:** `main`
   - **Root Directory:** *(leave blank)*
   - **Build Command:** *(leave blank)*
   - **Publish Directory:** `.`
5. Click **Create Static Site**
6. Your site will be live at `https://novatrade.onrender.com`

---

## 🔑 Connecting Deriv API

1. Go to [app.deriv.com/account/api-token](https://app.deriv.com/account/api-token)
2. Create a token with **Read** + **Trade** scopes
3. In NovaTrade click **API Token** → paste token → **Connect**

---

## 📡 Deriv WebSocket Endpoints Used

| Feature | API Call |
|---|---|
| Price feed | `ticks` + `ticks_history` |
| Authorization | `authorize` |
| Buy contract | `proposal` → `buy` |
| Monitor contract | `proposal_open_contract` |
| Account balance | `balance` |

WebSocket URL: `wss://ws.binaryws.com/websockets/v3?app_id=1089`

> **Note:** Replace `app_id=1089` with your own Deriv App ID from [api.deriv.com](https://api.deriv.com) for production use.

---

## ⚠️ Risk Warning
Trading involves substantial risk of loss. Never trade with money you cannot afford to lose. Always test with a demo account first.
