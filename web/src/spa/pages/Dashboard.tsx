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
  FileText,
  ImageIcon,
  Clock,
  ExternalLink,
  ChevronRight,
  Camera,
  CalendarDays,
  Activity,
  Grid3X3,
  CalendarCheck,
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

  const coverageMatrix = useQuery(
    api.logs.getMonthlySiteCoverageMatrix,
    orgIdToUse ? {
        organizationId: orgIdToUse,
        regionId: selectedRegionId || undefined,
        requestingUserId: currentUser?._id
    } : "skip"
  );

  const teamStats = useQuery(
    api.logs.getVisitingTeamStats,
    orgIdToUse ? {
        organizationId: orgIdToUse,
        regionId: selectedRegionId || undefined,
        requestingUserId: currentUser?._id
    } : "skip"
  );

  const activityStream = useQuery(
    api.logs.listOperationalActivityStream,
    orgIdToUse ? { 
        organizationId: orgIdToUse,
        requestingUserId: currentUser?._id,
        limit: 10
    } : "skip"
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

  const operationalStats = [
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
      label: "Attendance Today",
      value: attendanceCount?.toString() || "0",
      icon: Users,
      color: "text-cyan-400",
      trend: attendanceCount === undefined ? "Loading..." : "Live",
    },
  ];

  const visitorStats = [
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
    {
      label: "Open Issues",
      value: openIssuesCount?.toString() || "0",
      icon: AlertTriangle,
      color: "text-rose-500",
      trend: openIssuesCount === undefined ? "Loading..." : "Critical",
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

        {/* Operational Hub & Stats */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-black uppercase tracking-widest text-white/70">Operational Hub (Staff & Security)</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {operationalStats.map((stat) => (
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
        </div>

        {/* Gate & Visitor Management */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-black uppercase tracking-widest text-white/70">Gate & Visitor Activity</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {visitorStats.map((stat) => (
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
        </div>

        {/* Specialized Officer Visits Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-black uppercase tracking-widest text-white/70">Internal Officer Site-Visits</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <a href="/officer-visits" className="glass p-4 rounded-2xl border border-white/10 hover:border-primary/50 hover:bg-white/[0.05] transition-all flex items-center gap-4 group">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Trainer Visits</p>
                <h4 className="text-xl font-bold text-white">{visitStats?.trainer || 0}</h4>
              </div>
            </a>
            <a href="/officer-visits" className="glass p-4 rounded-2xl border border-white/10 hover:border-amber-400/50 hover:bg-white/[0.05] transition-all flex items-center gap-4 group">
              <div className="p-2 rounded-xl bg-amber-400/10 text-amber-400 group-hover:bg-amber-400 group-hover:text-white transition-colors">
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Day Checks</p>
                <h4 className="text-xl font-bold text-white">{visitStats?.dayCheck || 0}</h4>
              </div>
            </a>
            <a href="/officer-visits" className="glass p-4 rounded-2xl border border-white/10 hover:border-indigo-400/50 hover:bg-white/[0.05] transition-all flex items-center gap-4 group">
              <div className="p-2 rounded-xl bg-indigo-400/10 text-indigo-400 group-hover:bg-indigo-400 group-hover:text-white transition-colors">
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Night Checks</p>
                <h4 className="text-xl font-bold text-white">{visitStats?.nightCheck || 0}</h4>
              </div>
            </a>
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
                      {item.visitTypes?.map((vt: string, idx: number) => {
                        const isOperational = ['SiteCheckDay', 'SiteCheckNight', 'Trainer'].includes(vt);
                        if (!isOperational) return null;
                        return (
                          <span key={`vt-${idx}`} className={cn(
                            "px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border tracking-tighter",
                            vt === 'SiteCheckDay' ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                            vt === 'SiteCheckNight' ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" :
                            vt === 'Trainer' ? "bg-rose-500/20 text-rose-400 border-rose-500/30" :
                            "bg-white/10 text-white/40 border-white/10"
                          )}>
                            {vt.replace('SiteCheck', '')}
                          </span>
                        );
                      })}
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

        {/* Monthly Site Coverage Audit Matrix */}
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                        <CalendarCheck className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Monthly Site Coverage Audit</h2>
                        <p className="text-sm font-bold text-white/40 uppercase tracking-widest">30-Day Operational Health Matrix</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 bg-white/5 p-2 rounded-2xl border border-white/10">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="text-[9px] font-black text-amber-400 uppercase">Day</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                        <div className="w-2 h-2 rounded-full bg-indigo-400" />
                        <span className="text-[9px] font-black text-indigo-400 uppercase">Night</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20">
                        <div className="w-2 h-2 rounded-full bg-rose-400" />
                        <span className="text-[9px] font-black text-rose-400 uppercase">Trainer</span>
                    </div>
                </div>
            </div>

            <div className="glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl bg-white/[0.01]">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.03]">
                                <th className="sticky left-0 z-10 px-8 py-5 text-[11px] font-black uppercase tracking-widest text-white/40 bg-[#0a0a0a]/90 backdrop-blur-md min-w-[280px]">Site/Facility</th>
                                {coverageMatrix?.dayKeys.map((day: any, idx: number) => (
                                    <th key={idx} className={cn(
                                        "px-2 py-5 text-center min-w-[36px]",
                                        day.isToday ? "bg-primary/10" : ""
                                    )}>
                                        <p className="text-[9px] font-black text-white/20 uppercase leading-none mb-1">{day.isToday ? "TOD" : ""}</p>
                                        <p className={cn(
                                            "text-xs font-black",
                                            day.isToday ? "text-primary" : "text-white/40"
                                        )}>{day.dayNum}</p>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {coverageMatrix ? (
                                coverageMatrix.matrix.length > 0 ? (
                                    coverageMatrix.matrix.map((site: any) => (
                                        <tr key={site._id} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="sticky left-0 z-10 px-8 py-6 bg-[#0a0a0a]/90 backdrop-blur-md group-hover:bg-white/[0.02]">
                                                <p className="text-sm font-black text-white uppercase tracking-tight truncate">{site.name}</p>
                                                <p className="text-[10px] font-bold text-white/30 uppercase mt-0.5">{site.regionId || "-"} • {site.city || "-"}</p>
                                            </td>
                                            {site.dailyData.map((day: any, idx: number) => (
                                                <td key={idx} className={cn(
                                                    "p-1 text-center",
                                                    day.isToday ? "bg-primary/[0.02]" : ""
                                                )}>
                                                    <div className="flex flex-col items-center justify-center gap-0.5 min-h-[44px]">
                                                        {day.types.length > 0 ? (
                                                            day.types.map((type: string) => (
                                                                <div 
                                                                    key={type}
                                                                    className={cn(
                                                                        "w-full h-1.5 rounded-full",
                                                                        type === 'SiteCheckDay' ? "bg-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.3)]" :
                                                                        type === 'SiteCheckNight' ? "bg-indigo-500/80 shadow-[0_0_8px_rgba(99,102,241,0.3)]" :
                                                                        type === 'Trainer' ? "bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.3)]" :
                                                                        "bg-white/20"
                                                                    )} 
                                                                    title={type}
                                                                />
                                                            ))
                                                        ) : (
                                                            <div className="w-1.5 h-1.5 rounded-full bg-white/[0.05]" />
                                                        )}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={32} className="py-20 text-center">
                                            <Grid3X3 className="w-12 h-12 text-white/10 mx-auto mb-4" />
                                            <p className="text-sm text-white/40 font-black uppercase tracking-widest">No site data available for matrix display</p>
                                        </td>
                                    </tr>
                                )
                            ) : (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i}>
                                        <td className="p-8"><div className="h-6 bg-white/5 rounded-xl animate-pulse" /></td>
                                        <td colSpan={30} className="p-8"><div className="h-6 bg-white/5 rounded-xl animate-pulse" /></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Visiting Team Performance Report */}
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                        <Activity className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Visiting Team Performance</h2>
                        <p className="text-sm font-bold text-white/40 uppercase tracking-widest">7-Day Activity Pulse & 30-Day Reporting</p>
                    </div>
                </div>
            </div>

            <div className="glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl bg-white/[0.01]">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.03]">
                                <th className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-white/40">Officer Profile</th>
                                <th className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-white/40 text-center">Last 7 Days Activity Pulse</th>
                                <th className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-white/40 text-right">30D Performance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {teamStats ? (
                                teamStats.length > 0 ? (
                                    teamStats.map((officer: any) => (
                                        <tr key={officer._id} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-lg font-black text-blue-400 shadow-inner">
                                                        {officer.name[0]}
                                                    </div>
                                                    <div>
                                                        <p className="text-base font-black text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">{officer.name}</p>
                                                        <div className="flex gap-1.5 mt-1">
                                                            {officer.roles.slice(0, 2).map((role: string) => (
                                                                <span key={role} className="text-[9px] font-bold text-white/30 uppercase border border-white/10 px-1.5 py-0.5 rounded-md">
                                                                    {role}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="flex items-center justify-center gap-3">
                                                    {officer.weekCounts.map((count: number, idx: number) => {
                                                        const days = ['S','M','T','W','T','F','S']; // Simplified for pulse
                                                        const dayLabels = Array.from({length: 7}, (_, i) => {
                                                            const d = new Date();
                                                            d.setDate(d.getDate() - (6 - i));
                                                            return d.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
                                                        });

                                                        return (
                                                            <div key={idx} className="flex flex-col items-center gap-2">
                                                                <span className="text-[9px] font-black text-white/20 uppercase">{dayLabels[idx]}</span>
                                                                <div className={cn(
                                                                    "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border transition-all",
                                                                    count > 0 
                                                                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]" 
                                                                        : "bg-white/5 border-white/10 text-white/10"
                                                                )}>
                                                                    {count > 0 ? count : "-"}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl">
                                                        <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest text-center leading-none mb-1">Visits</p>
                                                        <p className="text-xl font-black text-white text-center leading-none">{officer.visits30}</p>
                                                    </div>
                                                    <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                                                        <p className="text-[9px] font-bold text-blue-400/50 uppercase tracking-widest text-center leading-none mb-1">Hours On-Site</p>
                                                        <p className="text-xl font-black text-blue-400 text-center leading-none">{officer.duration30Label}</p>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={3} className="py-20 text-center">
                                            <CalendarDays className="w-12 h-12 text-white/10 mx-auto mb-4" />
                                            <p className="text-sm text-white/40 font-black uppercase tracking-widest">No visiting officers reported in this period</p>
                                        </td>
                                    </tr>
                                )
                            ) : (
                                Array(3).fill(0).map((_, i) => (
                                    <tr key={i}>
                                        <td colSpan={3} className="p-8"><div className="h-16 bg-white/5 rounded-2xl animate-pulse" /></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Master Operational Activity Stream */}
        <div className="space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-2xl border border-primary/20">
                        <FileText className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Live Operational Stream</h2>
                        <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Real-time inspection logs & photographic proof</p>
                    </div>
                </div>
                <a 
                    href="/officer-visits" 
                    className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-xs font-black text-white/60 hover:text-white hover:bg-primary hover:border-primary transition-all uppercase tracking-widest group"
                >
                    View Full Audit History
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </a>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {activityStream ? (
                    activityStream.length > 0 ? (
                        activityStream.map((log: any) => (
                            <div 
                                key={log._id} 
                                className={cn(
                                    "group relative rounded-[2.5rem] border p-8 hover:bg-white/[0.04] transition-all overflow-hidden shadow-2xl",
                                    log.visitType === 'SiteCheckDay' ? "border-amber-500/10 bg-amber-500/[0.01]" :
                                    log.visitType === 'SiteCheckNight' ? "border-indigo-500/10 bg-indigo-500/[0.01]" :
                                    log.visitType === 'Trainer' ? "border-rose-500/10 bg-rose-500/[0.01]" :
                                    "border-white/10 bg-white/[0.02]"
                                )}
                            >
                                <div className="relative grid gap-6 sm:grid-cols-12">
                                     {/* Card Info */}
                                     <div className="sm:col-span-8 space-y-4">
                                         <div className="flex items-center justify-between">
                                             <div className="flex items-center gap-3">
                                                 <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-black text-white">
                                                    {log.userName ? log.userName[0] : 'U'}
                                                 </div>
                                                 <div>
                                                     <p className="text-sm font-black text-white leading-tight">{log.userName}</p>
                                                     <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">{log.userRole}</p>
                                                 </div>
                                             </div>
                                             <div className="text-right">
                                                 <p className="text-xs font-black text-white/80">{new Date(log.createdAt || log._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                 <p className="text-[10px] text-white/30 font-bold uppercase">{new Date(log.createdAt || log._creationTime).toLocaleDateString()}</p>
                                             </div>
                                         </div>

                                         <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-1">
                                             <div className="flex items-center gap-1.5 text-[9px] font-bold text-primary uppercase tracking-widest mb-1">
                                                 <Building className="w-3 h-3" /> Facility / Site
                                             </div>
                                             <p className="text-lg font-black text-white truncate">{log.siteName}</p>
                                             <div className="flex items-center gap-2">
                                                 <span className={cn(
                                                     "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-widest",
                                                     log.visitType === 'SiteCheckDay' ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                                                     log.visitType === 'SiteCheckNight' ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" :
                                                     log.visitType === 'Trainer' ? "bg-rose-500/20 text-rose-400 border-rose-500/30" :
                                                     "bg-white/10 text-white/60 border-white/10"
                                                 )}>
                                                     {log.visitType?.replace('SiteCheck', '').toUpperCase()} VISIT
                                                 </span>
                                             </div>
                                         </div>

                                         <div className="space-y-2">
                                             <div className="flex items-center gap-1.5 text-[9px] font-bold text-white/40 uppercase tracking-widest">
                                                 <FileText className="w-3 h-3" /> Observation
                                             </div>
                                             <p className="text-sm font-medium text-white/70 italic line-clamp-2 leading-relaxed">
                                                 "{log.remark || "Routine inspection successfully completed with photographic proof."}"
                                             </p>
                                         </div>
                                     </div>

                                     {/* Photo Preview */}
                                     <div className="sm:col-span-4 flex items-center">
                                         {log.imageUrl ? (
                                             <div className="w-full aspect-[4/5] rounded-[2rem] overflow-hidden border border-white/10 relative group-hover:border-primary/50 transition-all">
                                                 <img 
                                                     src={log.imageUrl} 
                                                     alt="Evidence" 
                                                    className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 group-hover:scale-110 transition-all duration-700" 
                                                 />
                                                 <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                                                     <div className="flex items-center gap-2 py-1 px-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/10">
                                                        <Camera className="w-3 h-3 text-white" />
                                                        <span className="text-[10px] font-black text-white">{log.imageUrls?.length || 1} Proofs</span>
                                                     </div>
                                                 </div>
                                             </div>
                                         ) : (
                                             <div className="w-full aspect-[4/5] rounded-[2rem] border-2 border-dashed border-white/5 flex flex-col items-center justify-center gap-3 opacity-30 bg-white/[0.01]">
                                                 <ImageIcon className="w-8 h-8" />
                                                 <p className="text-[10px] font-black uppercase">No Media</p>
                                             </div>
                                         )}
                                     </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="lg:col-span-2 py-20 text-center border border-dashed border-white/10 rounded-[2.5rem]">
                            <Clock className="w-12 h-12 text-white/10 mx-auto mb-4" />
                            <p className="text-sm text-white/40 font-black uppercase tracking-widest">No recent operational activity detected</p>
                        </div>
                    )
                ) : (
                    Array(4).fill(0).map((_, i) => (
                        <div key={i} className="h-64 rounded-[2.5rem] bg-white/[0.02] border border-white/5 animate-pulse" />
                    ))
                )}
            </div>
        </div>
      </div>
    </Layout>
  );
}
