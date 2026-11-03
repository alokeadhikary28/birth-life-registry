import { BrowserRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../../components/ProtectedRoute";

function Page({ title }) {
  return <h1>{title}</h1>;
}

export default function App({ user }) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Page title="Login" />} />
        <Route path="/pending" element={<Page title="Account pending approval" />} />
        <Route path="/unauthorized" element={<Page title="Unauthorized" />} />

        <Route element={<ProtectedRoute user={user} allowedRoles={["super_admin"]} />}>
          <Route path="/super-admin/*" element={<Page title="Super Admin area" />} />
        </Route>

        <Route element={<ProtectedRoute user={user} allowedRoles={["admin"]} />}>
          <Route path="/admin/*" element={<Page title="Admin area" />} />
        </Route>

        <Route element={<ProtectedRoute user={user} allowedRoles={["uno"]} />}>
          <Route path="/uno/*" element={<Page title="UNO area" />} />
        </Route>

        <Route element={<ProtectedRoute user={user} allowedRoles={["health_worker"]} />}>
          <Route path="/health-worker/*" element={<Page title="Health Worker area" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
