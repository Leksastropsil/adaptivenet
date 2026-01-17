import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { spawn } from "child_process";
import { executablePath } from "puppeteer";

puppeteer.use(StealthPlugin());

const LK21_URL = "https://tv7.lk21official.cc"; // Pastikan domain ini hidup

// Fungsi Helper untuk Upload Secret ke Cloudflare
function uploadSecret(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[Running] Uploading ${key} ke Cloudflare...`);

    const wrangler = spawn("bunx", ["wrangler", "secret", "put", key], {
      stdio: ["pipe", "inherit", "inherit"],
      shell: true,
    });

    wrangler.stdin.write(value);
    wrangler.stdin.end();

    wrangler.on("close", (code) => {
      if (code === 0) {
        console.log(`[Success] ${key} updated!`);
        resolve();
      } else {
        console.error(`[Error] Failed to update ${key}. Code: ${code}`);
        reject(new Error(`Wrangler exit code ${code}`));
      }
    });

    wrangler.on("error", (err) => {
      reject(err);
    });
  });
}

async function run() {
  console.log(`[Start] Launching Browser (Stealth Mode)...`);

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: executablePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  console.log(`[Nav] Navigate to ${LK21_URL}...`);
  try {
    await page.goto(LK21_URL, { waitUntil: "networkidle2", timeout: 60000 });
  } catch (e) {
    console.log("[Warn] Timeout but continuing...");
  }

  console.log(`[Wait] Waiting 5s for challenges...`);
  await new Promise((r) => setTimeout(r, 5000));

  // 1. AMBIL COOKIE
  const cookies = await page.cookies();
  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  console.log(`[Info] Got cookies length: ${cookieString.length}`);

  // 2. AMBIL USER AGENT (WAJIB ADA!)
  const userAgent = await page.evaluate(() => navigator.userAgent);
  console.log(`[Info] Got User-Agent: ${userAgent}`);

  await browser.close();

  if (!cookieString || !userAgent) {
    console.error(`[Error] Failed to get data!`);
    process.exit(1);
  }

  // 3. UPLOAD KE CLOUDFLARE (Berurutan)
  try {
    await uploadSecret("LK21_COOKIE", cookieString);
    console.log("---");
    await uploadSecret("USER_AGENT", userAgent); // <--- INI KUNCINYA

    console.log("\n[DONE] Semua data berhasil disinkronkan ke Cloudflare!");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
