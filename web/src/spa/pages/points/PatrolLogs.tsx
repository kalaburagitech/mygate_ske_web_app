import { useCallback, useEffect, useMemo, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "../../../services/convex";
import { Download, FileText, Loader2, MapPin, X } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useUser } from "@clerk/nextjs";
import type { Id } from "../../../../convex/_generated/dataModel";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

const PAGE_SIZE = 25;

function parseLocalDayEnd(iso: string): number {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function parseLocalDayStart(iso: string): number {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function defaultToIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function formatDurationMs(ms: number): string {
    if (!ms || ms < 0) return "—";
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h > 0) return `${h}h ${min}m`;
    return `${min} min`;
}

function downloadAsCsv(headers: string[], rows: string[][], filename: string) {
    const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...rows.map((row) => row.map(esc).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function generatePatrolRoundsPdf(headers: string[], rows: string[][], title: string) {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(11);
    doc.text(title, 14, 16);
    autoTable(doc, {
        startY: 22,
        head: [headers],
        body: rows,
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [30, 41, 59] },
    });
    return doc;
}

export default function PatrolLogs({ selectedSiteId }: { selectedSiteId: string }) {
    const { user } = useUser();
    const convex = useConvex();
    const [detailSessionId, setDetailSessionId] = useState<Id<"patrolSessions"> | null>(null);
    const [pageIndex, setPageIndex] = useState(0);
    const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

    const today = new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setDate(defaultFrom.getDate() - 60);

    const [fromDate, setFromDate] = useState(defaultToIso(defaultFrom));
    const [toDate, setToDate] = useState(defaultToIso(today));

    const currentUser = useQuery(
        api.users.getByClerkId,
        user?.id ? { clerkId: user.id } : "skip"
    );
    const organizationId = currentUser?.organizationId;

    const fromMs = useMemo(() => parseLocalDayStart(fromDate), [fromDate]);
    const toMs = useMemo(() => parseLocalDayEnd(toDate), [toDate]);

    const siteIdsForQuery = useMemo((): Id<"sites">[] | undefined => {
        if (selectedSiteId && selectedSiteId !== "all") {
            return [selectedSiteId as Id<"sites">];
        }
        return undefined; 
    }, [selectedSiteId]);

    const roundsPage = useQuery(
        api.patrolSessions.listPatrolRoundsPage,
        organizationId && fromMs <= toMs ? {
            organizationId,
            fromMs,
            toMs,
            siteIds: siteIdsForQuery,
            offset: pageIndex * PAGE_SIZE,
            limit: PAGE_SIZE,
            requestingUserId: currentUser?._id
        } : "skip"
    );

    const sessionDetail = useQuery(
        api.patrolSessions.getSessionDetail,
        detailSessionId ? { sessionId: detailSessionId } : "skip"
    );

    useEffect(() => {
        setPageIndex(0);
    }, [fromDate, toDate, selectedSiteId, organizationId]);

    const loadingPage = roundsPage === undefined;
    const items = roundsPage?.items ?? [];
    const total = roundsPage?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const runExport = useCallback(
        async (kind: "csv" | "pdf") => {
            if (!organizationId || fromMs > toMs) return;
            setExporting(kind);
            try {
                const { items } = await convex.query(
                    api.patrolSessions.listPatrolRoundsExport,
                    {
                        organizationId,
                        fromMs,
                        toMs,
                        siteIds: siteIdsForQuery,
                        maxRows: 2500,
                        requestingUserId: currentUser?._id
                    }
                );

                const headers = [
                    "Site",
                    "Officer",
                    "Emp ID",
                    "Started",
                    "Ended",
                    "Duration",
                    "Scans",
                    "Distance m",
                    "Route",
                ];

                const rows = items.map((r: (typeof items)[number]) => [
                    r.siteName,
                    r.guardName,
                    r.guardEmpId ?? "",
                    new Date(r.startTime).toLocaleString(),
                    r.endTime ? new Date(r.endTime).toLocaleString() : "",
                    formatDurationMs(r.durationMs),
                    String(r.scanCount),
                    String(r.totalDistanceM),
                    r.pointTrail ?? "",
                ]);

                const stamp = `${fromDate}_to_${toDate}`;
                if (kind === "csv") {
                    downloadAsCsv(headers, rows, `Patrol_Rounds_${stamp}.csv`);
                } else {
                    const doc = generatePatrolRoundsPdf(headers, rows, `Patrol Rounds Export`);
                    doc.save(`Patrol_Rounds_${stamp}.pdf`);
                }
                toast.success(`Exported ${items.length} records`);
            } catch (err) {
                console.error("Export failed", err);
                toast.error("Export failed");
            } finally {
                setExporting(null);
            }
        },
        [organizationId, fromMs, toMs, siteIdsForQuery, convex, currentUser?._id, fromDate, toDate]
    );

    if (currentUser === undefined) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    if (!organizationId) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-sm text-center max-w-md mx-auto">
                Join or set up an organization to view patrol reports.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-6">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Patrol Reports</h2>
                        <p className="text-xs text-muted-foreground mt-1">Review finalized patrol sessions and round completion</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={exporting !== null || fromMs > toMs}
                            onClick={() => runExport("csv")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/70 hover:bg-white/10 disabled:opacity-40"
                        >
                            {exporting === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            CSV
                        </button>
                        <button
                            disabled={exporting !== null || fromMs > toMs}
                            onClick={() => runExport("pdf")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-40"
                        >
                            {exporting === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                            PDF
                        </button>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 bg-white/5 border border-white/10 p-3 rounded-xl">
                    <label className="space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">From</span>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">To</span>
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white"
                        />
                    </label>
                </div>
            </div>

            {fromMs > toMs && (
                <p className="text-xs text-amber-500">“From” date must be on or before “To” date.</p>
            )}

            {loadingPage && (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-7 h-7 text-primary animate-spin" />
                </div>
            )}

            {!loadingPage && fromMs <= toMs && (
                <>
                    {items.length === 0 ? (
                        <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-white/10 p-4">
                            No patrol rounds found for the selected site and date range.
                        </p>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                <span>
                                    <span className="text-white/80 font-medium">{total}</span> session{total === 1 ? "" : "s"} · page <span className="text-white/80 font-medium">{pageIndex + 1}</span> / {totalPages}
                                </span>
                                <div className="flex gap-1">
                                    <button
                                        type="button"
                                        disabled={pageIndex <= 0}
                                        onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                                        className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/5 disabled:opacity-30"
                                    >
                                        Prev
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!roundsPage?.hasMore}
                                        onClick={() => setPageIndex((p) => p + 1)}
                                        className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/5 disabled:opacity-30"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>

                            <div className="w-full overflow-x-auto rounded-xl border border-white/10">
                                <table className="w-full min-w-[900px] text-left text-[11px]">
                                    <thead>
                                        <tr className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-wider text-muted-foreground">
                                            <th className="px-2 py-2 font-semibold">Site</th>
                                            <th className="px-2 py-2 font-semibold">Officer</th>
                                            <th className="px-2 py-2 font-semibold">Ended</th>
                                            <th className="px-2 py-2 font-semibold text-center">Dur</th>
                                            <th className="px-2 py-2 font-semibold text-center">#</th>
                                            <th className="px-2 py-2 font-semibold text-center">m</th>
                                            <th className="px-2 py-2 font-semibold min-w-[180px]">Route</th>
                                            <th className="px-2 py-2 font-semibold text-right"> </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.06]">
                                        {items.map((r: any) => (
                                            <tr key={r.sessionId} className="hover:bg-white/[0.02]">
                                                <td className="px-2 py-1.5 text-white/90 font-medium">{r.siteName}</td>
                                                <td className="px-2 py-1.5">
                                                    <div className="text-white/85 leading-tight">{r.guardName}</div>
                                                    <div className="text-[10px] text-muted-foreground">{r.guardEmpId}</div>
                                                </td>
                                                <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                                                    {r.endTime ? new Date(r.endTime).toLocaleString() : "—"}
                                                </td>
                                                <td className="px-2 py-1.5 text-emerald-400/90 whitespace-nowrap text-center">
                                                    {formatDurationMs(r.durationMs)}
                                                </td>
                                                <td className="px-2 py-1.5 text-blue-400 font-medium text-center">{r.scanCount}</td>
                                                <td className="px-2 py-1.5 text-muted-foreground text-center">
                                                    {r.totalDistanceM ? Math.round(r.totalDistanceM) : 0}
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    <div className="max-w-[200px] truncate text-muted-foreground" title={r.pointTrail}>
                                                        {r.pointTrail || "—"}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-1.5 text-right">
                                                    <button
                                                        onClick={() => setDetailSessionId(r.sessionId)}
                                                        className="text-primary hover:text-primary/80 font-medium text-[10px] uppercase"
                                                    >
                                                        Details
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </>
            )}

            {detailSessionId && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setDetailSessionId(null)}>
                    <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white">Patrol Details</h3>
                                {sessionDetail && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                        <MapPin className="w-3 h-3" /> {sessionDetail.siteName}
                                    </p>
                                )}
                            </div>
                            <button onClick={() => setDetailSessionId(null)} className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {sessionDetail === undefined ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="w-7 h-7 text-primary animate-spin" />
                            </div>
                        ) : sessionDetail === null ? (
                            <p className="text-sm text-red-400">Could not load session details.</p>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <div>
                                        <span className="text-[10px] text-muted-foreground uppercase">Officer</span>
                                        <p className="text-xs font-semibold text-white truncate">{sessionDetail.guardName}</p>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-muted-foreground uppercase">Duration</span>
                                        <p className="text-xs font-semibold text-white">{formatDurationMs(sessionDetail.session.durationMs)}</p>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-muted-foreground uppercase">Scans</span>
                                        <p className="text-xs font-semibold text-white">{sessionDetail.scanCount}</p>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-muted-foreground uppercase">Distance</span>
                                        <p className="text-xs font-semibold text-white">{sessionDetail.totalDistanceM}m</p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Point Timeline</h4>
                                    {sessionDetail.logs.map((log: any) => (
                                        <div key={log.logId} className="p-3 rounded-lg border border-white/10 bg-white/[0.02] flex flex-col gap-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-white">#{log.order} {log.pointName}</span>
                                                <span className={cn(
                                                    "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border",
                                                    log.withinRange 
                                                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" 
                                                        : "bg-red-500/15 text-red-400 border-red-500/25"
                                                )}>
                                                    {log.withinRange ? "In Range" : "Far"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                                                <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                                                <span>{log.distance?.toFixed(1)}m from center</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
