import { useRef, useEffect } from "react";
import SocketIO, { Socket } from "socket.io-client";
import SocketIOParser from "socket.io-msgpack-parser";

export function useSocket(
  namespace: string,
  query: Record<string, string>,
  onInit: (socket: Socket) => void,
  onConnect: (socket: Socket) => void,
  useOrNot: boolean
): Socket {
  const refSocket = useRef<Socket | null>(null);

  useEffect(() => {
    if (useOrNot) {
      refSocket.current = SocketIO(window.apiEndpoint + namespace, {
        path: "/api/socket",
        transports: ["websocket"],
        query: query,
        ...{ parser: SocketIOParser }
      });
      refSocket.current.on("error", (err: any) => console.log("SocketIO error:", err));
      refSocket.current.on("disconnect", (reason: string) => console.log("SocketIO disconnect:", reason));
      refSocket.current.on("reconnect", (attempt: number) => console.log("SocketIO reconnect:", attempt));
      refSocket.current.on("connect", () => onConnect(refSocket.current));
      onInit(refSocket.current);
      return () => {
        if (refSocket.current) refSocket.current.disconnect();
      };
    }
  }, []);

  return refSocket.current;
}
