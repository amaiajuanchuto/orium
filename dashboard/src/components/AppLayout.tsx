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
            title="Log out"
            aria-label="Log out"
            className="rounded-lg border border-border-3 bg-surface p-2 text-muted hover:bg-surface-2 hover:text-ink"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
