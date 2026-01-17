import { handleRequest } from "./router";

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }
    return handleRequest(request, env);
  },
};
