import { Navigate, Outlet } from "react-router-dom";

export default function ProtectedRoute({ user, allowedRoles }) {
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.approval_status !== "approved" || user.active === false) {
    return (
      <Navigate to={user.approval_status === "pending" ? "/pending" : "/unauthorized"} replace />
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
