export interface Config {
  /** Path to the SmartThings CLI executable. */
  cliPath: string;
  /** Optional override for the CLI config/credentials directory. */
  cliConfigDir: string | null;
  transport: "stdio" | "http";
  httpHost: string;
  httpPort: number;
  httpAuthToken: string | null;
}

export function loadConfig(): Config {
  const transport = (process.env.MCP_TRANSPORT ?? "stdio").trim().toLowerCase();
  if (transport !== "stdio" && transport !== "http") {
    throw new Error(
      `Invalid MCP_TRANSPORT "${transport}". Expected "stdio" or "http".`,
    );
  }

  const httpAuthToken = process.env.MCP_HTTP_AUTH_TOKEN?.trim();
  const cliConfigDir = process.env.SMARTTHINGS_CLI_CONFIG_DIR?.trim();

  return {
    cliPath: (process.env.SMARTTHINGS_CLI_PATH ?? "smartthings").trim(),
    cliConfigDir: cliConfigDir && cliConfigDir !== "" ? cliConfigDir : null,
    transport,
    httpHost: (process.env.MCP_HTTP_HOST ?? "0.0.0.0").trim(),
    httpPort: Number(process.env.MCP_HTTP_PORT ?? "3000"),
    httpAuthToken: httpAuthToken && httpAuthToken !== "" ? httpAuthToken : null,
  };
}
