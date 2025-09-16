// utils/snapshotAndReplay.ts
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
  type BrowserContextOptions,
  type LaunchOptions,
  type Response,
  type Request,
} from "playwright";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { logger } from "./logger";

type BrowserName = "chromium" | "firefox" | "webkit";

export type ManifestEntry = {
  url: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  resourceType: string;
  file: string; // relative path inside snapshot dir
  contentType?: string;
};

type Manifest = {
  version: "1.0";
  startedAt: string;
  url: string; // primary URL snapshotted
  entries: ManifestEntry[];
  notes?: string;
};

type StorageDump = {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
};

export interface SnapshotOpts {
  url: string;
  key: string; // snapshot key → folder name
  browser?: BrowserName; // default: chromium
  headless?: boolean; // default: true
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  launchOptions?: LaunchOptions;
  contextOptions?: BrowserContextOptions;
  // What to save
  includeXHR?: boolean; // default: false (toggle to true if you want API responses saved)
  maxBodyBytes?: number; // default: 5 MB per asset
  accessToken: {
    key: string;
    value: any;
  };
}

export interface ReplayOpts {
  url?: string; // if omitted, uses manifest.url
  key: string;
  browser?: BrowserName; // default: chromium
  headless?: boolean; // default: true
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  launchOptions?: LaunchOptions;
  contextOptions?: BrowserContextOptions;
  offline?: boolean; // default: true (no network)
}

const DEFAULTS = {
  waitUntil: "load" as const,
  maxBodyBytes: 5 * 1024 * 1024,
};

const SNAP_BASE_DEFAULT = "/dev/shm/playwright/snapshots";

function sanitize(s: string) {
  return s.replace(/[^a-z0-9._-]+/gi, "_");
}

async function ensureBaseDir(preferred: string) {
  const fallback = path.join(os.tmpdir(), "playwright", "snapshots");
  try {
    await fs.mkdir(preferred, { recursive: true });
    const test = path.join(preferred, `.rw_${Date.now()}`);
    await fs.writeFile(test, "ok");
    await fs.unlink(test);
    return preferred;
  } catch {
    await fs.mkdir(fallback, { recursive: true });
    return fallback;
  }
}

function urlToKey(u: string) {
  return crypto.createHash("sha1").update(u).digest("hex");
}

function headersToObj(h: Record<string, string>) {
  // normalize header casing to original keys if possible
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h))
    out[k] = Array.isArray(v as any) ? String((v as any)[0]) : String(v);
  return out;
}

async function dumpStorages(page: Page): Promise<StorageDump> {
  logger("-> itau dump storage");

  return await page.evaluate(() => {
    const ls: Record<string, string> = {};
    const ss: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      ls[k] = localStorage.getItem(k)!;
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)!;
      ss[k] = sessionStorage.getItem(k)!;
    }
    return { localStorage: ls, sessionStorage: ss };
  });
}

function stripForbiddenHeaders(
  h: Record<string, string>
): Record<string, string> {
  const forbid = new Set(["content-length", "transfer-encoding"]);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (!forbid.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

/** Phase 1 — SNAPSHOT */
export async function snapshotSite(opts: SnapshotOpts): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
  snapshotDir: string;
  manifestPath: string;
  storageStatePath: string;
  storagesPath: string;
  entries: Map<string, ManifestEntry>;
}> {
  const {
    url,
    key,
    browser = "chromium",
    headless = true,
    waitUntil = DEFAULTS.waitUntil,
    launchOptions,
    contextOptions,
    accessToken,
  } = opts;

  const base = await ensureBaseDir(SNAP_BASE_DEFAULT);
  const safeKey = sanitize(key);
  const snapshotDir = path.join(base, safeKey);
  const assetsDir = path.join(snapshotDir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  const engine =
    browser === "firefox" ? firefox : browser === "webkit" ? webkit : chromium;
  const browserInstance = await engine.launch({ headless, ...launchOptions });
  const context = await browserInstance.newContext({ ...contextOptions });
  const page = await context.newPage();

  const entries = new Map<string, ManifestEntry>();

  context.addInitScript(({ key, value }) => {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  }, accessToken);

  await page.goto(url, { waitUntil });

  // Give some time for late assets (fonts, lazy scripts)
  await page.waitForTimeout(250);

  const storagesPath = path.join(snapshotDir, "storages.json");
  const manifestPath = path.join(snapshotDir, "manifest.json");
  const storageStatePath = path.join(snapshotDir, "storageState.json");

  return {
    browser: browserInstance,
    context,
    page,
    entries,
    snapshotDir,
    manifestPath,
    storageStatePath,
    storagesPath,
  };
}

type SaveResponseInput = {
  includeXHR: boolean;
  maxBodyBytes?: number;
  snapshotDir: string;
  res: Response;
};

type SaveResponseOutput = {
  name: string;
  value: ManifestEntry;
};

export async function saveResponse({
  res,
  maxBodyBytes = DEFAULTS.maxBodyBytes,
  includeXHR,
  snapshotDir,
}: SaveResponseInput): Promise<SaveResponseOutput | undefined> {
  try {
    const req = res.request();
    const rt = req.resourceType();
    // filter resource types
    const saveIt =
      rt === "document" ||
      rt === "stylesheet" ||
      rt === "script" ||
      rt === "image" ||
      rt === "font" ||
      (includeXHR && (rt === "xhr" || rt === "fetch"));
    if (!saveIt) return;

    const url = req.url();
    const method = req.method();
    const body = await res.body().catch(() => undefined);
    if (!body) return; // some blocked/cross-site responses may fail

    const slice = body;
    const name = `${urlToKey(`${method} ${url}`)}.bin`;
    const rel = path.join("assets", name);
    const file = path.join(snapshotDir, rel);
    await fs.writeFile(file, slice);

    const headers = await res
      .allHeaders()
      .catch(() => ({} as Record<string, string>));
    const entry: ManifestEntry = {
      url,
      method,
      status: res.status(),
      statusText: res.statusText(),
      headers: headersToObj(headers),
      resourceType: rt,
      file: rel,
      contentType: headers["content-type"],
    };
    return { name: `${method} ${url}`, value: entry };
  } catch {
    /* ignore individual failures */
  }
}

// Coloque fora da função principal
export async function saveSnapshotArtifacts(
  page: Page,
  context: BrowserContext,
  {
    snapshotDir,
    manifestPath,
    storagesPath,
    entries,
    url,
  }: {
    snapshotDir: string;
    manifestPath: string;
    storagesPath: string;
    entries: Map<string, ManifestEntry>;
    url: string;
  }
) {
  logger("-> itau saving snapshot artifacts");
  // 1) Storages (precisa da page viva)
  const storages = await dumpStorages(page);
  await fs.writeFile(storagesPath, JSON.stringify(storages, null, 2), "utf8");

  logger("-> saving snapshot artifacts...");
  // 2) Cookies/localStorage de cookies
  const storageStatePath = path.join(snapshotDir, "storageState.json");
  await context.storageState({ path: storageStatePath });

  logger(`-> saving manifest into ${manifestPath}`);
  // 3) Manifest
  const manifest: Manifest = {
    version: "1.0",
    startedAt: new Date().toISOString(),
    url,
    entries: Array.from(entries.values()),
    notes: "Generated by snapshotSite",
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

/** Phase 2 — REPLAY (inject + fulfill) */
export async function launchFromSnapshot(opts: ReplayOpts): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
  snapshotDir: string;
}> {
  const {
    key,
    url,
    browser = "chromium",
    headless = true,
    waitUntil = DEFAULTS.waitUntil,
    launchOptions,
    contextOptions,
    offline = true,
  } = opts;

  const base = await ensureBaseDir(SNAP_BASE_DEFAULT);
  const safeKey = sanitize(key);
  const snapshotDir = path.join(base, safeKey);
  const manifestPath = path.join(snapshotDir, "manifest.json");
  const storageStatePath = path.join(snapshotDir, "storageState.json");
  const storagesPath = path.join(snapshotDir, "storages.json");

  if (!fssync.existsSync(manifestPath))
    throw new Error(`Manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8")
  ) as Manifest;

  const engine =
    browser === "firefox" ? firefox : browser === "webkit" ? webkit : chromium;

  const ctxOpts: BrowserContextOptions = {
    ...contextOptions,
    ...(fssync.existsSync(storageStatePath)
      ? { storageState: storageStatePath }
      : {}),
  };

  const browserInstance = await engine.launch({ headless, ...launchOptions });
  const context = await browserInstance.newContext(ctxOpts);

  logger(`-> storagesPathExists: ${fssync.existsSync(storagesPath)}`);
  // Preload local/sessionStorage before any document loads
  if (fssync.existsSync(storagesPath)) {
    logger("-> setup storage");
    const storages = JSON.parse(
      await fs.readFile(storagesPath, "utf8")
    ) as StorageDump;
    await context.addInitScript((dump) => {
      try {
        for (const [k, v] of Object.entries(dump.localStorage || {}))
          localStorage.setItem(k, v as string);
        for (const [k, v] of Object.entries(dump.sessionStorage || {}))
          sessionStorage.setItem(k, v as string);
      } catch {}
    }, storages);
  }

  // Build an index for quick lookup
  const byKey = new Map<string, ManifestEntry>();
  console.log("entries: ", manifest.entries);

  for (const e of manifest.entries) byKey.set(`${e.method} ${e.url}`, e);
  console.log("index: ", byKey.keys());
  console.log("index: ", byKey.values());

  // Route EVERYTHING from the snapshot
  logger("-> Start routing from snapshot");
  await context.route("**/*", async (route) => {
    logger("-> Routing from snapshot...");
    const req = route.request();
    const key = `${req.method()} ${req.url()}`;
    logger(`Key: ${key}`);
    const hit = byKey.get(key);
    if (!hit) {
      // If fully offline, abort; otherwise fallback (but default here is offline enforced)
      return offline ? route.abort() : route.fallback();
    }
    try {
      const fileAbs = path.join(snapshotDir, hit.file);
      const body = await fs.readFile(fileAbs);
      const headers = stripForbiddenHeaders(hit.headers || {});
      if (
        hit.contentType &&
        !headers["content-type"] &&
        !headers["Content-Type"]
      ) {
        headers["Content-Type"] = hit.contentType;
      }
      await route.fulfill({
        status: hit.status || 200,
        headers,
        body,
      });
    } catch {
      return offline ? route.abort() : route.fallback();
    }
  });

  if (offline) await context.setOffline(true);

  const page = await context.newPage();
  await page.goto(url ?? manifest.url, { waitUntil });

  return { browser: browserInstance, context, page, snapshotDir };
}
