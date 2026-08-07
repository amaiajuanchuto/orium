import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { Login } from "./views/Login";
import { Today } from "./views/Today";
import { Journal } from "./views/Journal";
import { Calendar } from "./views/Calendar";
import { Trends } from "./views/Trends";
import { Patterns } from "./views/Patterns";

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="text-muted">
      <h1 className="mb-2 font-heading text-2xl font-semibold text-ink">{name}</h1>
      <p>This view is coming soon.</p>
    </div>
  );
}

export default function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-muted">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<Today />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/patterns" element={<Patterns />} />
        <Route path="/profile" element={<ComingSoon name="Profile" />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
  );
}
