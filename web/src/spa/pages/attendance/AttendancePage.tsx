import { Layout } from "../../../components/Layout";
import { Calendar, Download, FileSpreadsheet, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../services/convex";
import { cn } from "../../../lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";
import { 
  userHasAnyRole, 
  ADMIN_ROLES, 
  RESTRICTED_ROLES 
} from "../../../lib/userRoles";
import { SiteSelector } from "../../../components/SiteSelector";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function last30DaysRange(): { start: string; end: string; days: string[] } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  
  const days: string[] = [];
  const curr = new Date(start);
  while (curr <= end) {
    days.push(toYMD(curr));
    curr.setDate(curr.getDate() + 1);
  }
  return {
    start: toYMD(start),
    end: toYMD(end),
    days,
  };
}

function monthDateRange(year: number, monthIndex: number): { start: string; end: string; days: string[] } {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    days.push(toYMD(new Date(year, monthIndex, d)));
  }
  return {
    start: toYMD(new Date(year, monthIndex, 1)),
    end: toYMD(new Date(year, monthIndex, lastDay)),
    days,
  };
}

function siteShiftStrengthSum(site: any): number {
  const sh = site?.shifts;
  if (!Array.isArray(sh)) return 0;
  return sh.reduce((acc: number, s: any) => acc + (typeof s.strength === "number" ? s.strength : 0), 0);
}

function presentUniqueForSiteDay(records: any[], siteId: string, day: string): number {
  const set = new Set<string>();
  for (const r of records) {
    if (r.date !== day) continue;
    if (String(r.siteId) !== String(siteId)) continue;
    if (r.checkInTime != null) set.add(String(r.empId));
  }
  return set.size;
}

function normShiftLabel(s: string | undefined): string {
  const t = (s ?? "").trim().toLowerCase();
  return t.length ? t : "default";
}

/** Human-readable report block: per configured shift — name, time range, marked people. */
function buildShiftsAttendanceBlock(site: any, dayRecords: any[]): string {
  const checkIns = (dayRecords || []).filter((r) => r.checkInTime != null);
  const lines: string[] = [];
  const shifts = Array.isArray(site?.shifts) ? site.shifts : [];
  const usedNorm = new Set<string>();

  for (const sh of shifts) {
    const kn = normShiftLabel(sh.name);
    usedNorm.add(kn);
    const people = checkIns.filter((r) => normShiftLabel(r.shiftName) === kn);
    const labels = [
      ...new Map(people.map((r) => [String(r.empId), `${r.name} (${r.empId})`])).values(),
    ];
    lines.push(`${sh.name} (${sh.start}–${sh.end}): ${labels.length ? labels.join(", ") : "—"}`);
  }

  const extraNorms = new Set(checkIns.map((r) => normShiftLabel(r.shiftName)));
  for (const ek of extraNorms) {
    if (usedNorm.has(ek)) continue;
    const people = checkIns.filter((r) => normShiftLabel(r.shiftName) === ek);
    const title = people[0]?.shiftName || ek;
    const labels = [
      ...new Map(people.map((r) => [String(r.empId), `${r.name} (${r.empId})`])).values(),
    ];
    lines.push(`${title}: ${labels.join(", ")}`);
  }

  return lines.length ? lines.join("\n") : "—";
}

/** Full = check-in + check-out; half = check-in only (open shift). */
function shiftCompletionClass(r: { checkInTime?: number | null; checkOutTime?: number | null }): "full" | "half" | "none" {
  if (r.checkInTime == null) return "none";
  if (r.checkOutTime != null) return "full";
  return "half";
}

const DETAILS_SITES_PAGE = 20;
const REPORT_TABLE_PAGE = 50;

function DetailsSiteSkeletonRow() {
  return (
    <div
      className="animate-pulse rounded-lg border border-white/10 bg-white/[0.03] p-2"
      aria-hidden
    >
      <div className="mb-2 h-3 w-1/3 max-w-[180px] rounded bg-white/10" />
      <div className="flex gap-1 overflow-hidden">
        {Array.from({ length: 31 }).map((_, i) => (
          <div key={i} className="h-8 w-10 shrink-0 rounded-md bg-white/5" />
        ))}
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<"details" | "report" | "manual">("details");
  const [detailMonth, setDetailMonth] = useState(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const [dayDetail, setDayDetail] = useState<{
    siteName: string;
    date: string;
    shiftCount: number;
    strength: number;
    present: number;
    pct: number;
    extraPct: number;
  } | null>(null);

  const today = new Date();
  /** Report always covers one full calendar month (columns = every day in that month). */
  const [reportMonth, setReportMonth] = useState(() => ({
    y: today.getFullYear(),
    m: today.getMonth(),
  }));
  const [detailsSitesPage, setDetailsSitesPage] = useState(0);
  const [reportTablePage, setReportTablePage] = useState(0);
  const [detailSiteId, setDetailSiteId] = useState("");
  const [reportSiteId, setReportSiteId] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const [viewType, setViewType] = useState<"month" | "last30">("month");
  const [selectedLogDate, setSelectedLogDate] = useState<string>(toYMD(new Date()));

  const currentUser = useQuery(api.users.getByClerkId, user?.id ? { clerkId: user.id } : "skip");
  const organizationId = currentUser?.organizationId;
  const isRestricted = userHasAnyRole(currentUser, RESTRICTED_ROLES as any);
  const isAdmin = userHasAnyRole(currentUser, ADMIN_ROLES as any);

  const regions = useQuery(api.regions.list, {});

  useEffect(() => {
    setDetailsSitesPage(0);
  }, [detailMonth.y, detailMonth.m, organizationId]);

  const detailSites = useQuery(
    api.sites.listSitesByOrg,
    organizationId
      ? {
          organizationId: organizationId,
          requestingUserId: currentUser?._id
        }
      : "skip"
  );

  const reportSites = useQuery(
    api.sites.listSitesByOrg,
    organizationId
      ? {
          organizationId: organizationId,
          requestingUserId: currentUser?._id
        }
      : "skip"
  );

  const { start: monthStart, end: monthEnd, days: monthDays } = 
    viewType === "month" 
    ? monthDateRange(detailMonth.y, detailMonth.m)
    : last30DaysRange();

  const monthRecords = useQuery(
    api.attendance.listForOrgDateRange,
    organizationId ? { 
      organizationId: organizationId, 
      startDate: monthStart, 
      endDate: monthEnd, 
      requestingUserId: currentUser?._id 
    } : "skip"
  );

  const { start: reportStart, end: reportEnd, days: reportDays } = monthDateRange(reportMonth.y, reportMonth.m);

  const reportRecords = useQuery(
    api.attendance.listForOrgDateRange,
    organizationId ? { 
      organizationId: organizationId, 
      startDate: reportStart, 
      endDate: reportEnd, 
      requestingUserId: currentUser?._id 
    } : "skip"
  );
  const enrolledPersons = useQuery(
    api.enrollment.list,
    organizationId ? { organizationId } : "skip"
  );

  const dayStats = useMemo(() => {
    const recs = (monthRecords as any[]) || [];
    const sites = (detailSites as any[]) || [];
    const map = new Map<string, { strength: number; present: number; pct: number; extraPct: number }>();
    for (const site of sites) {
      const sid = String(site._id);
      const strength = siteShiftStrengthSum(site) || 0;
      for (const day of monthDays) {
        const present = presentUniqueForSiteDay(recs, sid, day);
        const denom = strength > 0 ? strength : present > 0 ? present : 1;
        const pct = Math.min(100, Math.round((present / denom) * 100));
        const extraPct =
          strength > 0 && present > strength
            ? Math.min(100, Math.round(((present - strength) / strength) * 100))
            : 0;
        map.set(`${sid}|${day}`, { strength, present, pct, extraPct });
      }
    }
    return map;
  }, [monthRecords, detailSites, monthDays]);

  /** Attendance-sheet style rows: one row per employee, date columns show shift(s). */
  const reportSheetRows = useMemo(() => {
    const recs = (reportRecords as any[]) || [];
    let sites = (reportSites as any[]) || [];
    if (reportSiteId) sites = sites.filter((s) => String(s._id) === reportSiteId);
    const siteMap = new Map(sites.map((s) => [String(s._id), s]));
    const rankMap = new Map<string, string>();
    for (const p of (enrolledPersons as any[]) || []) {
      rankMap.set(String(p.empId), String(p.empRank || "—"));
    }
    const groups = new Map<
      string,
      {
        name: string;
        empId: string;
        rank: string;
        dayShifts: Map<string, Set<string>>;
        fullShift: number;
        halfShift: number;
      }
    >();
    for (const r of recs) {
      if (!r?.siteId || !r?.date) continue;
      if (r.date < reportStart || r.date > reportEnd) continue;
      const sid = String(r.siteId);
      if (!siteMap.has(sid)) continue;
      const empId = String(r.empId || "");
      if (!empId) continue;
      const key = `${empId}|${String(r.name || "")}`;
      if (!groups.has(key)) {
        groups.set(key, {
          name: String(r.name || "—"),
          empId,
          rank: rankMap.get(empId) || "—",
          dayShifts: new Map(),
          fullShift: 0,
          halfShift: 0,
        });
      }
      const g = groups.get(key)!;
      const cls = shiftCompletionClass(r);
      if (cls === "full") g.fullShift += 1;
      else if (cls === "half") g.halfShift += 1;

      if (r.checkInTime != null) {
        if (!g.dayShifts.has(r.date)) g.dayShifts.set(r.date, new Set());
        const label = String(r.shiftName || "P").trim() || "P";
        g.dayShifts.get(r.date)!.add(label);
      }
      if (r.checkOutTime != null) {
        if (!g.dayShifts.has(r.date)) g.dayShifts.set(r.date, new Set());
        g.dayShifts.get(r.date)!.add("LO"); // Logout
      }
    }
    const rows: {
      name: string;
      empId: string;
      rank: string;
      byDate: Record<string, string>;
      fullShift: number;
      halfShift: number;
      totalShift: number;
    }[] = [];
    const sorted = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const g of sorted) {
      const byDate: Record<string, string> = {};
      for (const d of reportDays) {
        const set = g.dayShifts.get(d);
        byDate[d] = set && set.size ? [...set].join(", ") : "—";
      }
      rows.push({
        name: g.name,
        empId: g.empId,
        rank: g.rank,
        byDate,
        fullShift: g.fullShift,
        halfShift: g.halfShift,
        totalShift: g.fullShift + g.halfShift,
      });
    }
    return rows;
  }, [reportRecords, reportSites, enrolledPersons, reportStart, reportEnd, reportSiteId, reportDays]);

  useEffect(() => {
    setReportTablePage(0);
  }, [reportMonth.y, reportMonth.m, reportSiteId, reportSearch]);

  const sortedDetailSites = useMemo(() => {
    let s = ((detailSites as any[]) || []).slice();
    if (detailSiteId) {
        s = s.filter(site => String(site._id) === detailSiteId);
    }
    s.sort((a, b) =>
      String(a.name || a.locationName || "").localeCompare(String(b.name || b.locationName || ""))
    );
    return s;
  }, [detailSites, detailSiteId]);

  const detailsPageCount = Math.max(1, Math.ceil(sortedDetailSites.length / DETAILS_SITES_PAGE));
  const pagedDetailSites = useMemo(() => {
    const start = detailsSitesPage * DETAILS_SITES_PAGE;
    return sortedDetailSites.slice(start, start + DETAILS_SITES_PAGE);
  }, [sortedDetailSites, detailsSitesPage]);

  const filteredReportSheetRows = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    if (!q) return reportSheetRows;
    return reportSheetRows.filter(
      (r) =>
        String(r.name || "").toLowerCase().includes(q) ||
        String(r.empId || "").toLowerCase().includes(q) ||
        String(r.rank || "").toLowerCase().includes(q)
    );
  }, [reportSheetRows, reportSearch]);

  const reportPageCount = Math.max(1, Math.ceil(filteredReportSheetRows.length / REPORT_TABLE_PAGE));
  const reportPageRows = useMemo(() => {
    const start = reportTablePage * REPORT_TABLE_PAGE;
    return filteredReportSheetRows.slice(start, start + REPORT_TABLE_PAGE);
  }, [filteredReportSheetRows, reportTablePage]);

  const downloadCsv = () => {
    const header = [
      "s_no",
      "name",
      "emp_id",
      "rank",
      ...reportDays,
      "full_shift",
      "half_shift",
      "total_shift",
    ];
    const lines = [header.join(",")];
    filteredReportSheetRows.forEach((r, i) => {
      lines.push(
        [
          String(i + 1),
          `"${String(r.name).replace(/"/g, '""')}"`,
          `"${String(r.empId).replace(/"/g, '""')}"`,
          `"${String(r.rank).replace(/"/g, '""')}"`,
          ...reportDays.map((d) => `"${String(r.byDate[d] || "—").replace(/"/g, '""')}"`),
          String(r.fullShift),
          String(r.halfShift),
          String(r.totalShift),
        ].join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-sheet-${reportStart}-${reportEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loading =
    currentUser === undefined ||
    regions === undefined ||
    (organizationId && detailSites === undefined) ||
    (organizationId && monthRecords === undefined);

  return (
    <Layout title="Attendance Management">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3 flex-1">
            <button
              type="button"
              onClick={() => setActiveTab("details")}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-bold transition-colors",
                activeTab === "details" ? "bg-primary text-white" : "text-muted-foreground hover:bg-white/5"
              )}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("report")}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-bold transition-colors",
                activeTab === "report" ? "bg-primary text-white" : "text-muted-foreground hover:bg-white/5"
              )}
            >
              Report
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("manual")}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-bold transition-colors",
                activeTab === "manual" ? "bg-primary text-white" : "text-muted-foreground hover:bg-white/5"
              )}
            >
              Manual Logs
            </button>
          </div>

          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 self-start">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground">Focus Date:</span>
            <input 
              type="date" 
              value={selectedLogDate}
              onChange={(e) => setSelectedLogDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-white outline-none border-none [color-scheme:dark]"
            />
          </div>
        </div>

        {activeTab === "details" && (
          <div className="space-y-6">
            <div className="glass relative z-[60] flex flex-col gap-4 rounded-2xl border border-white/10 p-4 md:flex-row md:flex-wrap md:items-end">
              <div className="min-w-[150px]">
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">View Range</label>
                <div className="flex bg-white/5 border border-white/10 rounded-xl p-1">
                  <button
                    onClick={() => setViewType("month")}
                    className={cn(
                      "flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                      viewType === "month" ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-white"
                    )}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setViewType("last30")}
                    className={cn(
                      "flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                      viewType === "last30" ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-white"
                    )}
                  >
                    Last 30 Days
                  </button>
                </div>
              </div>
              <div className="min-w-[200px]">
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Site</label>
                <SiteSelector
                  organizationId={organizationId}
                  selectedSiteId={detailSiteId}
                  onSiteChange={setDetailSiteId}
                  requestingUserId={currentUser?._id}
                  allOptionLabel="All sites"
                  className="min-w-[180px]"
                />
              </div>
              <div className="min-w-[200px]">
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Month</label>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="month"
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                    value={`${detailMonth.y}-${pad2(detailMonth.m + 1)}`}
                    onChange={(e) => {
                      const [y, m] = e.target.value.split("-").map(Number);
                      if (y && m) setDetailMonth({ y, m: m - 1 });
                    }}
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <DetailsSiteSkeletonRow key={i} />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {sortedDetailSites.length === 0 ? (
                  <p className="text-center text-muted-foreground">No sites for this filter.</p>
                ) : (
                  <>
                    {pagedDetailSites.map((site) => {
                      const sid = String(site._id);
                      const shiftCount = Array.isArray(site.shifts) ? site.shifts.length : 0;
                      const strength = siteShiftStrengthSum(site);
                      return (
                        <div key={sid} className="glass rounded-lg border border-white/10 p-2">
                          <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                            <h3 className="text-sm font-bold text-white">
                              {site.name || site.locationName}
                            </h3>
                            <span className="text-[11px] text-muted-foreground">
                              {shiftCount} sh · str {strength || "—"}
                            </span>
                          </div>
                          <div className="-mx-0.5 overflow-x-auto pb-1">
                            <div className="inline-flex min-w-0 gap-1 px-0.5">
                              {monthDays.map((day) => {
                                const k = `${sid}|${day}`;
                                const st = dayStats.get(k);
                                const pct = st?.pct ?? 0;
                                const extra = st?.extraPct ?? 0;
                                const d = day.slice(8);
                                const hasAttendance = st && st.present > 0;
                                const isApproved = st && st.approvedCount && st.approvedCount > 0;

                                return (
                                  <button
                                    key={day}
                                    type="button"
                                    onClick={() => {
                                      setDayDetail({
                                        siteName: site.name || site.locationName || "Site",
                                        date: day,
                                        shiftCount,
                                        strength: st?.strength ?? strength,
                                        present: st?.present ?? 0,
                                        pct,
                                        extraPct: extra,
                                      });
                                      setSelectedLogDate(day);
                                    }}
                                    className={cn(
                                      "inline-flex min-h-[2.5rem] min-w-[2.5rem] shrink-0 flex-col items-center justify-center rounded-full border transition-all duration-300",
                                      !hasAttendance
                                        ? "border-white/5 bg-white/[0.02] text-slate-500 opacity-30"
                                        : isApproved
                                          ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                                          : "border-rose-500/50 bg-rose-500/20 text-rose-400 animate-pulse-subtle"
                                    )}
                                    title={`${day}: ${hasAttendance ? (isApproved ? 'Approved' : 'Pending Approval') : 'No Records'}`}
                                  >
                                    <span className={cn(
                                      "text-[10px] font-bold",
                                      hasAttendance ? "text-white" : "text-slate-600"
                                    )}>{d}</span>
                                    {hasAttendance && extra > 0 ? (
                                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white">
                                        +{extra}
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                      <p className="text-xs text-muted-foreground">
                        Sites{" "}
                        <span className="font-mono text-white/80">
                          {detailsSitesPage * DETAILS_SITES_PAGE + 1}–
                          {Math.min(
                            (detailsSitesPage + 1) * DETAILS_SITES_PAGE,
                            sortedDetailSites.length
                          )}
                        </span>{" "}
                        of <span className="font-mono text-white/80">{sortedDetailSites.length}</span>
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={detailsSitesPage <= 0}
                          onClick={() => setDetailsSitesPage((p) => Math.max(0, p - 1))}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-30"
                        >
                          Prev
                        </button>
                        <span className="text-xs text-muted-foreground">
                          {detailsSitesPage + 1} / {detailsPageCount}
                        </span>
                        <button
                          type="button"
                          disabled={detailsSitesPage >= detailsPageCount - 1}
                          onClick={() =>
                            setDetailsSitesPage((p) => Math.min(detailsPageCount - 1, p + 1))
                          }
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-30"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "manual" && (
          <div className="space-y-4">
            <div className="glass overflow-hidden rounded-2xl border border-white/10">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Photo</th>
                      <th className="px-4 py-3">Staff Name</th>
                      <th className="px-4 py-3">Site</th>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Approved By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {monthRecords?.filter((r: any) => {
                      const isManual = r.type === 'staff_manual' || r.type === 'manual';
                      const matchesDate = r.date === selectedLogDate;
                      return isManual && matchesDate;
                    }).map((r: any) => (
                      <tr key={r._id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          {r.imageId ? (
                            <img 
                              src={`https://proficient-egret-829.convex.cloud/api/storage/${r.imageId}`} 
                              alt="Staff" 
                              className="h-10 w-10 rounded-lg object-cover border border-white/10"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center">
                              <User className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">{r.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.siteName || '—'}</td>
                        <td className="px-4 py-3 text-xs">
                          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-400 border border-blue-500/20">
                            Manual
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{r.type || 'staff'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {new Date(r.createdAt || r._creationTime).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                            r.approvalStatus === "approved" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            r.approvalStatus === "rejected" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                            "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          )}>
                            {r.type === 'logout' ? 'Logout' : (r.approvalStatus || 'pending')}
                          </span>
                        </td>
                        <td className="px-4 py-3 truncate max-w-[150px]">
                          {r.approvedByName ? (
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-white/90">{r.approvedByName}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {r.approvedAt ? new Date(r.approvedAt).toLocaleTimeString() : ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Decision Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!monthRecords?.some((r: any) => r.type === 'staff_manual' || r.type === 'manual') && (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                          No manual attendance logs found for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "report" && (
          <div className="space-y-4">
            <div className="glass relative z-[60] flex flex-col flex-wrap gap-4 rounded-2xl border border-white/10 p-4 md:flex-row md:items-end">
              <div className="min-w-[150px]">
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Month</label>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="month"
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                    value={`${reportMonth.y}-${pad2(reportMonth.m + 1)}`}
                    onChange={(e) => {
                      const [y, m] = e.target.value.split("-").map(Number);
                      if (y && m) setReportMonth({ y, m: m - 1 });
                    }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground font-mono">
                  {reportStart} to {reportEnd}
                </p>
              </div>

              <div className="min-w-[200px]">
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Site Filter</label>
                <SiteSelector
                  organizationId={organizationId}
                  selectedSiteId={reportSiteId}
                  onSiteChange={setReportSiteId}
                  requestingUserId={currentUser?._id}
                  allOptionLabel="All sites"
                />
              </div>

              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Search</label>
                <input
                  type="text"
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                  placeholder="Name / Emp ID / Rank"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <button
                type="button"
                onClick={downloadCsv}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/25 transition-colors h-[38px]"
              >
                <Download className="h-4 w-4" />
                CSV
              </button>
            </div>

            <div className="glass overflow-hidden rounded-2xl border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Attendance Sheet</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {filteredReportSheetRows.length} rows · page {reportTablePage + 1}/{reportPageCount}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="w-[4rem] px-3 py-2">S.No</th>
                      <th className="min-w-[10rem] px-3 py-2">Name</th>
                      <th className="min-w-[8rem] px-3 py-2">Emp ID</th>
                      <th className="min-w-[8rem] px-3 py-2">Rank</th>
                      {reportDays.map((d) => (
                        <th key={d} className="min-w-[7rem] px-3 py-2 text-center">
                          {d.slice(8, 10)}/{d.slice(5, 7)}/{d.slice(0, 4)}
                        </th>
                      ))}
                      <th className="min-w-[6rem] px-3 py-2 text-center">Full shift</th>
                      <th className="min-w-[6rem] px-3 py-2 text-center">Half shift</th>
                      <th className="min-w-[6rem] px-3 py-2 text-center">Total shift</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {reportPageRows.map((r, i) => (
                      <tr key={`${r.empId}-${i}`} className="align-top hover:bg-white/[0.02]">
                        <td className="px-3 py-2 font-mono text-xs text-white">
                          {reportTablePage * REPORT_TABLE_PAGE + i + 1}
                        </td>
                        <td className="px-3 py-2 text-sm font-semibold text-white/90">{r.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-white/90">{r.empId}</td>
                        <td className="px-3 py-2 text-xs text-slate-200">{r.rank}</td>
                        {reportDays.map((d) => (
                          <td key={`${r.empId}-${d}`} className="px-3 py-2 text-center text-xs text-white/85">
                            {r.byDate[d] || "—"}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center font-mono text-xs text-emerald-200">{r.fullShift}</td>
                        <td className="px-3 py-2 text-center font-mono text-xs text-amber-200">{r.halfShift}</td>
                        <td className="px-3 py-2 text-center font-mono text-xs text-white">{r.totalShift}</td>
                      </tr>
                    ))}
                    {filteredReportSheetRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={7 + reportDays.length}
                          className="px-4 py-10 text-center text-muted-foreground"
                        >
                          No attendance rows for this month and filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredReportSheetRows.length > REPORT_TABLE_PAGE ? (
                <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
                  <button
                    type="button"
                    disabled={reportTablePage <= 0}
                    onClick={() => setReportTablePage((p) => Math.max(0, p - 1))}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-30"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={reportTablePage >= reportPageCount - 1}
                    onClick={() =>
                      setReportTablePage((p) => Math.min(reportPageCount - 1, p + 1))
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {dayDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog">
            <div className="glass max-w-md rounded-2xl border border-white/10 p-6 shadow-xl">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-bold text-white">{dayDetail.siteName}</h4>
                  <p className="text-sm text-muted-foreground">{dayDetail.date}</p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  className="rounded-lg p-2 hover:bg-white/10"
                  onClick={() => setDayDetail(null)}
                >
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
              <ul className="space-y-2 text-sm text-white/90">
                <li className="flex justify-between border-b border-white/5 py-2">
                  <span className="text-muted-foreground">Shifts (configured)</span>
                  <span className="font-bold">{dayDetail.shiftCount}</span>
                </li>
                <li className="flex justify-between border-b border-white/5 py-2">
                  <span className="text-muted-foreground">Total strength</span>
                  <span className="font-bold">{dayDetail.strength || "—"}</span>
                </li>
                <li className="flex justify-between border-b border-white/5 py-2">
                  <span className="text-muted-foreground">Present (unique)</span>
                  <span className="font-bold text-emerald-300">{dayDetail.present}</span>
                </li>
                <li className="flex justify-between border-b border-white/5 py-2">
                  <span className="text-muted-foreground">Attendance %</span>
                  <span className="font-bold text-sky-300">{dayDetail.pct}%</span>
                </li>
                {dayDetail.extraPct > 0 ? (
                  <li className="flex justify-between py-2">
                    <span className="text-muted-foreground">Over baseline (extra)</span>
                    <span className="font-bold text-orange-300">+{dayDetail.extraPct}%</span>
                  </li>
                ) : null}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">No individual names are shown here.</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
