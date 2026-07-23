/**
 * Minimal SmartThings REST API client.
 * Docs: https://developer.smartthings.com/docs/api/public
 */

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
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "SmartThingsError";
  }
}

export class SmartThingsClient {
  constructor(
    private readonly token: string,
    private readonly apiBase: string,
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new SmartThingsError(
        `SmartThings API ${res.status} ${res.statusText} for ${init.method ?? "GET"} ${path}`,
        res.status,
        text,
      );
    }

    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  async listDevices(locationId?: string): Promise<Device[]> {
    const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
    const data = await this.request<{ items: Device[] }>(`/devices${query}`);
    return data.items ?? [];
  }

  async getDevice(deviceId: string): Promise<Device> {
    return this.request<Device>(`/devices/${encodeURIComponent(deviceId)}`);
  }

  async getDeviceStatus(deviceId: string): Promise<unknown> {
    return this.request<unknown>(`/devices/${encodeURIComponent(deviceId)}/status`);
  }

  async executeCommands(deviceId: string, commands: Command[]): Promise<unknown> {
    return this.request<unknown>(
      `/devices/${encodeURIComponent(deviceId)}/commands`,
      {
        method: "POST",
        body: JSON.stringify({ commands }),
      },
    );
  }

  async listLocations(): Promise<Location[]> {
    const data = await this.request<{ items: Location[] }>(`/locations`);
    return data.items ?? [];
  }

  async listRooms(locationId: string): Promise<Room[]> {
    const data = await this.request<{ items: Room[] }>(
      `/locations/${encodeURIComponent(locationId)}/rooms`,
    );
    return data.items ?? [];
  }

  async listScenes(locationId?: string): Promise<Scene[]> {
    const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
    const data = await this.request<{ items: Scene[] }>(`/scenes${query}`);
    return data.items ?? [];
  }

  async executeScene(sceneId: string): Promise<unknown> {
    return this.request<unknown>(
      `/scenes/${encodeURIComponent(sceneId)}/execute`,
      { method: "POST" },
    );
  }
}
