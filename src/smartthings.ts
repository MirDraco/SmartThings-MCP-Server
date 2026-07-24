/**
 * SmartThings client implemented as a bridge over the official SmartThings CLI.
 *
 * Why the CLI instead of raw REST + PAT?
 * - PATs expire after 24h and cannot be auto-renewed.
 * - The CLI stores an OAuth access token + refresh token and transparently
 *   refreshes the access token when it expires. By shelling out to the CLI we
 *   inherit that automatic, unattended token renewal for free.
 *
 * Requirements at runtime:
 * - The `smartthings` CLI must be on PATH.
 * - A valid credentials file must exist (mounted into the container) at the
 *   CLI's config dir, e.g. ~/.config/@smartthings/cli/credentials.json
 */

import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Device {
  deviceId: string;
  name: string;
  label?: string;
  roomId?: string;
  locationId?: string;
  components: DeviceComponent[];
  deviceTypeName?: string;
  manufacturerName?: string;
}

export interface DeviceComponent {
  id: string;
  capabilities: { id: string; version?: number }[];
}

export interface Location {
  locationId: string;
  name: string;
}

export interface Room {
  roomId: string;
  name: string;
  locationId: string;
}

export interface Scene {
  sceneId: string;
  sceneName: string;
  locationId?: string;
}

export interface Command {
  component?: string;
  capability: string;
  command: string;
  arguments?: unknown[];
}

export class SmartThingsError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "SmartThingsError";
  }
}

export class SmartThingsClient {
  constructor(
    private readonly cliPath: string = "smartthings",
    /** Extra env for the CLI process (e.g. SMARTTHINGS_CLI_CONFIG_DIR). */
    private readonly env: NodeJS.ProcessEnv = {},
  ) {}

  /** Run the CLI and return stdout. Throws SmartThingsError on non-zero exit. */
  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        this.cliPath,
        args,
        {
          env: { ...process.env, ...this.env },
          maxBuffer: 10 * 1024 * 1024,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              new SmartThingsError(
                `smartthings ${args.join(" ")} failed: ${error.message}`,
                typeof error.code === "number" ? error.code : null,
                stderr,
              ),
            );
            return;
          }
          resolve(stdout);
        },
      );
    });
  }

  /** Run the CLI expecting JSON output (adds -j). */
  private async runJson<T>(args: string[]): Promise<T> {
    const out = await this.run([...args, "-j"]);
    const trimmed = out.trim();
    if (!trimmed) return undefined as T;
    return JSON.parse(trimmed) as T;
  }

  async listDevices(locationId?: string): Promise<Device[]> {
    const args = ["devices"];
    if (locationId) args.push("--location", locationId);
    const data = await this.runJson<Device[]>(args);
    return Array.isArray(data) ? data : [];
  }

  async getDevice(deviceId: string): Promise<Device> {
    return this.runJson<Device>(["devices", deviceId]);
  }

  async getDeviceStatus(deviceId: string): Promise<unknown> {
    return this.runJson<unknown>(["devices:status", deviceId]);
  }

  /**
   * Execute one or more commands on a device.
   * Commands are passed to the CLI as a JSON input file (-i) to support
   * arbitrary arguments (numbers, strings, objects) without shell-quoting.
   */
  async executeCommands(deviceId: string, commands: Command[]): Promise<void> {
    const normalized = commands.map((c) => ({
      component: c.component ?? "main",
      capability: c.capability,
      command: c.command,
      arguments: c.arguments ?? [],
    }));

    const dir = await mkdtemp(join(tmpdir(), "st-cmd-"));
    const file = join(dir, "commands.json");
    try {
      await writeFile(file, JSON.stringify({ commands: normalized }), "utf8");
      await this.run(["devices:commands", deviceId, "-i", file]);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async listLocations(): Promise<Location[]> {
    const data = await this.runJson<Location[]>(["locations"]);
    return Array.isArray(data) ? data : [];
  }

  async listRooms(locationId: string): Promise<Room[]> {
    const data = await this.runJson<Room[]>(["locations:rooms", locationId]);
    return Array.isArray(data) ? data : [];
  }

  async listScenes(locationId?: string): Promise<Scene[]> {
    const args = ["scenes"];
    if (locationId) args.push("--location", locationId);
    const data = await this.runJson<Scene[]>(args);
    return Array.isArray(data) ? data : [];
  }

  async executeScene(sceneId: string): Promise<void> {
    await this.run(["scenes:execute", sceneId]);
  }
}
