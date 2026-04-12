"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layout } from "../../../components/Layout";
import {
  User,
  Building2,
  Shield,
  History,
  Loader2,
  LogOut,
  Save,
  Mail,
  Phone,
  BadgeCheck,
  Monitor,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useUser, useClerk, UserButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../services/convex";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getUserRoles, userHasRole } from "../../../lib/userRoles";

type SettingsTab = "profile" | "organization" | "security" | "activity";

function shortBrowserLabel(ua?: string | null): string {
  if (!ua) return "Unknown browser";
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Edg")) return "Edge";
  return ua.slice(0, 48) + (ua.length > 48 ? "…" : "");
}

function formatLoginTime(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function Settings() {
  const { user, isLoaded: clerkLoaded } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const currentUser = useQuery(
    api.users.getByClerkId,
    user?.id ? { clerkId: user.id } : "skip"
  );

  const organization = useQuery(
    api.organizations.get,
    currentUser?.organizationId
      ? {
          id: currentUser.organizationId,
          currentOrganizationId: currentUser.organizationId,
        }
      : "skip"
  );

  const parentOrg = useQuery(
    api.organizations.get,
    organization?.parentOrganizationId && currentUser?.organizationId
      ? {
          id: organization.parentOrganizationId,
          currentOrganizationId: currentUser.organizationId,
        }
      : "skip"
  );

  const regions = useQuery(api.regions.list, {});

  const loginHistory = useQuery(
    api.loginLogs.listRecentByUser,
    currentUser?._id ? { userId: currentUser._id, limit: 30 } : "skip"
  );

  const updateSelfProfile = useMutation(api.users.updateSelfProfile);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name ?? "");
      setMobile(currentUser.mobileNumber ?? "");
    }
  }, [currentUser?._id, currentUser?.name, currentUser?.mobileNumber]);

  const regionLabel = useMemo(() => {
    if (!currentUser?.regionId) return null;
    const r = regions?.find((x: { regionId: string }) => x.regionId === currentUser.regionId);
    return r ? `${r.regionName} (${r.regionId})` : currentUser.regionId;
  }, [currentUser?.regionId, regions]);

  const emailPrimary = user?.primaryEmailAddress?.emailAddress ?? currentUser?.email ?? "";

  const handleSaveProfile = useCallback(async () => {
    if (!user?.id) {
      toast.error("You are not signed in.");
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Please enter your full name (at least 2 characters).");
      return;
    }
    setSaving(true);
    try {
      await updateSelfProfile({
        clerkId: user.id,
        name: trimmed,
        mobileNumber: mobile.trim(),
      });
      toast.success("Profile saved successfully.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save your profile.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [user?.id, name, mobile, updateSelfProfile]);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      try {
        localStorage.removeItem("auth_token");
      } catch {
        /* ignore */
      }
      await signOut();
      navigate("/login", { replace: true });
      toast.success("Signed out.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign out failed.";
      toast.error(message);
    } finally {
      setSigningOut(false);
    }
  }, [navigate, signOut]);

  const tabs: { id: SettingsTab; label: string; icon: typeof User }[] = [
    { id: "profile", label: "Profile", icon: User },
    { id: "organization", label: "Organization", icon: Building2 },
    { id: "security", label: "Security", icon: Shield },
    { id: "activity", label: "Sign-in activity", icon: History },
  ];

  const loading =
    !clerkLoaded ||
    (user?.id && (currentUser === undefined || regions === undefined));

  if (!clerkLoaded) {
    return (
      <Layout title="Settings">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout title="Settings">
        <div className="mx-auto max-w-md rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
          <p className="text-sm text-white/90">You need to sign in to view settings.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Settings">
      <div className="mx-auto max-w-6xl space-y-8 pb-16">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-primary/15 via-white/[0.04] to-transparent p-8 md:p-10">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                {user.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt=""
                    className="h-20 w-20 rounded-2xl border border-white/10 object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                    <User className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/20">
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />
                </span>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {currentUser?.name || user.fullName || user.username || "Your account"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {emailPrimary || "No email on file"}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {currentUser && (
                    <>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-0.5 text-xs font-semibold text-white/80">
                        {getUserRoles(currentUser).join(" · ") || "—"}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wider",
                          currentUser.status === "active"
                            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
                        )}
                      >
                        {currentUser.status}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex justify-start sm:justify-end">
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "h-10 w-10 rounded-xl",
                    },
                  }}
                  afterSignOutUrl="/login"
                />
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-200 disabled:opacity-50"
              >
                {signingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Sign out
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!loading && !currentUser && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
            <p className="text-sm text-amber-200/90">
              Your sign-in is active, but your workspace profile is still syncing. Refresh the page in a moment, or contact an administrator if this persists.
            </p>
          </div>
        )}

        {!loading && currentUser && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <aside className="lg:col-span-3">
              <nav className="flex flex-row gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-all",
                      activeTab === item.id
                        ? "border border-primary/25 bg-primary/15 text-primary shadow-[0_4px_24px_rgba(37,99,235,0.12)]"
                        : "border border-transparent text-muted-foreground hover:border-white/5 hover:bg-white/[0.03] hover:text-white"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                    <ChevronRight
                      className={cn(
                        "ml-auto hidden h-4 w-4 opacity-50 lg:block",
                        activeTab === item.id && "text-primary opacity-100"
                      )}
                    />
                  </button>
                ))}
              </nav>
            </aside>

            <div className="space-y-6 lg:col-span-9">
              {activeTab === "profile" && (
                <>
                  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
                    <h2 className="text-lg font-bold text-white">Profile details</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Name and phone are stored in your workspace. Email and password are managed by your sign-in provider (use the account menu above).
                    </p>

                    <div className="mt-8 grid gap-6 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <label htmlFor="settings-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Full name <span className="text-rose-400">*</span>
                        </label>
                        <input
                          id="settings-name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          autoComplete="name"
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                          placeholder="Your full name"
                        />
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="settings-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Email
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            id="settings-email"
                            type="email"
                            value={emailPrimary}
                            readOnly
                            className="w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-10 pr-4 text-sm text-muted-foreground"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">Read-only. Change it from your account menu (Clerk).</p>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="settings-phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Mobile number
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            id="settings-phone"
                            type="tel"
                            value={mobile}
                            onChange={(e) => setMobile(e.target.value)}
                            autoComplete="tel"
                            className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                            placeholder="+91 …"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">Optional. Digits, spaces, + ( ) . - only. Leave blank to clear.</p>
                      </div>

                      {(regionLabel || (currentUser.cities && currentUser.cities.length > 0)) && (
                        <div className="md:col-span-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignment</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/85">
                            {regionLabel && (
                              <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-1">
                                Region: {regionLabel}
                              </span>
                            )}
                            {currentUser.cities && currentUser.cities.length > 0 && (
                              <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-1">
                                Cities: {currentUser.cities.join(", ")}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Region and cities are assigned by an administrator in User Management.
                          </p>
                        </div>
                      )}

                      <div className="md:col-span-2 flex flex-col gap-3 border-t border-white/5 pt-6 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setName(currentUser.name ?? "");
                            setMobile(currentUser.mobileNumber ?? "");
                            toast.info("Reverted to your saved profile.");
                          }}
                          className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          disabled={saving}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save changes
                        </button>
                      </div>
                    </div>
                  </section>

                  {!userHasRole(currentUser, "Owner") && currentUser.permissions && (
                    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
                      <h2 className="text-lg font-bold text-white">Dashboard permissions</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Controlled by your role. Contact an administrator to change access.
                      </p>
                      <div className="mt-6 flex flex-wrap gap-2">
                        {(
                          [
                            ["users", "Users"],
                            ["sites", "Sites"],
                            ["patrolPoints", "Patrol points"],
                            ["patrolLogs", "Patrol reports"],
                            ["visitLogs", "Visits"],
                            ["issues", "Issues"],
                            ["analytics", "Analytics"],
                            ["attendance", "Attendance"],
                          ] as const
                        ).map(([key, label]) => {
                          const allowed = (currentUser.permissions as Record<string, boolean | undefined>)[key];
                          return (
                            <span
                              key={key}
                              className={cn(
                                "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                                allowed
                                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                  : "border-white/10 bg-white/[0.03] text-muted-foreground"
                              )}
                            >
                              {label}: {allowed ? "Yes" : "No"}
                            </span>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {userHasRole(currentUser, "Owner") && (
                    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
                      <h2 className="text-lg font-bold text-white">Dashboard permissions</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Owner accounts have full access to all modules.
                      </p>
                    </section>
                  )}

                  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
                    <h2 className="text-lg font-bold text-white">Account identifiers</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Useful for support requests.</p>
                    <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">Workspace user ID</dt>
                        <dd className="mt-1 font-mono text-xs text-white/80 break-all">{currentUser._id}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">Sign-in ID (Clerk)</dt>
                        <dd className="mt-1 font-mono text-xs text-white/80 break-all">{user.id}</dd>
                      </div>
                    </dl>
                  </section>
                </>
              )}

              {activeTab === "organization" && organization && (
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
                  <h2 className="text-lg font-bold text-white">Your organization</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Read-only overview of the organization linked to your account.
                  </p>

                  <div className="mt-8 space-y-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-2xl font-bold text-white">{organization.name}</p>
                        {parentOrg && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Under main org: <span className="text-white/80">{parentOrg.name}</span>
                          </p>
                        )}
                        {!organization.parentOrganizationId && (
                          <p className="mt-1 text-xs text-muted-foreground">Main organization</p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider",
                          organization.status === "active"
                            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
                        )}
                      >
                        {organization.status}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Module access</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[
                          { key: "patrolling", label: "Patrolling" },
                          { key: "visits", label: "Visits" },
                          { key: "attendance", label: "Attendance" },
                        ].map(({ key, label }) => {
                          const on = (organization.access as Record<string, boolean>)[key];
                          return (
                            <span
                              key={key}
                              className={cn(
                                "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                                on
                                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                  : "border-white/10 bg-white/[0.03] text-muted-foreground"
                              )}
                            >
                              {label}: {on ? "On" : "Off"}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === "organization" && !organization && (
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-muted-foreground">
                  No organization is linked to your profile yet.
                </section>
              )}

              {activeTab === "security" && (
                <section className="space-y-6">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
                    <h2 className="text-lg font-bold text-white">Security</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Password, two-factor authentication, and connected accounts are managed by your sign-in provider.
                    </p>
                    <div className="mt-6 flex flex-wrap items-center gap-4">
                      <UserButton afterSignOutUrl="/login" />
                      <p className="text-sm text-muted-foreground">
                        Open <strong className="text-white/90">Manage account</strong> to update password and security options.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
                    <div className="flex items-center gap-3">
                      <Monitor className="h-5 w-5 text-primary" />
                      <h3 className="text-base font-bold text-white">This device</h3>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {typeof navigator !== "undefined" ? shortBrowserLabel(navigator.userAgent) : "Browser"}{" "}
                      · {typeof navigator !== "undefined" && navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-6 md:p-8">
                    <h3 className="text-base font-bold text-rose-200">Sign out</h3>
                    <p className="mt-1 text-sm text-rose-200/70">
                      Ends your session on this browser. You will need to sign in again to use the dashboard.
                    </p>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={signingOut}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rose-600 disabled:opacity-50"
                    >
                      {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      Sign out everywhere on this device
                    </button>
                  </div>
                </section>
              )}

              {activeTab === "activity" && (
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
                  <h2 className="text-lg font-bold text-white">Sign-in activity</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Recent successful sign-ins recorded for your workspace account (newest first).
                  </p>

                  <div className="mt-6 overflow-x-auto rounded-xl border border-white/5">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.03]">
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Time
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Status
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Browser / device
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {loginHistory === undefined && (
                          <tr>
                            <td colSpan={3} className="px-4 py-12 text-center text-muted-foreground">
                              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                            </td>
                          </tr>
                        )}
                        {loginHistory?.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-12 text-center text-muted-foreground">
                              No sign-in history yet. History appears after your next successful login.
                            </td>
                          </tr>
                        )}
                        {loginHistory?.map((row: { _id: string; loginTime?: number; loginStatus: string; browserInfo?: string }) => (
                          <tr key={row._id} className="hover:bg-white/[0.02]">
                            <td className="whitespace-nowrap px-4 py-3 text-white/90">{formatLoginTime(row.loginTime)}</td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-xs font-bold uppercase",
                                  row.loginStatus === "success" && "bg-emerald-500/15 text-emerald-400",
                                  row.loginStatus === "failed" && "bg-rose-500/15 text-rose-400",
                                  row.loginStatus === "logout" && "bg-white/10 text-muted-foreground"
                                )}
                              >
                                {row.loginStatus}
                              </span>
                            </td>
                            <td className="max-w-[280px] truncate px-4 py-3 text-muted-foreground" title={row.browserInfo ?? ""}>
                              {shortBrowserLabel(row.browserInfo)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
