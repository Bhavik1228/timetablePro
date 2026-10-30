import { useState, type FormEvent } from "react";
import { ArrowLeft, CalendarDays, Check } from "lucide-react";
import {
  registerWithEmail,
  requestPasswordReset,
  signInWithEmail,
} from "../services/authService";
import { isFirebaseConfigured } from "../firebase";

type AuthMode = "signin" | "signup";

type AuthPageProps = {
  mode: AuthMode;
};

function friendlyAuthError(cause: unknown): string {
  if (!(cause instanceof Error)) {
    return "Something went wrong. Please try again.";
  }

  const code = "code" in cause && typeof cause.code === "string" ? cause.code : "";
  const messages: Record<string, string> = {
    "auth/email-already-in-use": "An account already exists for this email.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/user-disabled": "This account is currently disabled.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
  };

  return messages[code] ?? cause.message;
}

function AuthPage({ mode }: AuthPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const configured = isFirebaseConfigured();
  const isSignup = mode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!configured) {
      setError("Account sign-in is unavailable until Firebase is configured.");
      return;
    }

    setWorking(true);

    try {
      if (isSignup) {
        await registerWithEmail(email, password, name);
      } else {
        await signInWithEmail(email, password);
      }

      window.location.assign("/app");
    } catch (cause) {
      setError(friendlyAuthError(cause));
      setWorking(false);
    }
  }

  async function resetPassword() {
    setError("");
    setNotice("");

    if (!configured) {
      setError("Password reset is unavailable until Firebase is configured.");
      return;
    }

    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }

    setWorking(true);

    try {
      await requestPasswordReset(email);
      setNotice("If an account exists for this email, a reset link is on its way.");
    } catch (cause) {
      setError(friendlyAuthError(cause));
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="auth-shell">
      <header className="marketing-nav auth-nav">
        <a className="brand" href="/" aria-label="TimeTable Pro home">
          <span className="brand-mark">
            <CalendarDays size={20} strokeWidth={1.8} />
          </span>
          <span>
            timetable<span className="brand-light">pro</span>
          </span>
        </a>
        <a className="text-link auth-back" href="/">
          <ArrowLeft size={15} /> Back to home
        </a>
      </header>

      <section className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">{isSignup ? "YOUR NEXT WEEK STARTS HERE" : "WELCOME BACK"}</p>
          <h1>{isSignup ? "Create your account." : "Sign in to your week."}</h1>
          <p className="auth-intro">
            {isSignup
              ? "Save your timetables and pick up planning wherever you left off."
              : "Your saved timetables are ready when you are."}
          </p>

          {!configured && (
            <div className="auth-config-note" role="status">
              Account access needs Firebase configuration. You can still use the
              planner and save timetables on this device.
            </div>
          )}

          {error && <div className="auth-message error-notice" role="alert">{error}</div>}
          {notice && (
            <div className="auth-message success-notice" role="status">
              <Check size={16} /> {notice}
            </div>
          )}

          <form className="auth-form" onSubmit={submit}>
            {isSignup && (
              <>
                <label className="field-label" htmlFor="account-name">Your name</label>
                <input
                  id="account-name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Name"
                  required
                />
              </>
            )}
            <label className="field-label" htmlFor="account-email">Email address</label>
            <input
              id="account-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
            <label className="field-label" htmlFor="account-password">Password</label>
            <input
              id="account-password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={isSignup ? 6 : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              required
            />
            <button
              className="button button-primary full-width auth-submit"
              type="submit"
              disabled={working || !configured}
            >
              {working
                ? "Please wait…"
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          {!isSignup && (
            <button
              className="auth-reset"
              type="button"
              onClick={resetPassword}
              disabled={working || !configured}
            >
              Forgot your password?
            </button>
          )}

          <p className="auth-switch">
            {isSignup ? "Already have an account?" : "New to TimeTable Pro?"}{" "}
            <a href={isSignup ? "/signin" : "/signup"}>
              {isSignup ? "Sign in" : "Create an account"}
            </a>
          </p>
        </div>
      </section>

      <footer className="marketing-footer">
        <span>TimeTable Pro</span>
        <span>Your week, in better order.</span>
      </footer>
    </main>
  );
}

export default AuthPage;
