import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

function getServerUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  if ((window as any).__REPL_ID__ || import.meta.env.VITE_REPLIT) {
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }
  if (window.location.port === "5173") {
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }
  return "";
}

export function getSocket(): Socket {
  if (!socket) {
    const url = getServerUrl();
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
  }
  return socket;
}

export function emitWhenConnected(event: string, ...args: unknown[]): void {
  const s = getSocket();
  if (s.connected) {
    s.emit(event, ...args);
  } else {
    const onConnect = () => {
      s.emit(event, ...args);
      s.off("connect", onConnect);
    };
    s.on("connect", onConnect);
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
