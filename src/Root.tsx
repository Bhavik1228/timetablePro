import { lazy, Suspense } from "react";
import HomePage from "./pages/HomePage";

const App = lazy(() => import("./App"));
const AuthPage = lazy(() => import("./pages/AuthPage"));

function Root() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/app") {
    return (
      <Suspense fallback={<div className="route-loading" role="status">Opening your planner…</div>}>
        <App />
      </Suspense>
    );
  }

  if (path === "/signin" || path === "/signup") {
    return (
      <Suspense fallback={<div className="route-loading" role="status">Opening your account…</div>}>
        <AuthPage mode={path === "/signup" ? "signup" : "signin"} />
      </Suspense>
    );
  }

  return <HomePage />;
}

export default Root;
