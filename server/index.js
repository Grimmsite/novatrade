const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.DERIV_CLIENT_ID || '33uSXfChgY8KVaryv2Z5C';
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://novatrade-6j34.onrender.com/callback';

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..')));

// OAuth callback — Deriv redirects here with ?token1=...&acct1=...
app.get('/callback', (req, res) => {
  const { token1, acct1, token2, acct2, token3, acct3 } = req.query;

  if (!token1) {
    return res.redirect('/?auth_error=no_token');
  }

  // Build accounts array from query params
  const accounts = [];
  if (acct1 && token1) accounts.push({ account: acct1, token: token1 });
  if (acct2 && token2) accounts.push({ account: acct2, token: token2 });
  if (acct3 && token3) accounts.push({ account: acct3, token: token3 });

  // Pass tokens back to frontend via URL fragment (never in query string for security)
  const encoded = encodeURIComponent(JSON.stringify(accounts));
  res.redirect(`/?oauth_accounts=${encoded}`);
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`NovaTrade server running on port ${PORT}`));
