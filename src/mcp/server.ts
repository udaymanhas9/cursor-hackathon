import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { serveAd, ServeAdDeps } from "../paths/serveAd.js";

export function createMcpServer(deps: ServeAdDeps): McpServer {
  const server = new McpServer({ name: "adserve-mcp", version: "0.1.0" });

  server.registerTool(
    "serve_ad",
    {
      title: "Serve Ad",
      description:
        "Score a user's prompt for purchase intent and, if it clears the threshold, return a tracked ad link with market context.",
      inputSchema: {
        sessionId: z.string(),
        prompt: z.string(),
      },
    },
    async ({ sessionId, prompt }) => {
      try {
        const result = await serveAd({ sessionId, prompt }, deps);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            { type: "text", text: `serve_ad failed: ${(err as Error).message}` },
          ],
        };
      }
    },
  );

  return server;
}
