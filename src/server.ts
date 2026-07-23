import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SmartThingsClient, SmartThingsError, type Command } from "./smartthings.js";

function toText(data: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function toError(err: unknown): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  let message: string;
  if (err instanceof SmartThingsError) {
    message = `SmartThings API error (${err.status}): ${err.message}\n${err.body}`;
  } else if (err instanceof Error) {
    message = err.message;
  } else {
    message = String(err);
  }
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/**
 * Builds a fully-configured MCP server exposing SmartThings tools.
 * A fresh instance should be created per HTTP session; a single shared
 * instance is fine for stdio.
 */
export function createServer(client: SmartThingsClient): McpServer {
  const server = new McpServer({
    name: "smartthings-mcp-server",
    version: "1.0.0",
  });

  server.tool(
    "list_locations",
    "List all SmartThings locations (homes) available to this account.",
    {},
    async () => {
      try {
        return toText(await client.listLocations());
      } catch (err) {
        return toError(err);
      }
    },
  );

  server.tool(
    "list_rooms",
    "List rooms within a specific SmartThings location.",
    {
      locationId: z.string().describe("The location ID to list rooms for."),
    },
    async ({ locationId }) => {
      try {
        return toText(await client.listRooms(locationId));
      } catch (err) {
        return toError(err);
      }
    },
  );

  server.tool(
    "list_devices",
    "List all SmartThings devices, including their IDs, labels, and capabilities. " +
      "Use this first to discover which devices exist and what they can do.",
    {
      locationId: z
        .string()
        .optional()
        .describe("Optional location ID to filter devices."),
    },
    async ({ locationId }) => {
      try {
        const devices = await client.listDevices(locationId);
        // Return a compact, agent-friendly summary.
        const summary = devices.map((d) => ({
          deviceId: d.deviceId,
          label: d.label ?? d.name,
          roomId: d.roomId,
          locationId: d.locationId,
          capabilities: d.components.flatMap((c) =>
            c.capabilities.map((cap) => `${c.id}:${cap.id}`),
          ),
        }));
        return toText(summary);
      } catch (err) {
        return toError(err);
      }
    },
  );

  server.tool(
    "get_device_status",
    "Get the full current status (all capability attribute values) of a device.",
    {
      deviceId: z.string().describe("The device ID to query."),
    },
    async ({ deviceId }) => {
      try {
        return toText(await client.getDeviceStatus(deviceId));
      } catch (err) {
        return toError(err);
      }
    },
  );

  server.tool(
    "get_device",
    "Get detailed metadata (components, capabilities, manufacturer) for a device.",
    {
      deviceId: z.string().describe("The device ID to query."),
    },
    async ({ deviceId }) => {
      try {
        return toText(await client.getDevice(deviceId));
      } catch (err) {
        return toError(err);
      }
    },
  );

  server.tool(
    "execute_device_command",
    "Send one or more commands to a device. Each command targets a capability. " +
      'Example: turn a light on -> {"capability":"switch","command":"on"}. ' +
      'Set level -> {"capability":"switchLevel","command":"setLevel","arguments":[50]}.',
    {
      deviceId: z.string().describe("The target device ID."),
      commands: z
        .array(
          z.object({
            component: z
              .string()
              .optional()
              .describe('Component ID, defaults to "main".'),
            capability: z
              .string()
              .describe('Capability ID, e.g. "switch", "switchLevel", "thermostatMode".'),
            command: z
              .string()
              .describe('Command name, e.g. "on", "off", "setLevel".'),
            arguments: z
              .array(z.any())
              .optional()
              .describe("Positional arguments for the command."),
          }),
        )
        .describe("List of commands to execute in order."),
    },
    async ({ deviceId, commands }) => {
      try {
        const normalized: Command[] = commands.map((c) => ({
          component: c.component ?? "main",
          capability: c.capability,
          command: c.command,
          arguments: c.arguments ?? [],
        }));
        const result = await client.executeCommands(deviceId, normalized);
        return toText({ ok: true, result });
      } catch (err) {
        return toError(err);
      }
    },
  );

  server.tool(
    "list_scenes",
    "List SmartThings scenes that can be executed.",
    {
      locationId: z
        .string()
        .optional()
        .describe("Optional location ID to filter scenes."),
    },
    async ({ locationId }) => {
      try {
        return toText(await client.listScenes(locationId));
      } catch (err) {
        return toError(err);
      }
    },
  );

  server.tool(
    "execute_scene",
    "Execute (run) a SmartThings scene by its scene ID.",
    {
      sceneId: z.string().describe("The scene ID to execute."),
    },
    async ({ sceneId }) => {
      try {
        const result = await client.executeScene(sceneId);
        return toText({ ok: true, result });
      } catch (err) {
        return toError(err);
      }
    },
  );

  return server;
}
