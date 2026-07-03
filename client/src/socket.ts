import { io } from "socket.io-client"

export const socket = io({
  withCredentials: true,
  autoConnect: false,
  transports: ["websocket"],
  auth: (cb) => {
    const authToken =
      sessionStorage.getItem("authToken") ?? sessionStorage.getItem("devToken")
    console.log("[socket] auth callback, authToken present:", !!authToken)
    cb(authToken ? { token: authToken } : {})
  },
})

socket.on("connect", () => console.log("[socket] connected:", socket.id))
socket.on("connect_error", (err) => console.error("[socket] connect_error:", err.message))
socket.on("disconnect", (reason) => console.log("[socket] disconnected:", reason))
