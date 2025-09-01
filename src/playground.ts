// src/server.ts
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { WebSocketServer, WebSocket, RawData } from "ws";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import Redis from "ioredis";

// -----------------------------
// Configs
// -----------------------------
const PORT = parseInt(process.env.PORT || "8080", 10);
const MAX_CLIENTS = parseInt(process.env.MAX_CLIENTS || "200", 10);
const HEADLESS = false;
const CLIENT_IDLE_MS = parseInt(
  process.env.CLIENT_IDLE_MS || `${5 * 60_000}`,
  10
);
const PING_INTERVAL_MS = parseInt(process.env.PING_INTERVAL_MS || "20000", 10);
const NAV_TIMEOUT_MS = parseInt(process.env.NAV_TIMEOUT_MS || "45000", 10);
const CHROME_ARGS: string[] = []; // ex.: ['--no-sandbox','--disable-dev-shm-usage']
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-please-change";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// -----------------------------
// Redis
// -----------------------------
const redis = new Redis(REDIS_URL);

// -----------------------------
// Mock DB de credenciais por loja
// Estrutura persistida no Redis: key = bankCreds:<storeId>, value = JSON.stringify({ banco: {username,password}, ... })
// -----------------------------
export type BankCreds = { username: string; password: string };
export type StoreBankCreds = { [bankName: string]: BankCreds };

const MOCK_CREDENTIALS_DB: Array<{ storeId: string; banks: StoreBankCreds }> = [
  {
    storeId: "store-001",
    banks: {
      itau: {
        username: "powerfulveiculosdf@gmail.com",
        password: "Mario2025#",
      },
      bradesco: {
        username: "user_bradesco_store001",
        password: "pass#Bradesco001",
      },
      bancopan: { username: "user_pan_store001", password: "pass#Pan001" },
    },
  },
  {
    storeId: "store-002",
    banks: {
      itau: { username: "user_itau_store002", password: "pass#Itau002" },
      bradesco: {
        username: "user_bradesco_store002",
        password: "pass#Bradesco002",
      },
    },
  },
];

// Bootstrap: carregar mock DB e gravar em Redis
async function bootstrapBankCredsToRedis() {
  for (const row of MOCK_CREDENTIALS_DB) {
    const key = `bankCreds:${row.storeId}`;
    await redis.set(key, JSON.stringify(row.banks));
  }
  console.log(
    `[bootstrap] Bank creds loaded into Redis for ${MOCK_CREDENTIALS_DB.length} stores.`
  );
}

// Helper: obter credenciais de uma loja
export async function getBankCredsForStore(
  storeId: string
): Promise<StoreBankCreds | null> {
  logger(`-> getBankCredsForStore ${storeId}`);
  const key = `bankCreds:${storeId}`;
  const raw = await redis.get(key);
  return raw ? (JSON.parse(raw) as StoreBankCreds) : null;
}

export async function getCacheAuthToken(
  banco: AvailableBanks,
  storeId: string
): Promise<string> {
  logger(`-> getCacheAuthToken ${storeId}`);
  const key = `${banco}-token:${storeId}`;
  const raw = await redis.get(key);
  if (!raw) throw new Error(`Token ${key} not found!`);
  return raw;
}

// -----------------------------
// Tipos do protocolo / auth
// -----------------------------
type JwtPayload = {
  userId: string;
  storeId: string;
  iat?: number;
  exp?: number;
};

type OpName = "isAvailableForFinancing" | "close";

type ClientMsg = { op: OpName; reqId?: string; args?: Record<string, unknown> };

type ServerReply =
  | { event: "ready"; payload: { clientId: string } }
  | { event: "reply"; payload: { reqId?: string; ok: true; payload: unknown } }
  | { event: "reply"; payload: { reqId?: string; ok: false; payload: unknown } }
  | {
      event: "error";
      payload: { message: string; error?: string; load?: string };
    };

// -----------------------------
// Fila assíncrona por cliente
// -----------------------------
class AsyncQueue {
  private chain: Promise<void> = Promise.resolve();
  push<T>(task: () => Promise<T>): Promise<T> {
    const run: Promise<T> = this.chain.then(() => task());
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

// -----------------------------
// Controllers (placeholder)
// -----------------------------
import { getSimulationsController } from "./controllers"; // você já tem
import { AvailableBanks } from "./domain";
import { getAccessToken, GetAccessTokenOutput } from "./services/itau/auth";
import { ITAU_TOKEN } from "./constants";
import { logger } from "./lib";

// -----------------------------
// Sessão por cliente
// -----------------------------
export type UserSession = { userId: string; storeId: string };

class ClientSession {
  public readonly id: string;
  public readonly ws: WebSocket;
  private browser: Browser;
  public context!: BrowserContext;
  public page!: Page;

  private queue = new AsyncQueue();
  private lastSeen = Date.now();
  private idleTimer: NodeJS.Timeout | null = null;
  private closed = false;

  public user!: UserSession; // definido após autenticar

  constructor(id: string, ws: WebSocket, browser: Browser, user: UserSession) {
    this.id = id;
    this.ws = ws;
    this.browser = browser;
    this.user = user;
  }

  log(msg: string, extra?: unknown) {
    const base = `[${new Date().toISOString()}] [client:${this.id}] [user:${
      this.user?.userId
    }|store:${this.user?.storeId}] ${msg}`;
    if (extra !== undefined) console.log(base, extra);
    else console.log(base);
  }

  touch() {
    this.lastSeen = Date.now();
    this.armIdleTimer();
  }

  armIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (Date.now() - this.lastSeen >= CLIENT_IDLE_MS) {
        this.log(`idle timeout (${CLIENT_IDLE_MS}ms) → closing`);
        this.close().catch(() => {});
      } else {
        this.armIdleTimer();
      }
    }, CLIENT_IDLE_MS + 500);
  }

  async setupAuth() {
    const creds = await getBankCredsForStore(this.user.storeId);

    if (!creds) throw new Error("Creds not found");

    const itauAccessToken = await getAccessToken(creds.itau);
    await redis.set(
      `${ITAU_TOKEN}:${this.user.storeId}`,
      JSON.stringify(itauAccessToken)
    );
    return itauAccessToken;
  }

  async init() {
    this.context = await this.browser.newContext({
      viewport: { width: 1366, height: 768 },
    });
    const itauAccessToken = await this.setupAuth();

    await this.context.addInitScript(
      (kv: {
        key: string;
        value: GetAccessTokenOutput;
        origins?: string[];
      }) => {
        // optional origin guard (use if you open multiple sites in same context)
        if (kv.origins && !kv.origins.includes(location.origin)) return;
        window.sessionStorage.setItem(kv.key, JSON.stringify(kv.value));
      },
      {
        key: "token",
        value: itauAccessToken,
        origins: ["https://www.credline.com.br"],
      }
    );
    this.page = await this.context.newPage();
    this.page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    this.armIdleTimer();
    await this.setupAuth();
  }

  send(msg: ServerReply) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private replyOk(reqId: string | undefined, payload: unknown) {
    this.send({
      event: "reply",
      payload: { reqId, ok: true as const, payload },
    });
  }
  private replyErr(reqId: string | undefined, payload: unknown) {
    this.send({
      event: "reply",
      payload: { reqId, ok: false as const, payload },
    });
  }

  // --------------- comandos ---------------
  private async cmdIsAvailableForFinancing(args?: Record<string, unknown>) {
    logger(`-> cmdIsAvailableForFinancing`, this.user);
    const cpf = String(args?.cpf ?? "");
    const bancos: AvailableBanks[] = (args?.bancos as AvailableBanks[]) || [];

    return await getSimulationsController({
      user: this.user,
      bancos: bancos as AvailableBanks[],
      browserContext: this.context,
      service: {
        name: "isAvailableForFinancing",
        input: { cpf },
      },
    });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.context?.close();
    } catch {}
    try {
      this.ws?.close();
    } catch {}
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }

  // --------------- dispatcher ---------------
  handleMessage(raw: RawData) {
    this.touch();
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return this.send({
        event: "error",
        payload: { message: "invalid_json" },
      });
    }

    const { op, args, reqId } = msg;

    this.queue
      .push(async () => {
        try {
          switch (op) {
            case "isAvailableForFinancing":
              return this.replyOk(
                reqId,
                await this.cmdIsAvailableForFinancing(args)
              );
            case "close":
              await this.close();
              return this.replyOk(reqId, { closed: true });
            default:
              return this.replyErr(reqId, { error: "unknown_op", op });
          }
        } catch (e) {
          this.log(`op ${op} failed`, e);
          if (
            String(e).includes(
              "Target page, context or browser has been closed"
            )
          ) {
            await this.init();
            this.handleMessage(raw);
            return;
          }
          return this.replyErr(reqId, { error: String(e) });
        }
      })
      .catch(() => {});
  }
}

// -----------------------------
// Browser compartilhado
// -----------------------------
let sharedBrowser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;
  sharedBrowser = await chromium.launch({
    headless: HEADLESS,
    args: CHROME_ARGS,
  });
  sharedBrowser.on("disconnected", () => {
    console.warn("[browser] disconnected");
    sharedBrowser = null;
  });

  return sharedBrowser;
}

// -----------------------------
// Auth helpers (JWT)
// -----------------------------
function parseTokenFromRequest(req: any): string | null {
  // 1) Query string ?token=...
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const q = url.searchParams.get("token");
    if (q) return q;
  } catch {}

  // 2) Subprotocol: Sec-WebSocket-Protocol: bearer,<JWT>
  const proto = req.headers["sec-websocket-protocol"];
  if (typeof proto === "string") {
    const parts = proto.split(",").map((s) => s.trim());
    const bearerIdx = parts.findIndex((p) => p.toLowerCase() === "bearer");
    if (bearerIdx >= 0 && parts[bearerIdx + 1]) return parts[bearerIdx + 1];
  }

  // 3) Authorization header (não padrão no upgrade, mas deixamos)
  const auth = req.headers["authorization"] || req.headers["Authorization"];
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7);
  }

  return null;
}

function verifyJwt(token: string): UserSession {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (!payload.userId || !payload.storeId) throw new Error("invalid payload");
    return { userId: payload.userId, storeId: payload.storeId };
  } catch (e) {
    throw new Error("invalid_token");
  }
}

// -----------------------------
// Gerenciador global + WS ping
// -----------------------------
const clients = new Map<string, ClientSession>();
const wsMeta = new WeakMap<WebSocket, { isAlive: boolean; clientId: string }>();

function currentLoad() {
  return `${clients.size}/${MAX_CLIENTS}`;
}

// Iniciar servidor após bootstrap
(async function start() {
  await bootstrapBankCredsToRedis();

  const wss = new WebSocketServer({ port: PORT });
  console.log(`[server] listening on ws://0.0.0.0:${PORT}`);

  wss.on("connection", async (ws, req) => {
    // Autenticação obrigatória
    const token = parseTokenFromRequest(req);
    if (!token) {
      ws.send(
        JSON.stringify({
          event: "error",
          payload: { message: "missing_token" },
        } satisfies ServerReply)
      );
      ws.close();
      return;
    }

    let user: UserSession;
    try {
      user = verifyJwt(token);
    } catch {
      ws.send(
        JSON.stringify({
          event: "error",
          payload: { message: "invalid_token" },
        } satisfies ServerReply)
      );
      ws.close();
      return;
    }

    if (clients.size >= MAX_CLIENTS) {
      const msg: ServerReply = {
        event: "error",
        payload: { message: "server_busy", load: currentLoad() },
      };
      ws.send(JSON.stringify(msg));
      ws.close();
      return;
    }

    const clientId = randomUUID();
    wsMeta.set(ws, { isAlive: true, clientId });

    let session: ClientSession | null = null;

    try {
      const browser = await getBrowser();
      session = new ClientSession(clientId, ws, browser, user);
      clients.set(clientId, session);

      session.log(
        `connected from ${
          req.socket.remoteAddress ?? "unknown"
        } load=${currentLoad()}`
      );

      ws.on("pong", () => {
        const meta = wsMeta.get(ws);
        if (meta) meta.isAlive = true;
        session?.touch();
      });

      await session.init();
      session.send({ event: "ready", payload: { clientId } });

      ws.on("message", (raw) => session?.handleMessage(raw));

      ws.on("close", async () => {
        session?.log("ws closed → tearing down");
        await session?.close().catch(() => {});
        if (session) clients.delete(session.id);
      });

      ws.on("error", async (err) => {
        session?.log("ws error", err);
        await session?.close().catch(() => {});
        if (session) clients.delete(session.id);
      });
    } catch (err) {
      console.error("[server] failed to create session", err);
      const msg: ServerReply = {
        event: "error",
        payload: { message: "init_failed", error: String(err) },
      };
      try {
        ws.send(JSON.stringify(msg));
      } catch {}
      try {
        ws.close();
      } catch {}
      if (session) clients.delete(session.id);
    }
  });

  // ping loop para derrubar zombies
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const meta = wsMeta.get(ws);
      if (!meta) return;
      if (!meta.isAlive) {
        ws.terminate();
        return;
      }
      meta.isAlive = false;
      try {
        ws.ping();
      } catch {}
    });
  }, PING_INTERVAL_MS);

  wss.on("close", () => clearInterval(pingInterval));

  // graceful shutdown
  async function shutdown() {
    console.log("[server] shutting down…");
    for (const [, sess] of clients) {
      await sess.close().catch(() => {});
    }
    try {
      await sharedBrowser?.close();
    } catch {}
    try {
      await redis.quit();
    } catch {}
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err);
  });
})();
