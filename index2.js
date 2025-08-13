// login-flow.js
const crypto = require("crypto");
const { setTimeout: sleep } = require("timers/promises");
const { CookieJar } = require("tough-cookie");
const fetch = require("node-fetch");

// ---------- CONFIGURAÇÕES ----------
const BASE_URL = "https://accounts-vehicle.itau.com.br";
const REALM = "zflow";
const CLIENT_ID = "credlineitau";

// Pegue este valor do primeiro request da aplicação frontend (no DevTools)
const REDIRECT_URI = "https://www.credlineitau.com.br/oidc/callback";

// Suas credenciais de teste
const USERNAME = "powerfulveiculosdf@gmail.com";
const PASSWORD = "Mario2025#";

// ---------- HELPERS ----------
function b64url(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
function randomString(n = 64) {
  return b64url(crypto.randomBytes(n));
}
function pkce(verifier) {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return b64url(hash);
}
function extractFormAction(html) {
  const match = html.match(
    /<form[^>]*id=["']kc-form-login["'][^>]*action=["']([^"']+)["']/i
  );
  if (match) return match[1];
  const fallback = html.match(/<form[^>]*action=["']([^"']+)["']/i);
  return fallback ? fallback[1] : null;
}
async function fetchWithCookies(url, options, jar) {
  const headers = { ...options.headers };
  const cookieStr = await jar.getCookieString(url);
  if (cookieStr) headers["cookie"] = cookieStr;

  const res = await fetch(url, { ...options, headers, redirect: "manual" });
  const setCookieHeaders = res.headers.raw()["set-cookie"] || [];
  for (const cookie of setCookieHeaders) {
    await jar.setCookie(cookie, url);
  }
  return res;
}
function abs(base, rel) {
  return new URL(rel, base).toString();
}

// ---------- FLUXO ----------
async function getAccessToken() {
  const jar = new CookieJar();
  const state = randomString(24);
  const nonce = randomString(24);
  const codeVerifier = randomString(64);
  const codeChallenge = pkce(codeVerifier);

  const authParams = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  const authUrl = `${BASE_URL}/auth/realms/${REALM}/protocol/openid-connect/auth?${authParams}`;

  // 1. Inicia fluxo
  let res = await fetchWithCookies(authUrl, { method: "GET" }, jar);
  while (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc) break;
    res = await fetchWithCookies(abs(authUrl, loc), { method: "GET" }, jar);
  }

  const html = await res.text();
  console.log({ html });
  const formAction = extractFormAction(html);
  if (!formAction)
    throw new Error("Não foi possível extrair a action do formulário.");

  const loginAction = abs(authUrl, formAction);
  console.log({ loginAction });

  const form = new URLSearchParams({
    username: USERNAME,
    password: PASSWORD,
    credentialId: "",
  });

  // 2. POST login
  res = await fetchWithCookies(
    loginAction,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: BASE_URL,
        Referer: loginAction,
        "User-Agent": "Mozilla/5.0",
      },
      body: form.toString(),
    },
    jar
  );

  // 3. Segue os redirects até pegar o código de autorização
  let finalCode = null;
  for (let i = 0; i < 10; i++) {
    const loc = res.headers.get("location");
    if (!loc) break;

    const next = abs(loginAction, loc);
    const parsed = new URL(next);
    if (parsed.searchParams.has("code")) {
      finalCode = parsed.searchParams.get("code");
      break;
    }

    res = await fetchWithCookies(next, { method: "GET" }, jar);
    await sleep(50);
  }

  if (!finalCode) {
    console.error("❌ Falha no login ou código de autorização não retornado.");
    process.exit(1);
  }

  // 4. Troca code por token
  const tokenRes = await fetch(
    `${BASE_URL}/auth/realms/${REALM}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: finalCode,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    }
  );

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error("❌ Erro na troca por token:", tokenJson);
    process.exit(1);
  }

  console.log("✅ Login bem-sucedido!");
  console.log(
    "Access Token (início):",
    tokenJson.access_token?.slice(0, 30) + "…"
  );
  // console.log("Expires in:", tokenJson.expires_in, "segundos");
  // console.log("ID Token presente:", !!tokenJson.id_token);
  return tokenJson.access_token;
}

getAccessToken()
  .then(async (accessToken) => {
    const apiUrl =
      "https://apicd.cloud.itau.com.br/charon/brr13ot8/9fecca81a835b498";

    const payload = {
      sellerDocument: "45494125000153",
      statusAnalysis: "RED",
      segment: null,
      dismissalCnhEnable: true,
      clientDocument: "72048255191",
      customer: false,
    };

    const apiHeaders = {
      Host: "apicd.cloud.itau.com.br",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      Authorization: `Bearer ${accessToken}`,
      "x-charon-session": "b80e3aa8-b175-4f16-a734-d4c97b6fef4f",
      "x-itau-correlationID": "50445c95-cecc-44ba-99db-5ebefde6b12d",
      "x-itau-flowID": "d1b3db54-2c1b-4d1d-a7ef-21964594a84b",
      "Content-Type": "application/json",
      // "x-itau-apikey":
      // "bd0fb09f0179b8d899bd7be7404158bd0713462fc9bc1a88723de71e896de0e0501528201882cd5e7dc1fd9115725833",
      // "x-apigw-api-id": "v0vb31ek5l",
      Origin: "https://www.credlineitau.com.br",
      Referer: "https://www.credlineitau.com.br/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "cross-site",
      Priority: "u=0",
      TE: "trailers",
    };

    const apiRes = await fetch(apiUrl, {
      method: "POST",
      headers: apiHeaders,
      body: JSON.stringify(payload),
    });

    const apiResult = await apiRes.json().catch(() => ({}));

    console.log("\n✅ Resposta da API:");
    console.log("Status:", apiRes.status);
    console.log("Body:", apiResult);
  })
  .catch((err) => {
    console.error("Erro:", err);
    process.exit(1);
  });
