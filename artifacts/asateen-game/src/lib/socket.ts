import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

function getServerUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;

  const host = window.location.hostname;
  const port = window.location.port;

  // Render: guess backend URL from frontend URL
  if (host.endsWith(".onrender.com")) {
    // front is "game-of-asater-front.onrender.com" → backend is "game-of-asater.onrender.com"
    const frontParts = host.split("-front.");
    if (frontParts.length === 2) {
      return `${window.location.protocol}//${frontParts[0]}.${frontParts[1]}`;
    }
  }

  // Replit (old): backend on port 8080
  if (host.includes("replit") || port === "5173") {
    return `${window.location.protocol}//${host}:8080`;
  }

  // Replit (new .repl.co / picard): backend serves frontend on same origin — no override needed
  return "";
}

export function getSocket(): Socket {
  if (!socket) {
    const url = getServerUrl();
    console.log("[Socket] Connecting to:", url || "same origin");
    socket = io(url || undefined, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 30,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 30000,
    });
    socket.on("connect_error", (err) => {
      console.error("[Socket] Connection error:", err.message);
    });
    socket.on("connect", () => {
      console.log("[Socket] Connected successfully");
    });
  }
  return socket;
}

export function emitWhenConnected(event: string, ...args: unknown[]): void {
  const s = getSocket();
  if (s.connected) {
    s.emit(event, ...args);
  } else {
    s.once("connect", () => s.emit(event, ...args));
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
