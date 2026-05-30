import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../utils/api";

const AUTH_STORAGE_KEY = "image-gen-auth";

export interface AuthSession {
  token: string;
  userId: string;
  name: string;
}

interface LoginInput {
  name: string;
  password: string;
}

interface LoginResponse {
  token: string;
  userId: string;
  name: string;
}

export const useAuth = (apiUrl: string) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const storedSession = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (storedSession) {
      setSession(JSON.parse(storedSession) as AuthSession);
    }
    setIsAuthReady(true);
  }, []);

  const clearAuth = useCallback(() => {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    setSession(null);
  }, []);

  const login = useCallback(
    async ({ name, password }: LoginInput) => {
      setIsLoggingIn(true);
      setLoginError("");

      try {
        const response = await apiFetch(`${apiUrl}/auth/login`, {
          method: "POST",
          body: JSON.stringify({ name, password }),
        });
        const nextSession = (await response.json()) as LoginResponse;

        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
        setSession(nextSession);
      } catch (error) {
        setLoginError(error instanceof Error ? error.message : "Could not log in");
      } finally {
        setIsLoggingIn(false);
      }
    },
    [apiUrl]
  );

  return {
    clearAuth,
    isAuthReady,
    isLoggingIn,
    login,
    loginError,
    session,
  };
};
