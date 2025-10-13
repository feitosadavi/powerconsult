import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { WebSocketServer, WebSocket, RawData } from "ws";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";

import { getSimulationsController } from "../controllers";
import { AvailableBanks, LocalStorageToken } from "../domain";
import { BANCOPAN_TOKEN } from "../constants";
import { logger } from "../lib";
import { getVehicleOptionsController } from "../controllers/getVehiclesOptions.controller";
import { BANKS, StoreBankCreds } from "../banks";

import { redis } from "../infra/redis";
import { getBrowser as infraGetBrowser, closeBrowser } from "../infra/browser";

const PORT = parseInt(process.env.PORT || "5000", 10);
const MAX_CLIENTS = parseInt(process.env.MAX_CLIENTS || "200", 10);
const HEADLESS = true;
const CLIENT_IDLE_MS = parseInt(
  process.env.CLIENT_IDLE_MS || `${5 * 60_000}`,
  10
);
const PING_INTERVAL_MS = parseInt(process.env.PING_INTERVAL_MS || "20000", 10);
const NAV_TIMEOUT_MS = parseInt(process.env.NAV_TIMEOUT_MS || "45000", 10);
const CHROME_ARGS: string[] = [];
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-please-change";

type JwtPayload = {
  userId: string;
  storeId: string;
  iat?: number;
  exp?: number;
};

type OpName = "isAvailableForFinancing" | "getVehicleOptions" | "close";

type ClientMsg = { op: OpName; reqId?: string; args?: Record<string, unknown> };

type ServerReply =
  | { event: "ready"; payload: { clientId: string } }
  | { event: "reply"; payload: { reqId?: string; ok: true; payload: unknown } }
  | { event: "reply"; payload: { reqId?: string; ok: false; payload: unknown } }
  | {
      event: "error";
      payload: { message: string; error?: string; load?: string };
    };

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

  public user!: UserSession;

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

  async configBanks(): Promise<LocalStorageToken[]> {
    const key = `bankCreds:${this.user.storeId}`;
    const raw = await redis.get(key);
    if (!raw) throw new Error("Creds not found");
    const creds = JSON.parse(raw) as StoreBankCreds;

    const tokens: LocalStorageToken[] = [];

    Object.keys(creds).forEach((bank) => {
      logger(`-> setup bank creds for ${bank}`);
      const token = BANKS[bank as AvailableBanks].services.config(
        creds[bank as AvailableBanks]!,
        this.user.storeId
      );
      tokens.push(token);
    });

    await redis.set(
      `${BANCOPAN_TOKEN}:${this.user.storeId}`,
      JSON.stringify({})
    );

    return tokens;
  }

  async init() {
    this.context = await this.browser.newContext({
      viewport: { width: 1366, height: 768 },
    });
    const tokens = await this.configBanks();

    await this.context.addInitScript((tokens: LocalStorageToken[]) => {
      tokens.forEach((token) => {
        if (token.origins && !token.origins.includes(location.origin)) return;
        window.sessionStorage.setItem(token.key, JSON.stringify(token.value));
      });
    }, tokens);
    this.page = await this.context.newPage();
    this.page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    this.armIdleTimer();
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

  private async cmdGetVehicleOptions(args?: Record<string, unknown>) {
    logger(`-> cmdGetVehicleOptions`, this.user);
    const cpf = String(args?.cpf ?? "");
    const bancos: AvailableBanks[] = (args?.bancos as AvailableBanks[]) || [];

    return await getVehicleOptionsController({
      user: this.user,
      bancos: bancos as AvailableBanks[],
      browserContext: this.context,
      service: {
        name: "getVehicleOptions",
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
            case "getVehicleOptions":
              return this.replyOk(reqId, await this.cmdGetVehicleOptions(args));
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

function parseTokenFromRequest(req: any): string | null {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const q = url.searchParams.get("token");
    if (q) return q;
  } catch {}

  const proto = req.headers["sec-websocket-protocol"];
  if (typeof proto === "string") {
    const parts = proto.split(",").map((s) => s.trim());
    const bearerIdx = parts.findIndex((p) => p.toLowerCase() === "bearer");
    if (bearerIdx >= 0 && parts[bearerIdx + 1]) return parts[bearerIdx + 1];
  }

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

const clients = new Map<string, ClientSession>();
const wsMeta = new WeakMap<WebSocket, { isAlive: boolean; clientId: string }>();

function currentLoad() {
  return `${clients.size}/${MAX_CLIENTS}`;
}

export async function startWebSocketServer(port = PORT) {
  await Promise.resolve();
  const wss = new WebSocketServer({ port });
  console.log(`[server] listening on ws://0.0.0.0:${port}`);

  wss.on("connection", async (ws, req) => {
    console.log(
      `[server] new ws connection from ${req.socket.remoteAddress ?? "unknown"}`
    );

    const token = parseTokenFromRequest(req);
    if (!token) {
      ws.send(
        JSON.stringify({
          event: "error",
          payload: { message: "missing_token" },
        } as ServerReply)
      );
      ws.close();
      return;
    }

    let user: UserSession;
    try {
      user = verifyJwt(token);
    } catch (e) {
      ws.send(
        JSON.stringify({
          event: "error",
          payload: { message: "invalid_token" },
        } as ServerReply)
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

  async function shutdown() {
    console.log("[server] shutting down…");
    for (const [, sess] of clients) {
      await sess.close().catch(() => {});
    }
    try {
      await closeBrowser();
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
}
startWebSocketServer();
