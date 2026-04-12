import { useEffect, useMemo, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../../services/convex";
import { Layout } from "../../../components/Layout";
import {
    FileSpreadsheet,
    FileText,
    GraduationCap,
    Image as ImageIcon,
    Moon,
    Sun,
    UserCheck,
    X,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useUser } from "@clerk/nextjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { userHasRole } from "../../../lib/userRoles";
import type { Id } from "../../../../convex/_generated/dataModel";

const REPORT_PAGE_SIZE = 25;

function parseVisitDayStart(iso: string): number {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function parseVisitDayEnd(iso: string): number {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/** Local calendar date key (avoid UTC drift from toISOString). */
function localDayKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function VisitTypeIcon({ visitType }: { visitType?: string }) {
    const cls = "h-3.5 w-3.5 shrink-0";
    if (visitType === "SiteCheckDay") return <Sun className={`${cls} text-amber-400`} aria-hidden />;
    if (visitType === "SiteCheckNight") return <Moon className={`${cls} text-slate-300`} aria-hidden />;
    if (visitType === "Trainer") return <GraduationCap className={`${cls} text-sky-400`} aria-hidden />;
    return null;
}

function VisitsPageSkeleton({ activeTab }: { activeTab: "details" | "report" }) {
    return (
        <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading visits">
            <div className="h-9 w-56 rounded-lg bg-white/10" />
            <div className="flex gap-6 border-b border-white/10 px-2 pb-2">
                <div className="h-5 w-20 rounded bg-white/10" />
                <div className="h-5 w-24 rounded bg-white/10" />
            </div>
            <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-3">
                <div className="h-20 rounded-xl bg-white/5" />
                <div className="h-20 rounded-xl bg-white/5" />
                <div className="h-20 rounded-xl bg-white/5" />
            </div>
            <div className="min-h-[280px] rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="space-y-2">
                    {Array.from({ length: activeTab === "report" ? 8 : 10 }).map((_, i) => (
                        <div key={i} className="h-9 rounded-lg bg-white/5" />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function VisitLogs() {
    const { user } = useUser();
    const convex = useConvex();
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"details" | "report">("details");
    const [selectedRegionId, setSelectedRegionId] = useState("");
    const [selectedCity, setSelectedCity] = useState("");
    const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
    const [selectedSiteId, setSelectedSiteId] = useState("");
    const [selectedDayDetails, setSelectedDayDetails] = useState<{
        officerName: string;
        dateLabel: string;
        logs: any[];
    } | null>(null);

    const today = new Date();
    const defaultToDate = today.toISOString().slice(0, 10);
    const defaultFromDate = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    const [reportFromDate, setReportFromDate] = useState(defaultFromDate);
    const [reportToDate, setReportToDate] = useState(defaultToDate);
    const [reportPageIndex, setReportPageIndex] = useState(0);
    const [exportBusy, setExportBusy] = useState(false);
    const [visitorStatusFilter, setVisitorStatusFilter] = useState<"all" | "pending" | "approved" | "rejected" | "inside" | "exited">("pending");
    const [categoryFilter, setCategoryFilter] = useState<"all" | "person" | "vehicle">("all");

    const currentUser = useQuery(api.users.getByClerkId,
        user?.id ? { clerkId: user.id } : "skip"
    );
    const organizationId = currentUser?.organizationId;
    const isRestricted = (currentUser?.roles || []).some((r: string) => ["Client", "SO"].includes(r));
    const isAdmin = (currentUser?.roles || []).some((r: string) => ["Owner", "Deployment Manager", "Manager", "Visiting Officer"].includes(r));

    const orgUsers = useQuery(
        api.users.listByOrg,
        organizationId ? { organizationId } : "skip"
    );
    const regions = useQuery(api.regions.list, {});
    const orgs = useQuery(api.organizations.list, organizationId ? { 
        requestingUserId: currentUser?._id 
    } : "skip");
    const sites = useQuery(
        api.sites.listSitesByOrg,
        organizationId
            ? { 
                organizationId: (selectedOrganizationId as Id<"organizations">) || organizationId, 
                regionId: selectedRegionId || undefined,
                requestingUserId: currentUser?._id
            }
            : "skip"
    );

    useEffect(() => {
        if (currentUser?.regionId && !selectedRegionId) {
            setSelectedRegionId(currentUser.regionId);
        }
    }, [currentUser?.regionId, selectedRegionId]);

    useEffect(() => {
        setReportPageIndex(0);
    }, [reportFromDate, reportToDate, selectedRegionId, selectedCity]);

    const reportFromMs = useMemo(() => parseVisitDayStart(reportFromDate), [reportFromDate]);
    const reportToMs = useMemo(() => parseVisitDayEnd(reportToDate), [reportToDate]);

    useEffect(() => {
        if (selectedSiteId && !sites?.some((s: { _id: string }) => s._id === selectedSiteId)) {
            setSelectedSiteId("");
        }
        // Auto-select if restricted and only one site available
        if (isRestricted && (sites || []).length === 1 && !selectedSiteId) {
            setSelectedSiteId(sites![0]._id);
        }
    }, [sites, selectedSiteId, isRestricted]);

    const visitReportPage = useQuery(
        api.logs.listVisitLogsPage,
        organizationId && selectedRegionId && activeTab === "report" && reportFromMs <= reportToMs
            ? {
                  organizationId: (selectedOrganizationId as Id<"organizations">) || organizationId,
                  regionId: selectedRegionId,
                  fromMs: reportFromMs,
                  toMs: reportToMs,
                  city: selectedCity || undefined,
                  offset: reportPageIndex * REPORT_PAGE_SIZE,
                  limit: REPORT_PAGE_SIZE,
                  requestingUserId: currentUser?._id
              }
            : "skip"
    );

    const visitLogs = useQuery(
        api.logs.listVisitLogs,
        organizationId
            ? {
                organizationId: (selectedOrganizationId as Id<"organizations">) || organizationId,
                regionId: selectedRegionId || undefined,
                city: selectedCity || undefined,
                requestingUserId: currentUser?._id
            }
            : "skip"
    );
    const visitorsByStatus = useQuery(
        api.logs.getVisitorsByStatus,
        organizationId
            ? {
                organizationId: (selectedOrganizationId as Id<"organizations">) || organizationId,
                status: visitorStatusFilter,
                requestingUserId: currentUser?._id
            }
            : "skip"
    );
    const visitorStatusCounts = useQuery(
        api.logs.getVisitorStatusCounts,
        organizationId
            ? {
                organizationId: (selectedOrganizationId as Id<"organizations">) || organizationId,
                requestingUserId: currentUser?._id
            }
            : "skip"
    );
    const updateVisitorStatus = useMutation(api.logs.updateVisitorStatus);

    const availableCities = useMemo(() => {
        if (!selectedRegionId) {
            const cities = (regions ?? []).flatMap((region: any) => region.cities ?? []);
            return Array.from(new Set(cities.filter(Boolean))).sort();
        }

        const region = (regions ?? []).find((item: any) => item.regionId === selectedRegionId);
        return Array.from(new Set((region?.cities ?? []).filter(Boolean))).sort();
    }, [regions, selectedRegionId]);

    const visitingOfficers = useMemo(() => {
        return (orgUsers ?? []).filter((officer: any) => {
            if (!userHasRole(officer, "Visiting Officer") || officer.status === "inactive") {
                return false;
            }

            const matchesRegion = !selectedRegionId || officer.regionId === selectedRegionId;
            const matchesCity =
                !selectedCity ||
                !officer.cities?.length ||
                officer.cities.includes(selectedCity);

            return matchesRegion && matchesCity;
        });
    }, [orgUsers, selectedCity, selectedRegionId]);

    const siteLookup = useMemo(() => {
        return new Map((sites ?? []).map((site: any) => [site._id, site]));
    }, [sites]);

    const officerIdSet = useMemo(
        () => new Set(visitingOfficers.map((officer: any) => officer._id)),
        [visitingOfficers]
    );

    const filteredVisitLogs = useMemo(() => {
        return (visitLogs ?? []).filter((log: any) => officerIdSet.has(log.userId));
    }, [officerIdSet, visitLogs]);

    const past30Days = useMemo(() => {
        return Array.from({ length: 30 }, (_, index) => {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() - 29 + index);
            const key = localDayKey(date);
            return {
                key,
                day: date.getDate(),
                weekday: date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2).toUpperCase(),
                fullLabel: date.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                }),
            };
        });
    }, []);

    const dailyCountsByOfficer = useMemo(() => {
        const counts = new Map<string, Record<string, any[]>>();
        filteredVisitLogs.forEach((log: any) => {
            const createdAt = new Date(log.createdAt ?? log._creationTime);
            const dayKey = localDayKey(createdAt);
            if (!counts.has(log.userId)) {
                counts.set(log.userId, {});
            }
            const officerMap = counts.get(log.userId)!;
            if (!officerMap[dayKey]) {
                officerMap[dayKey] = [];
            }
            officerMap[dayKey].push(log);
        });
        return counts;
    }, [filteredVisitLogs]);

    const fetchExportVisitItems = async (): Promise<any[]> => {
        if (!organizationId || !selectedRegionId || reportFromMs > reportToMs) return [];
        const { items } = await convex.query(api.logs.listVisitLogsExport, {
            organizationId,
            regionId: selectedRegionId,
            fromMs: reportFromMs,
            toMs: reportToMs,
            city: selectedCity || undefined,
            maxRows: 2500,
            requestingUserId: currentUser?._id
        });
        return items as any[];
    };

    const fetchExportRows = async () => {
        const items = await fetchExportVisitItems();
        return items.map((log) => {
            const fromArr = (log.imageUrls as string[] | undefined)?.filter(Boolean) ?? [];
            const urls = fromArr.length > 0 ? fromArr : log.imageUrl ? [log.imageUrl] : [];
            return {
                officer: log.userName || "Unknown",
                site: log.siteName || "",
                notes: log.remark || "",
                visitType: log.visitType || "",
                checkIn: new Date(log.createdAt ?? log._creationTime).toLocaleString(),
                checkOut: log.checkOutAt ? new Date(log.checkOutAt).toLocaleString() : "",
                photoUrls: urls.join(" | "),
            };
        });
    };

    const downloadCsv = async () => {
        if (!organizationId || !selectedRegionId) return;
        setExportBusy(true);
        try {
            const rows = await fetchExportRows();
            if (!rows.length) return;

            const headers = [
                "Officer",
                "Site",
                "Notes",
                "Type",
                "Check-in",
                "Check-out",
                "Photo URLs",
            ];
            const escapeCsv = (value: string) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
            const content = [
                headers.map(escapeCsv).join(","),
                ...rows.map((row) =>
                    [
                        row.officer,
                        row.site,
                        row.notes,
                        row.visitType,
                        row.checkIn,
                        row.checkOut,
                        row.photoUrls,
                    ]
                        .map(escapeCsv)
                        .join(",")
                ),
            ].join("\n");

            const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `visit-report-${reportFromDate}-to-${reportToDate}.csv`;
            link.click();
            window.URL.revokeObjectURL(url);
        } finally {
            setExportBusy(false);
        }
    };

    const downloadPdf = async () => {
        if (!organizationId || !selectedRegionId) return;
        setExportBusy(true);
        try {
            const rows = await fetchExportRows();
            if (!rows.length) return;

            const doc = new jsPDF({ orientation: "landscape" });
            doc.setFontSize(16);
            doc.text("Visit Report", 14, 18);
            doc.setFontSize(10);
            doc.text(`From ${reportFromDate} To ${reportToDate}`, 14, 26);

            autoTable(doc, {
                startY: 32,
                head: [["Officer", "Site", "Notes", "Type", "Check-in", "Check-out", "Photos"]],
                body: rows.map((row) => [
                    row.officer,
                    row.site,
                    row.notes.length > 80 ? `${row.notes.slice(0, 80)}…` : row.notes,
                    row.visitType,
                    row.checkIn,
                    row.checkOut,
                    row.photoUrls.length > 60 ? "see CSV" : row.photoUrls || "—",
                ]),
                styles: {
                    fontSize: 7,
                    cellPadding: 1.5,
                },
                headStyles: {
                    fillColor: [30, 41, 59],
                },
            });

            doc.save(`visit-report-${reportFromDate}-to-${reportToDate}.pdf`);
        } finally {
            setExportBusy(false);
        }
    };

    const reportLoading =
        activeTab === "report" &&
        !!organizationId &&
        Boolean(selectedRegionId) &&
        reportFromMs <= reportToMs &&
        visitReportPage === undefined;

    const getStatusBadgeClass = (status: string) => {
        if (status === "approved") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
        if (status === "rejected") return "bg-rose-500/10 text-rose-400 border-rose-500/20";
        if (status === "inside") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
        if (status === "exited") return "bg-slate-500/10 text-slate-300 border-slate-500/20";
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    };

    const handleVisitorStatusAction = async (logId: Id<"visitLogs">, status: "approved" | "rejected" | "inside" | "exited") => {
        await updateVisitorStatus({ logId, status });
    };

    if (
        currentUser === undefined ||
        regions === undefined ||
        (organizationId && (visitLogs === undefined || orgUsers === undefined || sites === undefined)) ||
        reportLoading
    ) {
        return (
            <Layout title="Visits">
                <VisitsPageSkeleton activeTab={activeTab} />
            </Layout>
        );
    }

    if (!organizationId) {
        return (
            <Layout title="Visits">
                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                    <p className="text-muted-foreground text-center max-w-md">
                        Please set up or join an organization to view visits.
                    </p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="Visits">
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">
                            Visitors ({`All:${visitorStatusCounts?.all ?? 0} | Pending:${visitorStatusCounts?.pending ?? 0} | Approved:${visitorStatusCounts?.approved ?? 0} | Inside:${visitorStatusCounts?.inside ?? 0}`})
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Visiting officers and logs are scoped to your selected region (defaults to your profile region).
                            Use the report tab for a paginated date-range export.
                        </p>
                    </div>
                </div>

                <div className="flex gap-6 border-b border-white/10 px-2">
                    <button
                        onClick={() => setActiveTab("details")}
                        className={cn(
                            "pb-2 text-sm font-medium",
                            activeTab === "details"
                                ? "text-primary border-b-2 border-primary"
                                : "text-muted-foreground"
                        )}
                    >
                        Details
                    </button>
                    <button
                        onClick={() => setActiveTab("report")}
                        className={cn(
                            "pb-2 text-sm font-medium",
                            activeTab === "report"
                                ? "text-primary border-b-2 border-primary"
                                : "text-muted-foreground"
                        )}
                    >
                        Visitors
                    </button>
                </div>

                {!isRestricted && (
                    <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-4">
                        {isAdmin && (
                            <label className="space-y-2">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organization</span>
                                <select
                                    value={selectedOrganizationId}
                                    onChange={(e) => {
                                        setSelectedOrganizationId(e.target.value);
                                        setSelectedRegionId("");
                                        setSelectedCity("");
                                        setSelectedSiteId("");
                                    }}
                                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-primary"
                                >
                                    <option value="">All Organizations</option>
                                    {(orgs ?? []).map((o: any) => (
                                        <option key={o._id} value={o._id}>
                                            {o.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <label className="space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Region</span>
                            <select
                                value={selectedRegionId}
                                onChange={(e) => {
                                    setSelectedRegionId(e.target.value);
                                    setSelectedCity("");
                                }}
                                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-primary"
                            >
                                <option value="">All Regions</option>
                                {(regions ?? []).map((region: any) => (
                                    <option key={region._id} value={region.regionId}>
                                        {region.regionName} ({region.regionId})
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">City</span>
                            <select
                                value={selectedCity}
                                onChange={(e) => setSelectedCity(e.target.value)}
                                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-primary"
                            >
                                <option value="">All Cities</option>
                                {availableCities.map((city) => (
                                    <option key={city} value={city}>
                                        {city}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <p className="text-sm font-semibold text-white/90">
                                Visiting Officers: {visitingOfficers.length}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {activeTab === "details"
                                    ? "The details view shows past 30 days coverage. Click any day circle to open visit details."
                                    : "The report view shows visit rows for the selected date range and lets you download CSV or PDF."}
                            </p>
                        </div>
                    </div>
                )}

                {isRestricted && (
                    <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-3">
                        <div className="bg-black/20 border border-white/10 rounded-xl p-4 flex flex-col justify-center h-[72px]">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Organization</span>
                            <div className="text-base font-bold text-white truncate opacity-70">
                                {currentUser?.effectiveOrganizationName}
                            </div>
                        </div>
                        <div className="min-w-[200px] bg-black/20 border border-white/10 rounded-xl p-4 flex flex-col justify-center h-[72px]">
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Filter Site</label>
                            <select
                                className="w-full h-9 rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                value={selectedSiteId}
                                onChange={(e) => setSelectedSiteId(e.target.value)}
                                disabled={isRestricted && (sites ?? []).length === 1}
                            >
                                {!(isRestricted && (sites ?? []).length === 1) && (
                                    <option value="">All Sites</option>
                                )}
                                {(sites ?? []).map((s: any) => (
                                    <option key={s._id} value={s._id}>{s.name || s.locationName}</option>
                                ))}
                            </select>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-4 flex flex-col justify-center h-[72px]">
                            <p className="text-sm font-semibold text-white/90">
                                Visiting Officers: {visitingOfficers.length}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                                Detailed visibility for authorized sites only.
                            </p>
                        </div>
                    </div>
                )}

                {activeTab === "details" && (
                    <div className="glass rounded-2xl border border-white/10 overflow-hidden">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full min-w-[1400px] border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5 bg-white/[0.02]">
                                        <th className="sticky left-0 z-10 min-w-[220px] bg-neutral-950 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            By Officer
                                        </th>
                                        {past30Days.map((day) => (
                                            <th key={day.key} className="px-2 py-4 text-center">
                                                <div className="text-xs font-semibold text-white/80">{day.day}</div>
                                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                                    {day.weekday}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {visitingOfficers.map((officer: any) => (
                                        <tr key={officer._id} className="hover:bg-white/[0.02]">
                                            <td className="sticky left-0 z-10 bg-neutral-950 px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5">
                                                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium text-white/90">{officer.name}</div>
                                                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                                            {officer.regionId || "No Region"} / {officer.cities?.join(", ") || "All Cities"}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            {past30Days.map((day) => {
                                                const logsForDay = dailyCountsByOfficer.get(officer._id)?.[day.key] ?? [];
                                                const count = logsForDay.length;

                                                return (
                                                    <td key={`${officer._id}-${day.key}`} className="px-2 py-3 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => count > 0 && setSelectedDayDetails({
                                                                officerName: officer.name,
                                                                dateLabel: day.fullLabel,
                                                                logs: logsForDay,
                                                            })}
                                                            className={cn(
                                                                "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition",
                                                                count > 0
                                                                    ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white"
                                                                    : "cursor-default bg-rose-500/20 text-rose-300"
                                                            )}
                                                        >
                                                            {count}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    {visitingOfficers.length === 0 && (
                                        <tr>
                                            <td colSpan={31} className="px-6 py-12 text-center text-sm text-muted-foreground">
                                                No visiting officers found for the selected region and city.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === "report" && (
                    <div className="space-y-4">
                        {!selectedRegionId && (
                            <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
                                Choose a region (or ensure your profile has a region) to load the visit report.
                            </p>
                        )}

                        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                            {isAdmin && (
                                <div className="grid gap-4 md:grid-cols-3">
                                    <label className="space-y-2">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filter Organization</span>
                                        <select
                                            value={selectedOrganizationId}
                                            onChange={(e) => setSelectedOrganizationId(e.target.value)}
                                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-primary"
                                        >
                                            <option value="">All Organizations</option>
                                            {(orgs ?? []).map((o: any) => (
                                                <option key={o._id} value={o._id}>{o.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <div className="md:col-span-2" />
                                </div>
                            )}
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">From Date</span>
                                    <input
                                        type="date"
                                        value={reportFromDate}
                                        onChange={(e) => setReportFromDate(e.target.value)}
                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-primary"
                                    />
                                </label>

                                <label className="space-y-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">To Date</span>
                                    <input
                                        type="date"
                                        value={reportToDate}
                                        onChange={(e) => setReportToDate(e.target.value)}
                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-primary"
                                    />
                                </label>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => void downloadCsv()}
                                    disabled={exportBusy || !selectedRegionId || reportFromMs > reportToMs}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <FileSpreadsheet className="h-4 w-4" />
                                    {exportBusy ? "Working…" : "Download CSV"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => void downloadPdf()}
                                    disabled={exportBusy || !selectedRegionId || reportFromMs > reportToMs}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <FileText className="h-4 w-4" />
                                    {exportBusy ? "Working…" : "Download PDF"}
                                </button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                CSV includes direct photo URLs for each visit.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex flex-wrap gap-2">
                                {([
                                    { key: "all", label: "All" },
                                    { key: "pending", label: "Pending" },
                                    { key: "approved", label: "Approved" },
                                    { key: "rejected", label: "Rejected" },
                                    { key: "inside", label: "Inside" },
                                    { key: "exited", label: "Exited" },
                                ] as const).map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => setVisitorStatusFilter(item.key)}
                                        className={cn(
                                            "rounded-xl border px-4 py-2 text-xs font-semibold transition",
                                            visitorStatusFilter === item.key
                                                ? "border-primary/40 bg-primary/20 text-primary"
                                                : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-1.5 rounded-2xl bg-white/5 p-1 border border-white/10">
                                {([
                                    { key: "all", label: "All Logs" },
                                    { key: "person", label: "People" },
                                    { key: "vehicle", label: "Vehicles" },
                                ] as const).map((item) => (
                                    <button
                                        key={item.key}
                                        onClick={() => setCategoryFilter(item.key)}
                                        className={cn(
                                            "rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-all",
                                            categoryFilter === item.key
                                                ? "bg-primary text-white shadow-lg"
                                                : "text-muted-foreground hover:text-white"
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="glass rounded-2xl border border-white/10 overflow-hidden">
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full min-w-[900px] text-left">
                                    <thead>
                                        <tr className="border-b border-white/5 bg-white/[0.02]">
                                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visitor Name</th>
                                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Flat/Site</th>
                                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">People</th>
                                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vehicle</th>
                                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target Client</th>
                                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Photo</th>
                                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {(visitorsByStatus ?? [])
                                            .filter((log: any) => {
                                                if (categoryFilter === "vehicle") return !!log.vehicleNumber;
                                                if (categoryFilter === "person") return !log.vehicleNumber;
                                                return true;
                                            })
                                            .map((log: any) => {
                                                const status = log.status || "pending";
                                            return (
                                                <tr key={log._id} className="hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-4 py-4">
                                                        <div className="text-sm font-medium text-white/90">{log.visitorName || "N/A"}</div>
                                                        <div className="text-[10px] text-muted-foreground">By: {log.userName}</div>
                                                    </td>
                                                    <td className="px-4 py-4 text-sm text-white/80">{log.flat || "N/A"}</td>
                                                    <td className="px-4 py-4 text-sm text-white/80">{log.numberOfPeople || 1}</td>
                                                    <td className="px-4 py-4 text-sm text-white/80">{log.vehicleNumber || "—"}</td>
                                                    <td className="px-4 py-4 text-sm text-white/80">{log.targetUserName || "—"}</td>
                                                    <td className="px-4 py-4">
                                                        {log.photoUrl ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedImage(log.photoUrl)}
                                                                className="h-10 w-10 overflow-hidden rounded-lg border border-white/10 bg-black/40 transition hover:border-primary/50"
                                                            >
                                                                <img src={log.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className={cn(
                                                            "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                                                            getStatusBadgeClass(status)
                                                        )}>
                                                            {status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex items-center gap-2">
                                                            {status === "pending" && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleVisitorStatusAction(log._id, "approved")}
                                                                        className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500 hover:text-white transition"
                                                                    >
                                                                        Approve
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleVisitorStatusAction(log._id, "rejected")}
                                                                        className="rounded-lg bg-rose-500/20 px-2 py-1 text-[10px] font-bold text-rose-400 hover:bg-rose-500 hover:text-white transition"
                                                                    >
                                                                        Reject
                                                                    </button>
                                                                </>
                                                            )}
                                                            {status === "approved" && (
                                                                <button
                                                                    onClick={() => handleVisitorStatusAction(log._id, "inside")}
                                                                    className="rounded-lg bg-blue-500/20 px-2 py-1 text-[10px] font-bold text-blue-400 hover:bg-blue-500 hover:text-white transition"
                                                                >
                                                                    Mark Inside
                                                                </button>
                                                            )}
                                                            {status === "inside" && (
                                                                <button
                                                                    onClick={() => handleVisitorStatusAction(log._id, "exited")}
                                                                    className="rounded-lg bg-slate-500/20 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-500 hover:text-white transition"
                                                                >
                                                                    Mark Exit
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {visitorsByStatus && visitorsByStatus.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground">
                                                    No visitors found for this status.
                                                </td>
                                            </tr>
                                        )}
                                        {!organizationId && (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground">
                                                    Organization context is required to load visitors.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {selectedRegionId && visitReportPage && visitReportPage.total > REPORT_PAGE_SIZE && (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                                <p className="text-xs text-muted-foreground">
                                    Page {reportPageIndex + 1} of {Math.max(1, Math.ceil(visitReportPage.total / REPORT_PAGE_SIZE))}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        disabled={reportPageIndex <= 0}
                                        onClick={() => setReportPageIndex((p) => Math.max(0, p - 1))}
                                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/10 disabled:opacity-40"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!visitReportPage.hasMore}
                                        onClick={() => setReportPageIndex((p) => p + 1)}
                                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/10 disabled:opacity-40"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {selectedDayDetails && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
                    onClick={() => setSelectedDayDetails(null)}
                >
                    <div
                        className="relative max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] p-4">
                            <div>
                                <h3 className="text-sm font-semibold text-white/90">{selectedDayDetails.officerName}</h3>
                                <p className="text-xs text-muted-foreground">{selectedDayDetails.dateLabel}</p>
                            </div>
                            <button
                                onClick={() => setSelectedDayDetails(null)}
                                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="max-h-[70vh] overflow-y-auto p-4">
                            <div className="grid gap-4">
                                {selectedDayDetails.logs.map((log: any) => {
                                    const site = siteLookup.get(log.siteId);
                                    return (
                                        <div key={log._id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <div>
                                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Site</p>
                                                    <p className="text-sm text-white/90">{log.siteName}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Region / City</p>
                                                    <p className="text-sm text-white/90">{site?.regionId || "-"} / {site?.city || "-"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Point</p>
                                                    <p className="text-sm text-white/90">{log.pointName || "Visit Scan"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Check-in</p>
                                                    <p className="text-sm text-white/90">{new Date(log.createdAt ?? log._creationTime).toLocaleString()}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Check-out</p>
                                                    <p className="text-sm text-white/90">
                                                        {log.checkOutAt ? new Date(log.checkOutAt).toLocaleString() : "—"}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Purpose / notes</p>
                                                    <p className="text-sm text-white/90">{log.remark || "Regular Inspection"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Visit Type</p>
                                                    <p className="flex items-center gap-2 text-sm text-white/90">
                                                        <VisitTypeIcon visitType={log.visitType} />
                                                        {log.visitType || "General"}
                                                    </p>
                                                </div>
                                            </div>
                                            {(() => {
                                                const fromArr = (log.imageUrls as string[] | undefined)?.filter(Boolean) ?? [];
                                                const urls = fromArr.length > 0 ? fromArr : log.imageUrl ? [log.imageUrl] : [];
                                                if (!urls.length) return null;
                                                return (
                                                    <div className="mt-4 flex flex-wrap gap-2">
                                                        {urls.map((url: string, i: number) => (
                                                            <button
                                                                key={`${log._id}-d-${i}`}
                                                                type="button"
                                                                onClick={() => setSelectedImage(url)}
                                                                className="h-20 w-20 overflow-hidden rounded-xl border border-white/10 bg-black/40 transition hover:border-primary/50"
                                                            >
                                                                <img src={url} alt="" className="h-full w-full object-cover" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {selectedImage && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setSelectedImage(null)}
                >
                    <div 
                        className="relative max-w-4xl w-full bg-neutral-900 rounded-2xl border border-white/10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-2 text-white/90">
                                <ImageIcon className="w-4 h-4 text-primary" />
                                <span className="text-sm font-semibold">Visit Upload View</span>
                            </div>
                            <button 
                                onClick={() => setSelectedImage(null)}
                                className="p-1 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-2 bg-black/40 flex items-center justify-center min-h-[300px] max-h-[70vh]">
                            <img 
                                src={selectedImage} 
                                alt="Visit Log Attachment" 
                                className="max-w-full max-h-full object-contain rounded-lg shadow-inner"
                            />
                        </div>
                        <div className="p-4 bg-white/[0.02] border-t border-white/5 flex justify-end">
                            <button 
                                onClick={() => setSelectedImage(null)}
                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-semibold text-white hover:bg-white/10 transition-colors"
                            >
                                Close Preview
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
