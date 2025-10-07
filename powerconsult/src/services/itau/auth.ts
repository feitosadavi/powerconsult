import crypto from "crypto";
import { setTimeout as sleep } from "timers/promises";
import { CookieJar } from "tough-cookie";
import fetch, { RequestInit, Response } from "node-fetch";
import { BankCreds, BANKS } from "../../banks";
import { logger } from "../../lib";
import { redis } from "../../config/redis";
import { ITAU_TOKEN } from "../../constants";

// ---------- CONFIGURAÇÕES ----------
const BASE_URL = "https://accounts-vehicle.itau.com.br";
const REALM = "zflow";
const CLIENT_ID = "credlineitau";
const REDIRECT_URI = "https://www.credlineitau.com.br/oidc/callback";

// ---------- TIPOS ----------
type HeadersInit = Record<string, string>;

// ---------- HELPERS ----------
function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomString(n = 64): string {
  return b64url(crypto.randomBytes(n));
}

function pkce(verifier: string): string {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return b64url(hash);
}

function extractFormAction(html: string): string | null {
  const match = html.match(
    /<form[^>]*id=["']kc-form-login["'][^>]*action=["']([^"']+)["']/i
  );
  if (match) return match[1];
  const fallback = html.match(/<form[^>]*action=["']([^"']+)["']/i);
  return fallback ? fallback[1] : null;
}

async function fetchWithCookies(
  url: string,
  options: RequestInit,
  jar: CookieJar
): Promise<Response> {
  const headers: HeadersInit = { ...(options.headers as HeadersInit) };
  const cookieStr = await jar.getCookieString(url);
  if (cookieStr) headers["cookie"] = cookieStr;

  const res = await fetch(url, { ...options, headers, redirect: "manual" });
  const setCookieHeaders = (res.headers.raw()["set-cookie"] || []) as string[];
  for (const cookie of setCookieHeaders) {
    await jar.setCookie(cookie, url);
  }
  return res;
}

function abs(base: string, rel: string): string {
  return new URL(rel, base).toString();
}

// Variável para armazenar o token temporariamente
let accessTokenGlobal: string | null = null;

export type GetAccessTokenOutput = {
  clientId: string;
  token: {
    accessToken: string;
    refreshToken: string;
    refreshValidUntil: number;
    validUntil: number;
  };
};

// ---------- FLUXO ----------
export async function getAccessToken(
  bankCreds: BankCreds
): Promise<GetAccessTokenOutput> {
  logger("-> Getting itau accessToken");

  // 0) Cache first
  const cached = await redis.get(ITAU_TOKEN);
  if (cached) {
    logger("-> itau has cache token");
    return JSON.parse(cached) as GetAccessTokenOutput;
  }
  logger("-> itau dont have cache token");

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
  const formAction = extractFormAction(html);
  if (!formAction)
    throw new Error("Não foi possível extrair a action do formulário.");

  const loginAction = abs(authUrl, formAction);

  const { username, password } = bankCreds;

  const form = new URLSearchParams({
    username,
    password,
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
  let finalCode: string | null = null;
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
    throw new Error("Falha no login ou código de autorização não retornado.");
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

  if (!tokenRes.ok) {
    throw new Error(`Erro na troca por token: ${JSON.stringify({})}`);
  }
  const {
    access_token: accessToken,
    refresh_token: refreshToken,
    refresh_expires_in: refreshExpiresIn,
    expires_in: expiresIn,
  } = await tokenRes.json();

  const now = Date.now();
  const refreshValidUntil = now + refreshExpiresIn * 1000;
  const validUntil = now + expiresIn * 1000;

  const output: GetAccessTokenOutput = {
    clientId: CLIENT_ID,
    token: { accessToken, refreshToken, refreshValidUntil, validUntil },
  };

  // 5) Cache with TTL
  const ttlSeconds = Math.max(30, Math.floor(expiresIn * 0.9)); // 90% slack
  await redis.set(ITAU_TOKEN, JSON.stringify(output), "EX", ttlSeconds);

  

  return output;
}
