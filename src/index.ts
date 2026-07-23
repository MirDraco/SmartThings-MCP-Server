#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { SmartThingsClient } from "./smartthings.js";

async function runStdio(client: SmartThingsClient): Promise<void> {
  const server = createServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logging in stdio mode (stdout is the protocol channel).
  console.error("SmartThings MCP server running on stdio");
}

async function runHttp(
  client: SmartThingsClient,
  host: string,
  port: number,
  authToken: string | null,
): Promise<void> {
  const app = express();
  app.use(express.json());

  // Optional bearer auth middleware for the MCP endpoint.
  const requireAuth = (req: Request, res: Response, next: () => void): void => {
    if (!authToken) {
      next();
      return;
    }
    const header = req.headers.authorization ?? "";
    if (header === `Bearer ${authToken}`) {
      next();
      return;
    }
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
  };

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Session store: sessionId -> transport.
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
      });

      transport.onclose = () => {
        if (transport!.sessionId) {
          transports.delete(transport!.sessionId);
        }
      };

      const server = createServer(client);
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  // GET / DELETE for SSE stream and session teardown.
  const handleSessionRequest = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transport.handleRequest(req, res);
  };

  app.get("/mcp", requireAuth, handleSessionRequest);
  app.delete("/mcp", requireAuth, handleSessionRequest);

  app.listen(port, host, () => {
    console.error(
      `SmartThings MCP server running on http://${host}:${port}/mcp` +
        (authToken ? " (bearer auth enabled)" : " (no auth)"),
    );
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new SmartThingsClient(config.token, config.apiBase);

  if (config.transport === "http") {
    await runHttp(client, config.httpHost, config.httpPort, config.httpAuthToken);
  } else {
    await runStdio(client);
  }
}

main().catch((err) => {
  console.error("Fatal error starting SmartThings MCP server:", err);
  process.exit(1);
});
