import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react"

export interface AuthUser {
  discordId: string
  username: string
  normalizedUsername?: string
  avatarUrl: string
  isHost?: boolean
  isGuest?: boolean
}

export interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  devMode: boolean
  usernameLogin: (username: string, hostCode?: string) => Promise<{ ok: boolean; error?: string }>
  guestLogin: () => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

const API_BASE = ""

/** Get the auth token from sessionStorage (per-tab). */
function getAuthToken(): string | null {
  return sessionStorage.getItem("authToken") ?? sessionStorage.getItem("devToken")
}

/** Build headers that include the auth token if present. */
function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [devMode, setDevMode] = useState(false)

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        credentials: "include",
        headers: authHeaders(),
      })
      const data = await res.json()

      if (data.devMode === true) {
        setDevMode(true)
      }

      if (res.ok) {
        setUser(data)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  const usernameLogin = useCallback(async (username: string, hostCode = "") => {
    try {
      const res = await fetch(`${API_BASE}/auth/username`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          ...(hostCode.trim() ? { hostCode: hostCode.trim() } : {}),
        }),
      })
      const data = await res.json().catch(() => null) as
        | { token?: string; user?: AuthUser; error?: string }
        | null

      if (!res.ok) {
        return { ok: false, error: data?.error ?? "Login failed" }
      }

      if (!data?.token || !data.user) {
        return { ok: false, error: "Login failed" }
      }

      // Store token in sessionStorage (per-tab, not shared across tabs).
      sessionStorage.setItem("authToken", data.token)
      sessionStorage.removeItem("devToken")
      setUser(data.user)
      return { ok: true }
    } catch (err) {
      console.error("Username login error:", err)
      return { ok: false, error: "Login failed" }
    }
  }, [])

  const guestLogin = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/guest`, {
        credentials: "include",
      })
      if (!res.ok) {
        console.error("Guest login failed")
        return
      }
      const data = await res.json() as { token: string; user: AuthUser }
      sessionStorage.setItem("authToken", data.token)
      sessionStorage.removeItem("devToken")
      setUser(data.user)
    } catch (err) {
      console.error("Guest login error:", err)
    }
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem("authToken")
    sessionStorage.removeItem("devToken")
    window.location.href = `${API_BASE}/auth/logout`
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, devMode, usernameLogin, guestLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
