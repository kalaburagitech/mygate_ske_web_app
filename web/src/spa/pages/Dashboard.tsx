import { Layout } from "../../components/Layout";
import {
  ShieldCheck,
  MapPin,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  Users,
  PlusCircle,
  GraduationCap,
  Sun,
  Moon,
  QrCode,
  Building,
  Car,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useQuery } from "convex/react";
import { api } from "../../services/convex";
import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { userHasRole, userHasAnyRole, ADMIN_ROLES, RESTRICTED_ROLES } from "../../lib/userRoles";
import { SiteSelector } from "../../components/SiteSelector";
import MonitoringDashboard from "./monitoring/MonitoringDashboard";

export default function Dashboard() {
  const { user } = useUser();
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [selectedRegionId, setSelectedRegionId] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("");

  // Fetch real data
  const currentUser = useQuery(api.users.getByClerkId, user?.id ? { clerkId: user.id } : "skip");
  const organizationId = currentUser?.organizationId;
  const regions = useQuery(api.regions.list, organizationId ? { organizationId: (selectedOrgId as any) || organizationId } : "skip");
  const isOwner = userHasRole(currentUser, "Owner");
  const isAdmin = userHasAnyRole(currentUser, ADMIN_ROLES as any);
  const isRestricted = userHasAnyRole(currentUser, RESTRICTED_ROLES as any);
  const isClient = userHasRole(currentUser, "Client");
  const isSO = userHasRole(currentUser, "SO");

  const orgs = useQuery(
    api.organizations.list,
    currentUser?.organizationId ? { currentOrganizationId: currentUser.organizationId } : {}
  );


  const orgIdToUse = (organizationId || selectedOrgId) as Id<"organizations">;
  const siteIdToUse = (selectedSiteId === "all" || !selectedSiteId) ? undefined : (selectedSiteId as Id<"sites">);
  const orgScopedQueryArgs = orgIdToUse
    ? {
        organizationId: orgIdToUse,
        siteId: siteIdToUse,
        regionId: selectedRegionId || undefined,
        city: selectedCity || undefined,
        requestingUserId: currentUser?._id
      }
    : "skip";

  const usersCount = useQuery(
    isOwner ? api.users.countAll : api.users.countByOrg,
    (isOwner ? {} : orgIdToUse ? { 
      organizationId: orgIdToUse, 
      siteId: siteIdToUse,
      regionId: selectedRegionId || undefined,
      city: selectedCity || undefined,
      requestingUserId: currentUser?._id
    } : "skip") as any
  );
  const sitesCount = useQuery(
    isOwner ? api.sites.countAll : api.sites.countByOrg,
    (isOwner ? {} : orgIdToUse ? { 
      organizationId: orgIdToUse,
      regionId: selectedRegionId || undefined,
      city: selectedCity || undefined,
      requestingUserId: currentUser?._id
    } : "skip") as any
  );
  const patrolLogsCount = useQuery(
    api.logs.countPatrolLogsByOrg,
    orgScopedQueryArgs as any
  );
  const openIssuesCount = useQuery(
    api.logs.countIssuesByOrg,
    orgScopedQueryArgs as any
  );
  const issuesList = useQuery(
    api.logs.listIssuesByOrg,
    orgScopedQueryArgs as any
  );
  const visitStats = useQuery(
    api.logs.countVisitLogsByType,
    orgScopedQueryArgs as any
  );
  const pendingAttendanceCount = useQuery(
    api.attendance.countPending,
    orgScopedQueryArgs as any
  );
  const dailyCoverage = useQuery(
    api.logs.getDailyOfficerCoverage,
    (orgIdToUse ? { 
      organizationId: (selectedOrgId as Id<"organizations">) || orgIdToUse,
      requestingUserId: currentUser?._id
    } : "skip") as any
  );

  const attendanceCount = useQuery(
    api.attendance.countByOrg,
    (orgIdToUse ? { 
      organizationId: orgIdToUse, 
      siteId: siteIdToUse,
      regionId: selectedRegionId || undefined,
      requestingUserId: currentUser?._id,
      date: new Date().toISOString().split('T')[0] // Today
    } : "skip") as any
  );

  const dashboardSites = useQuery(
    api.sites.listSitesByOrg,
    (orgIdToUse ? { 
      organizationId: orgIdToUse,
      regionId: selectedRegionId || undefined,
      city: selectedCity || undefined,
      requestingUserId: currentUser?._id
    } : "skip") as any
  );

  if ((isClient || isSO) && !isAdmin) {
    return <MonitoringDashboard userId={currentUser?._id as Id<"users">} />;
  }

  const stats = [
    {
      label: "Active Sites",
      value: sitesCount?.toString() || "0",
      icon: MapPin,
      color: "text-emerald-400",
      trend: sitesCount === undefined ? "Loading..." : "Live",
    },
    {
      label: "Total Users",
      value: usersCount?.toString() || "0",
      icon: Users,
      color: "text-blue-400",
      trend: usersCount === undefined ? "Loading..." : "Active",
    },
    {
      label: "Total Patrols",
      value: patrolLogsCount?.toString() || "0",
      icon: ShieldCheck,
      color: "text-amber-400",
      trend: patrolLogsCount === undefined ? "Loading..." : "Updated",
    },
    {
      label: "Open Issues",
      value: openIssuesCount?.toString() || "0",
      icon: AlertTriangle,
      color: "text-rose-500",
      trend: openIssuesCount === undefined ? "Loading..." : "Critical",
    },
    {
      label: "Attendance Today",
      value: attendanceCount?.toString() || "0",
      icon: Users,
      color: "text-cyan-400",
      trend: attendanceCount === undefined ? "Loading..." : "Live",
    },
    {
      label: "Visitors Today",
      value: visitStats?.visitors?.toString() || "0",
      icon: Users,
      color: "text-indigo-400",
      trend: visitStats === undefined ? "Loading..." : "Live",
    },
    {
      label: "Vehicle Entries",
      value: visitStats?.vehicles?.toString() || "0",
      icon: Car,
      color: "text-orange-400",
      trend: visitStats === undefined ? "Loading..." : "Active",
    },
    {
      label: "Pending Approvals",
      value: pendingAttendanceCount?.toString() || "0",
      icon: ShieldCheck,
      color: "text-pink-400",
      trend: Number(pendingAttendanceCount) > 0 ? "Requires Action" : "All Clear",
    },
  ];

  return (
    <Layout title="Command Center Overview">
      <div className="space-y-8">
        {/* Organization Selector (for Drill-down) */}
        {(isAdmin || isOwner) && (
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl">
            <div className="flex items-center gap-2 min-w-fit">
              <Building className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-muted-foreground mr-2">Organization:</span>
            </div>
            <div className="flex-1 max-w-sm">
              <select
                value={selectedOrgId || organizationId || ""}
                onChange={(e) => {
                  setSelectedOrgId(e.target.value);
                  setSelectedSiteId("all");
                  setSelectedRegionId("");
                  setSelectedCity("");
                }}
                className="w-full h-10 px-4 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {!organizationId && <option value="" className="bg-[#1a1c20]">Select Organization</option>}
                {orgs?.map((org) => (
                  <option key={org._id} value={org._id} className="bg-[#1a1c20]">
                    {org.name} {org._id === organizationId ? "(Primary)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-[10px] text-muted-foreground italic lg:ml-auto">
              Drill down into sub-organizations to filter reports and site coverage.
            </div>
          </div>
        )}

        {/* Region & City Filter Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl relative z-[100]">
          <div className="flex items-center gap-2 min-w-fit">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-muted-foreground mr-2">Region:</span>
          </div>
          <div className="flex-1 max-w-sm">
            <select
              value={selectedRegionId}
              onChange={(e) => {
                setSelectedRegionId(e.target.value);
                setSelectedCity("");
                setSelectedSiteId("all");
              }}
              className="w-full h-10 px-4 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="" className="bg-[#1a1c20]">All Regions</option>
              {regions?.map((r: any) => (
                <option key={r._id} value={r.regionId} className="bg-[#1a1c20]">
                  {r.regionName} ({r.regionId})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 min-w-fit">
            <span className="text-sm font-semibold text-muted-foreground mr-2 lg:ml-4">City:</span>
          </div>
          <div className="flex-1 max-w-sm">
            <select
              disabled={!selectedRegionId}
              value={selectedCity}
              onChange={(e) => {
                setSelectedCity(e.target.value);
                setSelectedSiteId("all");
              }}
              className="w-full h-10 px-4 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
            >
              <option value="" className="bg-[#1a1c20]">All Cities</option>
              {regions?.find((r: any) => r.regionId === selectedRegionId)?.cities?.map((city: string) => (
                <option key={city} value={city} className="bg-[#1a1c20]">
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 min-w-fit">
            <span className="text-sm font-semibold text-muted-foreground mr-2 lg:ml-4">Site:</span>
          </div>
          <div className="flex-1 max-w-sm">
            <SiteSelector
              organizationId={orgIdToUse}
              selectedSiteId={selectedSiteId}
              onSiteChange={setSelectedSiteId}
              regionId={selectedRegionId}
              city={selectedCity}
              requestingUserId={currentUser?._id}
            />
          </div>
        </div>

        {/* Filter bar removed as requested */}

        {/* Quick Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl">
          <span className="text-sm font-semibold text-muted-foreground ml-2">Quick Actions:</span>
          <div className="flex flex-wrap gap-3">
            <a
              href="/users"
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-sm font-semibold hover:bg-primary/20 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              Add New User
            </a>
            <a
              href="/sites"
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl text-sm font-semibold hover:bg-emerald-500/20 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              Add New Site
            </a>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="glass p-4 sm:p-6 rounded-2xl border border-white/10 hover:border-primary/50 transition-all group relative overflow-hidden"
            >
              <div className="absolute -right-4 -top-4 w-16 h-16 sm:w-24 sm:h-24 bg-primary/5 rounded-full blur-2xl sm:blur-3xl group-hover:bg-primary/10 transition-colors" />

              <div className="flex justify-between items-start relative z-10">
                <div className={cn("p-1.5 sm:p-2 rounded-xl bg-white/5", stat.color)}>
                  <stat.icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-[10px] text-muted-foreground font-medium">
                  {stat.trend}
                  <TrendingUp className="w-3 h-3 text-primary" />
                </div>
              </div>

              <div className="mt-3 sm:mt-4 relative z-10">
                <p className="text-[10px] sm:text-sm font-medium text-muted-foreground">{stat.label}</p>
                <div className="flex items-baseline gap-2 mt-0.5 sm:mt-1">
                  <h3 className="text-xl sm:text-3xl font-bold text-white tracking-tight">{stat.value}</h3>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Specialized Visits Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="glass p-4 rounded-2xl border border-white/10 hover:border-primary/30 transition-all flex items-center gap-4">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Trainer Visits</p>
              <h4 className="text-xl font-bold text-white">{visitStats?.trainer || 0}</h4>
            </div>
          </div>
          <div className="glass p-4 rounded-2xl border border-white/10 hover:border-amber-400/30 transition-all flex items-center gap-4">
            <div className="p-2 rounded-xl bg-amber-400/10 text-amber-400">
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Day Checks</p>
              <h4 className="text-xl font-bold text-white">{visitStats?.dayCheck || 0}</h4>
            </div>
          </div>
          <div className="glass p-4 rounded-2xl border border-white/10 hover:border-indigo-400/30 transition-all flex items-center gap-4">
            <div className="p-2 rounded-xl bg-indigo-400/10 text-indigo-400">
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Night Checks</p>
              <h4 className="text-xl font-bold text-white">{visitStats?.nightCheck || 0}</h4>
            </div>
          </div>
          <div className="glass p-4 rounded-2xl border border-white/10 hover:border-emerald-400/30 transition-all flex items-center gap-4">
            <div className="p-2 rounded-xl bg-emerald-400/10 text-emerald-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">All Visits</p>
              <h4 className="text-xl font-bold text-white">{visitStats?.total || 0}</h4>
            </div>
          </div>
        </div>

        {/* Sites Overview & Recent Alerts Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 pb-8">
          {/* Daily Site Coverage */}
          <div className="glass p-6 rounded-3xl border border-white/10 overflow-hidden flex flex-col h-[500px]">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Daily Site Coverage</h3>
                  <p className="text-xs text-muted-foreground">Sites visited by officers today</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <div className="space-y-4">
                {dailyCoverage?.map((item: any) => (
                  <div key={item.userId} className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                          {item.userName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{item.userName}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">{item.userRole}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-primary">{item.siteCount} Sites</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Covered Today</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.sites.map((site: string, idx: number) => (
                        <span key={idx} className="px-2 py-1 rounded-lg bg-white/5 text-[10px] text-muted-foreground border border-white/5">
                          {site}
                        </span>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">Last visit at {new Date(item.lastVisit).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                ))}
                {(!dailyCoverage || dailyCoverage.length === 0) && (
                  <div className="h-40 flex flex-col items-center justify-center text-center">
                    <MapPin className="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No visits recorded today</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sites Overview */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 lg:p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-400/10 rounded-xl">
                  <MapPin className="w-5 h-5 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">Sites Overview</h2>
              </div>
              <span className="px-3 py-1 bg-emerald-400/10 text-emerald-400 text-xs font-medium rounded-full border border-emerald-400/20">
                {dashboardSites?.length || 0} Total
              </span>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {!dashboardSites ? (
                Array(3).fill(0).map((_, i) => (
                  <div key={i} className="h-20 bg-white/5 border border-white/10 rounded-xl animate-pulse" />
                ))
              ) : dashboardSites.length === 0 ? (
                <div className="text-center py-12 bg-white/5 border border-white/5 rounded-2xl">
                  <MapPin className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">No sites found for this selection</p>
                </div>
              ) : (
                dashboardSites.map((site: any) => (
                  <button
                    key={site._id}
                    onClick={() => setSelectedSiteId(site._id)}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-xl border transition-all duration-300 group",
                      selectedSiteId === site._id
                        ? "bg-primary/20 border-primary shadow-[0_0_20px_rgba(59,130,246,0.1)]"
                        : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                    )}
                  >
                    <div className="flex items-center gap-4 text-left">
                      <div className={cn(
                        "p-2 rounded-lg transition-colors",
                        selectedSiteId === site._id ? "bg-primary text-white" : "bg-white/5 text-muted-foreground group-hover:text-primary"
                      )}>
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white group-hover:text-primary transition-colors line-clamp-1">
                          {site.name}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {site.regionId}: {site.city}
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className={cn(
                      "w-4 h-4 transition-all",
                      selectedSiteId === site._id ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"
                    )} />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Recent Alerts (Issues) */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 lg:p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-500/10 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">Recent Alerts</h2>
              </div>
              <a href="/logs" className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
                View All
              </a>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {!issuesList ? (
                Array(3).fill(0).map((_, i) => (
                  <div key={i} className="h-20 bg-white/5 border border-white/10 rounded-xl animate-pulse" />
                ))
              ) : issuesList.filter((i: any) => i.status === "open").length === 0 ? (
                <div className="text-center py-12 bg-white/5 border border-white/5 rounded-2xl">
                  <ShieldCheck className="w-12 h-12 text-emerald-400/20 mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">All systems clear</p>
                </div>
              ) : (
                issuesList.filter((i: any) => i.status === "open").map((issue: any) => (
                  <div
                    key={issue._id}
                    className="flex flex-col gap-3 p-4 bg-white/5 border border-white/10 rounded-xl transition-all hover:bg-white/10 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 text-[10px] font-bold rounded-full border",
                          issue.priority === "High" ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                          issue.priority === "Medium" ? "bg-amber-400/10 text-amber-400 border-amber-400/20" :
                          "bg-blue-400/10 text-blue-400 border-blue-400/20"
                        )}>
                          {issue.priority}
                        </span>
                        <span className="text-xs font-bold text-white group-hover:text-primary transition-colors line-clamp-1">
                          {issue.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
                        {new Date(issue.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col min-w-0">
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {issue.description}
                        </p>
                        <span className="text-[10px] text-primary/60 font-medium mt-1 uppercase tracking-wider">
                          {issue.siteName}
                        </span>
                      </div>
                      <TrendingUp className="w-4 h-4 text-rose-500/30 group-hover:text-rose-500 transition-colors" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
