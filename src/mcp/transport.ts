import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { ServeAdDeps } from "../paths/serveAd.js";

// Stateless Streamable HTTP: build a fresh server + transport per POST and tear
// them down when the response closes. Clients must POST JSON-RPC and send
// `Accept: application/json, text/event-stream`.
export function mcpHttpHandler(deps: ServeAdDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const server = createMcpServer(deps);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
}
