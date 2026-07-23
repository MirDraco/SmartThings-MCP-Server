export interface Config {
  token: string;
  apiBase: string;
  transport: "stdio" | "http";
  httpHost: string;
  httpPort: number;
  httpAuthToken: string | null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `See .env.example for configuration details.`,
    );
  }
  return value.trim();
}

export function loadConfig(): Config {
  const transport = (process.env.MCP_TRANSPORT ?? "stdio").trim().toLowerCase();
  if (transport !== "stdio" && transport !== "http") {
    throw new Error(
      `Invalid MCP_TRANSPORT "${transport}". Expected "stdio" or "http".`,
    );
  }

  const httpAuthToken = process.env.MCP_HTTP_AUTH_TOKEN?.trim();

  return {
    token: requireEnv("SMARTTHINGS_TOKEN"),
    apiBase: (process.env.SMARTTHINGS_API_BASE ?? "https://api.smartthings.com/v1").trim(),
    transport,
    httpHost: (process.env.MCP_HTTP_HOST ?? "0.0.0.0").trim(),
    httpPort: Number(process.env.MCP_HTTP_PORT ?? "3000"),
    httpAuthToken: httpAuthToken && httpAuthToken !== "" ? httpAuthToken : null,
  };
}
