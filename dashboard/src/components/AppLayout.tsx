import { Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <main className="mx-auto w-full max-w-[1180px] px-10 py-9">
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => void signOut()}
            className="rounded-lg border border-border-3 bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-ink"
          >
            Log out
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
