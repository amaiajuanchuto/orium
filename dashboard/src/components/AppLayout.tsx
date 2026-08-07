import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <main className="mx-auto w-full max-w-[1180px] px-10 py-9">
        <Outlet />
      </main>
    </div>
  );
}
