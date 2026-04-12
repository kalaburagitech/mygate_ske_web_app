import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import UserManagement from "./pages/users/UserManagement";
import SiteManagement from "./pages/sites/SiteManagement";
// import PatrolLogs from "./pages/logs/PatrolLogs";
import Patrol from "./pages/points";
import PatrolLogs from "./pages/points/PatrolLogs";
import VisitLogs from "./pages/logs/VisitLogs";
import IssueTracker from "./pages/issues/IssueTracker";
import PatrolPoints from "./pages/points/PatrolPoints";
import Settings from "./pages/settings/Settings";
import OrganizationManagement from "./pages/organizations/OrganizationManagement";
import RegionManagement from "./pages/regions/RegionManagement";
import AttendancePage from "./pages/attendance/AttendancePage";
import Login from "./pages/auth/Login";
import Restricted from "./pages/auth/Restricted";
import AuthHandler from "../components/AuthHandler";
import { useUser, SignedIn, SignedOut } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../services/convex";
import { Toaster } from "sonner";
import { shouldRestrictToPendingUser, userHasRole } from "../lib/userRoles";

const Analytics = () => <Dashboard />;

function ProtectedRoute({
  children,
  permission,
}: {
  children: React.ReactNode;
  permission?: string;
}) {
  const { user, isLoaded } = useUser();
  const currentUser = useQuery(
    api.users.getByClerkId,
    user?.id ? { clerkId: user.id } : "skip"
  );
  const organization = useQuery(
    api.organizations.get,
    currentUser?.organizationId ? { id: currentUser.organizationId, currentOrganizationId: currentUser.organizationId } : "skip"
  );

  if (!isLoaded)
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
        Loading...
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;

  if (currentUser) {
    if ((shouldRestrictToPendingUser(currentUser) || currentUser.status === "inactive" || organization?.status === "inactive") && window.location.pathname !== "/restricted") {
      return <Navigate to="/restricted" replace />;
    }

    if (!shouldRestrictToPendingUser(currentUser) && currentUser.status !== "inactive" && organization?.status !== "inactive" && window.location.pathname === "/restricted") {
      return <Navigate to="/" replace />;
    }

    if (permission) {
      if (userHasRole(currentUser, "Owner")) return <>{children}</>;
      if (permission === "patrolLogs" && organization?.access && !organization.access.patrolling) {
        return <Navigate to="/" replace />;
      }
      if (permission === "visitLogs" && organization?.access && !organization.access.visits) {
        return <Navigate to="/" replace />;
      }
      if (permission === "attendance" && organization?.access && !organization.access.attendance) {
        return <Navigate to="/" replace />;
      }
      const hasPermission = (currentUser.permissions as any)?.[permission];
      if (!hasPermission) return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}

function App() {
  return (
    <div className="dark">
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />

          {/* Protected Routes (Implicitly handled by SignedIn/SignedOut) */}
          <Route
            path="/restricted"
            element={
              <SignedIn>
                <Restricted />
              </SignedIn>
            }
          />

          <Route
            path="*"
            element={
              <>
                <SignedIn>
                  <AuthHandler>
                    <Routes>
                      <Route
                        path="/"
                        element={
                          <ProtectedRoute>
                            <Dashboard />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/dashboard"
                        element={
                          <ProtectedRoute>
                            <Dashboard />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/users"
                        element={
                          <ProtectedRoute permission="users">
                            <UserManagement />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/sites"
                        element={
                          <ProtectedRoute permission="sites">
                            <SiteManagement />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/patrol"
                        element={
                          <ProtectedRoute permission="patrolLogs">
                            <Patrol />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/patrol-logs"
                        element={
                          <ProtectedRoute permission="patrolLogs">
                            <PatrolLogs />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/visit-logs"
                        element={
                          <ProtectedRoute permission="visitLogs">
                            <VisitLogs />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/issues"
                        element={
                          <ProtectedRoute permission="issues">
                            <IssueTracker />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/attendance"
                        element={
                          <ProtectedRoute permission="attendance">
                            <AttendancePage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/patrol-points"
                        element={
                          <ProtectedRoute permission="patrolPoints">
                            <PatrolPoints />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/analytics"
                        element={
                          <ProtectedRoute permission="analytics">
                            <Analytics />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/organizations"
                        element={
                          <ProtectedRoute>
                            <OrganizationManagement />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/regions"
                        element={
                          <ProtectedRoute>
                            <RegionManagement />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/settings"
                        element={
                          <ProtectedRoute>
                            <Settings />
                          </ProtectedRoute>
                        }
                      />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </AuthHandler>
                </SignedIn>
                <SignedOut>
                  <Navigate to="/login" replace />
                </SignedOut>
              </>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors theme="dark" />
    </div>
  );
}

export default App;
