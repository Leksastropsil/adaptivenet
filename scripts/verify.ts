import { handleRequest } from "../src/router";

async function test(path: string) {
  console.log(`Testing ${path}...`);
  const req = new Request(`http://localhost${path}`);
  const mockEnv = {
    BASE_URL: "https://tv7.lk21official.cc",
    PLAYER_IFRAME_HOST: "playeriframe.sbs",
    CLOUD_HOST: "cloud.hownetwork.xyz",
    USER_AGENT: "Mozilla/5.0 (Test)",
  };
  const res = await handleRequest(req, mockEnv);
  console.log(`Status: ${res.status}`);
  console.log(`Cache-Control: ${res.headers.get("Cache-Control")}`);
  if (res.ok) {
    const json = await res.json();
    console.log("Response key check:", Object.keys(json as object));
    if (Array.isArray(json)) {
      console.log(`Array length: ${json.length}`);
      if (json.length > 0)
        console.log("First item:", JSON.stringify(json[0]).slice(0, 100));
    } else {
      console.log("Object:", JSON.stringify(json).slice(0, 100));
    }
  } else {
    console.log("Error:", await res.text());
  }
  console.log("---");
}

async function run() {
  await test("/filters");
  await test("/movies?page=1");
  // await test("/search?q=avengers");
  // await test("/watch/tale-silyan-2025");
}

run();
