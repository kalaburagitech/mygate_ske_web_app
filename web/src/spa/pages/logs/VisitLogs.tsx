import { useEffect, useMemo, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../../services/convex";
import { Layout } from "../../../components/Layout";
import {
    FileSpreadsheet,
    FileText,
    Image as ImageIcon,
    Users,
    X,
    Filter,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useUser } from "@clerk/nextjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

function VisitorsPageSkeleton() {
    return (
        <div className="space-y-6 animate-pulse p-6">
            <div className="h-10 w-64 bg-white/10 rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-24 bg-white/5 rounded-2xl border border-white/10" />
                ))}
            </div>
            <div className="h-[500px] bg-white/[0.02] rounded-2xl border border-white/10" />
        </div>
    );
}

export default function VisitLogs() {
    const { user } = useUser();
    const convex = useConvex();
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [selectedRegionId, setSelectedRegionId] = useState("");
    const [selectedCity, setSelectedCity] = useState("");
    const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
    const [selectedSiteId, setSelectedSiteId] = useState("");

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
    const isAdmin = (currentUser?.roles || []).some((r: string) => ["Owner", "Deployment Manager", "Manager"].includes(r));

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

    const reportFromMs = useMemo(() => parseVisitDayStart(reportFromDate), [reportFromDate]);
    const reportToMs = useMemo(() => parseVisitDayEnd(reportToDate), [reportToDate]);

    // Use a separate query for the paginated report logs
    const visitReportPage = useQuery(
        api.logs.listVisitLogsPage,
        organizationId && selectedRegionId && reportFromMs <= reportToMs
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

    const visitorsByStatusQuery = useQuery(
        api.logs.getVisitorsByStatus,
        organizationId
            ? {
                organizationId: (selectedOrganizationId as Id<"organizations">) || organizationId,
                status: visitorStatusFilter,
                requestingUserId: currentUser?._id,
                excludeOfficerVisits: true,
            }
            : "skip"
    );

    // Filter out officer visits from the visitors tab
    const visitorsByStatus = useMemo(() => {
        const officerVisitTypes = ['SiteCheckDay', 'SiteCheckNight', 'Trainer'];
        return (visitorsByStatusQuery ?? []).filter((log: any) => 
            !officerVisitTypes.includes(log.visitType || '')
        );
    }, [visitorsByStatusQuery]);

    const visitorStatusCounts = useQuery(
        api.logs.getVisitorStatusCounts,
        organizationId
            ? {
                organizationId: (selectedOrganizationId as Id<"organizations">) || organizationId,
                requestingUserId: currentUser?._id,
                excludeOfficerVisits: true,
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
        // Filter out officer visits in export too
        const officerVisitTypes = ['SiteCheckDay', 'SiteCheckNight', 'Trainer'];
        return (items as any[]).filter(log => !officerVisitTypes.includes(log.visitType || ''));
    };

    const fetchExportRows = async () => {
        const items = await fetchExportVisitItems();
        return items.map((log) => {
            const fromArr = (log.imageUrls as string[] | undefined)?.filter(Boolean) ?? [];
            const urls = fromArr.length > 0 ? fromArr : log.imageUrl ? [log.imageUrl] : [];
            return {
                visitor: log.visitorName || "N/A",
                site: log.flat || log.siteName || "",
                notes: log.remark || "",
                visitType: log.visitType || "General",
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
            const headers = ["Visitor", "Site/Flat", "Notes", "Type", "Check-in", "Check-out", "Photos"];
            const escapeCsv = (value: string) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
            const content = [
                headers.map(escapeCsv).join(","),
                ...rows.map((row) =>
                    [row.visitor, row.site, row.notes, row.visitType, row.checkIn, row.checkOut, row.photoUrls]
                        .map(escapeCsv).join(",")
                ),
            ].join("\n");
            const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `visitor-report-${reportFromDate}-to-${reportToDate}.csv`;
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
            doc.text("Visitor Log Report", 14, 18);
            doc.setFontSize(10);
            doc.text(`Range: ${reportFromDate} to ${reportToDate}`, 14, 26);
            autoTable(doc, {
                startY: 32,
                head: [["Visitor", "Site/Flat", "Notes", "Type", "Check-in", "Check-out"]],
                body: rows.map((row) => [row.visitor, row.site, row.notes, row.visitType, row.checkIn, row.checkOut]),
                styles: { fontSize: 8 },
                headStyles: { fillColor: [59, 130, 246] },
            });
            doc.save(`visitor-report-${reportFromDate}-to-${reportToDate}.pdf`);
        } finally {
            setExportBusy(false);
        }
    };

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

    if (currentUser === undefined || regions === undefined || visitorsByStatusQuery === undefined) {
        return (
            <Layout title="Visitors">
                <VisitorsPageSkeleton />
            </Layout>
        );
    }

    return (
        <Layout title="Visitors">
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                            <Users className="w-8 h-8 text-primary" />
                            Guest & Vehicle Visitors
                        </h2>
                        <p className="text-muted-foreground mt-1">
                            Manage visitor access and vehicle logs. {visitorStatusCounts?.pending ?? 0} Requests waiting for approval.
                        </p>
                    </div>
                </div>

                {/* Stat Cards */}
                <div className="grid gap-4 md:grid-cols-4">
                    <div className="p-4 rounded-3xl border border-white/10 bg-white/[0.02]">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Visitors</p>
                        <p className="text-2xl font-black text-white">{visitorStatusCounts?.all ?? 0}</p>
                    </div>
                    <div className="p-4 rounded-3xl border border-amber-500/20 bg-amber-500/5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Wait Approval</p>
                        <p className="text-2xl font-black text-amber-400">{visitorStatusCounts?.pending ?? 0}</p>
                    </div>
                    <div className="p-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Currently Inside</p>
                        <p className="text-2xl font-black text-emerald-400">{visitorStatusCounts?.inside ?? 0}</p>
                    </div>
                    <div className="p-4 rounded-3xl border border-white/10 bg-white/[0.02]">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recent Exits</p>
                        <p className="text-2xl font-black text-white">{visitorStatusCounts?.exited ?? 0}</p>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-4 p-5 rounded-3xl border border-white/10 bg-white/[0.02]">
                    {isAdmin && (
                        <select
                            value={selectedOrganizationId}
                            onChange={(e) => {
                                setSelectedOrganizationId(e.target.value);
                                setSelectedRegionId("");
                            }}
                            className="rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white outline-none focus:border-primary/50"
                        >
                            <option value="">All Organizations</option>
                            {(orgs ?? []).map((o: any) => (
                                <option key={o._id} value={o._id}>{o.name}</option>
                            ))}
                        </select>
                    )}
                    <select
                        value={selectedRegionId}
                        onChange={(e) => setSelectedRegionId(e.target.value)}
                        className="rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white outline-none focus:border-primary/50"
                    >
                        <option value="">All Regions</option>
                        {(regions ?? []).map((r: any) => (
                            <option key={r._id} value={r.regionId}>{r.regionName}</option>
                        ))}
                    </select>

                    <div className="h-8 w-px bg-white/10 mx-2" />

                    <div className="flex gap-1.5 p-1 bg-black/20 rounded-2xl border border-white/5">
                        {([
                            { key: "all", label: "All" },
                            { key: "pending", label: "Pending" },
                            { key: "approved", label: "Approved" },
                            { key: "inside", label: "Inside" },
                        ] as const).map((item) => (
                            <button
                                key={item.key}
                                onClick={() => setVisitorStatusFilter(item.key)}
                                className={cn(
                                    "px-4 py-1.5 rounded-xl text-[11px] font-black uppercase transition-all",
                                    visitorStatusFilter === item.key ? "bg-primary text-white" : "text-muted-foreground hover:text-white"
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                        <div className="flex gap-1.5 p-1 bg-black/20 rounded-2xl border border-white/5 ml-auto">
                            <button
                                onClick={() => setCategoryFilter("all")}
                                className={cn(
                                    "px-4 py-1.5 rounded-xl text-[11px] font-black uppercase transition-all",
                                    categoryFilter === "all" ? "bg-white/10 text-white shadow-lg" : "text-muted-foreground hover:text-white"
                                )}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setCategoryFilter("person")}
                                className={cn(
                                    "px-4 py-1.5 rounded-xl text-[11px] font-black uppercase transition-all",
                                    categoryFilter === "person" ? "bg-white/10 text-white shadow-lg" : "text-muted-foreground hover:text-white"
                                )}
                            >
                                People
                            </button>
                            <button
                                onClick={() => setCategoryFilter("vehicle")}
                                className={cn(
                                    "px-4 py-1.5 rounded-xl text-[11px] font-black uppercase transition-all",
                                    categoryFilter === "vehicle" ? "bg-white/10 text-white shadow-lg" : "text-muted-foreground hover:text-white"
                                )}
                            >
                                Vehicles
                            </button>
                        </div>
                </div>

                {/* Visitors Table */}
                <div className="glass rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full min-w-[1000px] text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/[0.03]">
                                    <th className="px-6 py-5 text-[11px] font-black uppercase tracking-widest text-muted-foreground">Visitor Identity</th>
                                    <th className="px-6 py-5 text-[11px] font-black uppercase tracking-widest text-muted-foreground">Location</th>
                                    <th className="px-6 py-5 text-[11px] font-black uppercase tracking-widest text-muted-foreground">People/Vehicle</th>
                                    <th className="px-6 py-5 text-[11px] font-black uppercase tracking-widest text-muted-foreground">Target Client</th>
                                    <th className="px-6 py-5 text-[11px] font-black uppercase tracking-widest text-muted-foreground">Status</th>
                                    <th className="px-6 py-5 text-[11px] font-black uppercase tracking-widest text-muted-foreground">Evidence</th>
                                    <th className="px-6 py-5 text-[11px] font-black uppercase tracking-widest text-muted-foreground text-right">Control</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {visitorsByStatus
                                    .filter(log => {
                                        if (categoryFilter === "vehicle") return !!log.vehicleNumber;
                                        if (categoryFilter === "person") return !log.vehicleNumber;
                                        return true;
                                    })
                                    .map((log: any) => (
                                    <tr key={log._id} className="group hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                                                    {log.vehicleNumber ? (
                                                        <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.9A2 2 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
                                                    ) : (
                                                        <Users className="w-4 h-4 text-emerald-400" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-black text-white">{log.visitorName || "N/A"}</div>
                                                    <div className="text-[10px] font-bold text-muted-foreground/60 uppercase">Logged By: {log.userName}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="text-sm font-bold text-white/80">{log.flat || "N/A"}</div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                {log.vehicleNumber ? (
                                                    <span className="px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-[10px] font-black text-primary">
                                                        {log.vehicleNumber}
                                                    </span>
                                                ) : (
                                                    <span className="text-sm font-bold text-white/60">{log.numberOfPeople || 1} Person(s)</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-sm font-bold text-white/70">{log.targetUserName || "—"}</td>
                                        <td className="px-6 py-5">
                                            <span className={cn(
                                                "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider",
                                                getStatusBadgeClass(log.status || "pending")
                                            )}>
                                                {log.status || "pending"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5">
                                            {log.photoUrl ? (
                                                <button
                                                    onClick={() => setSelectedImage(log.photoUrl)}
                                                    className="h-10 w-10 overflow-hidden rounded-xl border border-white/10 bg-black shadow-lg transition hover:scale-105 hover:border-primary/50"
                                                >
                                                    <img src={log.photoUrl} alt="" className="h-full w-full object-cover opacity-80" />
                                                </button>
                                            ) : <span className="text-xs text-white/20">—</span>}
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {log.status === "pending" && (
                                                    <>
                                                        <button
                                                            onClick={() => handleVisitorStatusAction(log._id, "approved")}
                                                            className="rounded-xl bg-emerald-500 font-black text-white px-4 py-2 text-[10px] uppercase shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleVisitorStatusAction(log._id, "rejected")}
                                                            className="rounded-xl bg-rose-500 font-black text-white px-4 py-2 text-[10px] uppercase shadow-lg shadow-rose-500/20 hover:bg-rose-600 transition"
                                                        >
                                                            Reject
                                                        </button>
                                                    </>
                                                )}
                                                {log.status === "approved" && (
                                                    <button
                                                        onClick={() => handleVisitorStatusAction(log._id, "inside")}
                                                        className="rounded-xl bg-blue-500 font-black text-white px-4 py-2 text-[10px] uppercase hover:bg-blue-600 transition"
                                                    >
                                                        Mark Inside
                                                    </button>
                                                )}
                                                {log.status === "inside" && (
                                                    <button
                                                        onClick={() => handleVisitorStatusAction(log._id, "exited")}
                                                        className="rounded-xl bg-slate-600 font-black text-white px-4 py-2 text-[10px] uppercase hover:bg-slate-700 transition"
                                                    >
                                                        Mark Exit
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Lightbox */}
            {selectedImage && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200"
                    onClick={() => setSelectedImage(null)}
                >
                    <div className="relative max-w-4xl w-full">
                        <img src={selectedImage} alt="Visitor" className="max-w-full max-h-[80vh] object-contain rounded-3xl border border-white/10 shadow-2xl" />
                        <button onClick={() => setSelectedImage(null)} className="absolute -top-4 -right-4 bg-white/10 p-2 rounded-full text-white hover:bg-white/20 transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            )}
        </Layout>
    );
}
