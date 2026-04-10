import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true,
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
