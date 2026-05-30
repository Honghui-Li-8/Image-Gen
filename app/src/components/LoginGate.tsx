import { useMemo, useState } from "react";

interface LoginGateProps {
  isLoggingIn: boolean;
  loginError: string;
  onLogin: (input: { name: string; password: string }) => Promise<void>;
}

export const LoginGate = ({ isLoggingIn, loginError, onLogin }: LoginGateProps) => {
  const credentialsFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      name: params.get("name") || params.get("username") || "user0",
      password: params.get("password") || params.get("pwd") || "",
    };
  }, []);
  const [name, setName] = useState(credentialsFromUrl.name);
  const [password, setPassword] = useState(credentialsFromUrl.password);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="login-shell">
      <form
        className="login-panel"
        onSubmit={(event) => {
          event.preventDefault();
          void onLogin({ name, password });
        }}
      >
        <div className="login-heading">
          <span className="product-name">Image Gen</span>
          <h1>Creator Login</h1>
        </div>

        <label className="field">
          <span>Name</span>
          <input
            autoComplete="username"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Password</span>
          <div className="password-field">
            <input
              autoComplete="current-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              type="button"
              onClick={() => setShowPassword((isVisible) => !isVisible)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        {loginError ? <p className="error-text">{loginError}</p> : null}

        <button className="login-button" type="submit" disabled={isLoggingIn}>
          {isLoggingIn ? "Signing in" : "Sign in"}
        </button>
      </form>
    </main>
  );
};
