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
  avatarUrl: string
  isHost: boolean
  isGuest?: boolean
}

export interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  devMode: boolean
  login: () => void
  devLogin: (username: string, host?: boolean) => void
  guestLogin: () => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

const API_BASE = ""

/** Get the dev token from sessionStorage (per-tab). */
function getDevToken(): string | null {
  return sessionStorage.getItem("devToken")
}

/** Build headers that include the dev token if present. */
function authHeaders(): Record<string, string> {
  const token = getDevToken()
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

  const login = useCallback(() => {
    window.location.href = `${API_BASE}/auth/discord`
  }, [])

  const devLogin = useCallback(async (username: string, host = false) => {
    try {
      const params = new URLSearchParams({ username })
      if (host) params.set("host", "true")

      const res = await fetch(`${API_BASE}/auth/dev?${params.toString()}`, {
        credentials: "include",
      })

      if (!res.ok) {
        console.error("Dev login failed")
        return
      }

      const data = await res.json() as { token: string; user: AuthUser }

      // Store token in sessionStorage (per-tab, not shared across tabs)
      sessionStorage.setItem("devToken", data.token)
      setUser(data.user)
    } catch (err) {
      console.error("Dev login error:", err)
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
      sessionStorage.setItem("devToken", data.token)
      setUser(data.user)
    } catch (err) {
      console.error("Guest login error:", err)
    }
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem("devToken")
    window.location.href = `${API_BASE}/auth/logout`
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, devMode, login, devLogin, guestLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
