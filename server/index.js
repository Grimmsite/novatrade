const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.DERIV_CLIENT_ID || '33uSXfChgY8KVaryv2Z5C';
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://novatrade-6j34.onrender.com/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://novatrade-6j34.onrender.com';

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// OAuth callback — Deriv posts back code + state here
app.get('/callback', async (req, res) => {
  var code = req.query.code;
  // state parsed below with codeVerifier
  var error = req.query.error;
  var rawState = req.query.state || '';
  var firstDot = rawState.indexOf('.');
  var lastDot = rawState.lastIndexOf('.');
  var cvMatch = (rawState.startsWith('CV.') && firstDot !== lastDot) ? [null, rawState.slice(3, lastDot), rawState.slice(lastDot + 1)] : null;
  var codeVerifier = cvMatch ? cvMatch[1] : null;
  var realState = cvMatch ? cvMatch[2] : rawState; // frontend appends this to redirect_uri as ?cv=...

  if (error) {
    return res.redirect(FRONTEND_URL + '/?auth_error=' + encodeURIComponent(error));
  }
  if (!code || !codeVerifier) {
    return res.redirect(FRONTEND_URL + '/?auth_error=missing_cv');
  }

  try {
    var params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', CLIENT_ID);
    params.append('code', code);
    params.append('code_verifier', codeVerifier);
    params.append('redirect_uri', REDIRECT_URI);

    var tokenRes = await fetch('https://auth.deriv.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    var tokenData = await tokenRes.json();
    console.log('TOKEN RESPONSE STATUS:', tokenRes.status);
    console.log('TOKEN RESPONSE DATA:', JSON.stringify(tokenData));

    if (!tokenRes.ok || !tokenData.access_token) {
      var err = encodeURIComponent(JSON.stringify(tokenData));
      return res.redirect(FRONTEND_URL + '/?auth_error=' + err);
    }

    var token = encodeURIComponent(tokenData.access_token);
    res.redirect(FRONTEND_URL + '/?oauth_token=' + token + '&state=' + encodeURIComponent(realState || ''));
  } catch (e) {
    res.redirect(FRONTEND_URL + '/?auth_error=' + encodeURIComponent(e.message));
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(PORT, () => console.log('NovaTrade server on port ' + PORT));
