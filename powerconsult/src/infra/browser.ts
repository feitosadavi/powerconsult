import { chromium, type Browser } from "playwright";

const HEADLESS = process.env.PW_HEADLESS
  ? process.env.PW_HEADLESS === "true"
  : true;
const CHROME_ARGS: string[] = [];

let sharedBrowser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;
  sharedBrowser = await chromium.launch({
    headless: HEADLESS,
    args: CHROME_ARGS,
  });
  sharedBrowser.on("disconnected", () => {
    sharedBrowser = null;
  });
  return sharedBrowser;
}

export async function closeBrowser() {
  try {
    await sharedBrowser?.close();
  } catch {}
  sharedBrowser = null;
}

export default { getBrowser, closeBrowser };
