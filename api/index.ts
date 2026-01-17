import { handleRequest } from "../src/router";

export const config = {
  runtime: "nodejs", // Use Node.js runtime instead of Edge for better library compatibility
};

export default async function handler(request: Request) {
  // Option handling could be shared, but simplest is to just call handleRequest which handles headers
  // Actually router handles method check? No, src/index.ts handled OPTIONS.
  // We should duplicate OPTIONS handling or move it to router.
  // For now, I'll add simple OPTIONS handling here too to be safe.
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }
  return handleRequest(request);
}
