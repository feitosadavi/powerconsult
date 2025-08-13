// login-oidc.mjs
const crypto = require("crypto");
const { setTimeout } = require("timers/promises");
(async () => {
  const APP_ORIGIN = "https://www.credlineitau.com.br"; // app frontend
  const KEYCLOAK_ORIGIN = "https://accounts-vehicle.itau.com.br";
  const REALM = "zflow";
  const CLIENT_ID = "credlineitau";

  // >>> SUBSTITUA pelo redirect_uri que aparece no DevTools do seu login <<<
  const REDIRECT_URI = "https://www.credlineitau.com.br/assets/callback.html";

  const USERNAME = "email@mail.com";
  const PASSWORD = "senha";
  const CREDENTIAL_ID = ""; // normalmente vazio, a menos que haja seleção de fator

  // ---------- utils ----------
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
  function pkceFromVerifier(verifier) {
    const hash = crypto.createHash("sha256").update(verifier).digest();
    return b64url(hash);
  }
  function parseSetCookie(setCookieHeader) {
    return setCookieHeader.split(";")[0];
  }
  function updateCookieJar(jar, res) {
    const set = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : res.headers.raw?.()["set-cookie"];
    if (!set) return;
    for (const sc of set) {
      const pair = parseSetCookie(sc);
      const [k, v] = pair.split("=");
      jar[k] = v;
    }
  }
  function cookieHeader(jar) {
    return Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  async function fetchManual(url, opts = {}, jar = {}) {
    const headers = { ...(opts.headers || {}) };
    if (Object.keys(jar).length) headers["Cookie"] = cookieHeader(jar);
    const res = await fetch(url, { redirect: "manual", ...opts, headers });
    updateCookieJar(jar, res);
    return res;
  }
  function absoluteUrl(base, maybeRelative) {
    try {
      return new URL(maybeRelative, base).toString();
    } catch {
      return maybeRelative;
    }
  }
  function extractFormAction(html) {
    const byId = html.match(
      /<form[^>]*id=["']kc-form-login["'][^>]*action=["']([^"']+)["']/i
    );
    if (byId) return byId[1];
    const anyForm = html.match(/<form[^>]*action=["']([^"']+)["']/i);
    return anyForm ? anyForm[1] : null;
  }

  // ---------- fluxo ----------
  const cookieJar = {};
  const codeVerifier = randomString(64);
  const codeChallenge = pkceFromVerifier(codeVerifier);
  const state = randomString(24);
  const nonce = randomString(24);

  // 1) Inicia sessão no Keycloak (Authorization Endpoint)
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
  const authUrl = `${KEYCLOAK_ORIGIN}/auth/realms/${REALM}/protocol/openid-connect/auth?${authParams.toString()}`;

  let res = await fetchManual(
    authUrl,
    {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml",
        // Referer/Origin coerentes com o fluxo real
        Referer: APP_ORIGIN + "/",
        "User-Agent": "Mozilla/5.0",
      },
    },
    cookieJar
  );

  // Segue redirects até cair no HTML de login (subdocument)
  let location = res.headers.get("location");
  while (location) {
    const next = absoluteUrl(authUrl, location);
    res = await fetchManual(
      next,
      {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml",
          Referer: authUrl,
          "User-Agent": "Mozilla/5.0",
        },
      },
      cookieJar
    );
    location = res.headers.get("location");
  }

  const loginHtml = await res.text();
  const formActionRel = extractFormAction(loginHtml);
  if (!formActionRel) {
    console.error(
      "Não foi possível localizar a action do formulário de login (kc-form-login)."
    );
    process.exit(1);
  }
  const formAction = absoluteUrl(authUrl, formActionRel);

  // 2) Envia credenciais (POST form-urlencoded) mantendo os MESMOS cookies
  const loginBody = new URLSearchParams({
    username: USERNAME,
    password: PASSWORD,
    credentialId: CREDENTIAL_ID,
  });

  res = await fetchManual(
    formAction,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html,application/xhtml+xml,application/xml",
        Origin: KEYCLOAK_ORIGIN, // origem do IdP
        Referer: formAction, // subdocumento/iframe de login
        "User-Agent": "Mozilla/5.0",
      },
      body: loginBody.toString(),
    },
    cookieJar
  );
  console.log(res);

  // 3) Segue redirects até retornar no redirect_uri com ?code=…
  let finalCode = null;
  for (let i = 0; i < 10; i++) {
    const loc = res.headers.get("location");
    if (!loc) break;
    const nextUrl = absoluteUrl(formAction, loc);
    if (nextUrl.startsWith(REDIRECT_URI)) {
      const u = new URL(nextUrl);
      finalCode = u.searchParams.get("code");
      const returnedState = u.searchParams.get("state");
      if (state && returnedState && returnedState !== state) {
        console.error("STATE mismatch.");
        process.exit(1);
      }
      break;
    }
    res = await fetchManual(
      nextUrl,
      { method: "GET", headers: { "User-Agent": "Mozilla/5.0" } },
      cookieJar
    );
    console.log(res);

    await sleep(50);
  }

  if (!finalCode) {
    console.error(
      "Não recebi o authorization_code no redirect_uri (verifique redirect_uri e client_id)."
    );
    process.exit(1);
  }

  // 4) Troca code por tokens (PKCE)
  const tokenUrl = `${KEYCLOAK_ORIGIN}/auth/realms/${REALM}/protocol/openid-connect/token`;
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code: finalCode,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString(),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok) {
    console.error("Falha na troca do código:", tokenJson);
    process.exit(1);
  }

  console.log(
    "access_token (prefixo):",
    tokenJson.access_token?.slice(0, 30) + "…"
  );
  console.log("id_token:", tokenJson.id_token ? "[recebido]" : "—");
  console.log("expires_in:", tokenJson.expires_in);
})();
