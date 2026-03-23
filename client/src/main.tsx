import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { AuthProvider } from "@/context/AuthContext.tsx"
import { GameProvider } from "@/context/GameContext.tsx"
import { useAuth } from "@/hooks/useAuth.ts"

function AuthenticatedGameProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  return <GameProvider authenticated={!!user}>{children}</GameProvider>
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark">
      <AuthProvider>
        <AuthenticatedGameProvider>
          <App />
        </AuthenticatedGameProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
)
