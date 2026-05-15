import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

function getServerUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  // Detect Replit: use PORT to find backend
  if ((window as any).__REPL_ID__ || import.meta.env.VITE_REPLIT) {
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }
  // Development: assume same host, port 8080
  if (window.location.port === "5173") {
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }
  // Production: same origin
  return "";
}

export function getSocket(): Socket {
  if (!socket) {
    const url = getServerUrl();
    socket = io(url || undefined, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
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
