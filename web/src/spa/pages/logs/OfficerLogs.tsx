import { useEffect, useMemo, useState, useRef } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "../../../services/convex";
import { Layout } from "../../../components/Layout";
import {
    Image as ImageIcon,
    Moon,
    Sun,
    UserCheck,
    X,
    ShieldCheck,
    MapPin,
    Calendar,
    ExternalLink,
    Clock,
    Camera,
    Building,
    FileText,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useUser } from "@clerk/nextjs";
import { userHasRole } from "../../../lib/userRoles";
import type { Id } from "../../../../convex/_generated/dataModel";

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
    if (visitType === "Trainer") return <ShieldCheck className={`${cls} text-sky-400`} aria-hidden />;
    return null;
}

function OfficerLogsSkeleton() {
    return (
        <div className="space-y-6 animate-pulse p-6">
            <div className="h-10 w-64 bg-white/10 rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-24 bg-white/5 rounded-2xl border border-white/10" />
                ))}
            </div>
            <div className="h-[400px] bg-white/[0.02] rounded-2xl border border-white/10" />
        </div>
    );
}

export default function OfficerLogs() {
    const { user } = useUser();
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [selectedRegionId, setSelectedRegionId] = useState("");
    const [selectedCity, setSelectedCity] = useState("");
    const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
    const [selectedDayDetails, setSelectedDayDetails] = useState<{
        officerName: string;
        dateLabel: string;
        logs: any[];
    } | null>(null);

    const [focusedOfficerId, setFocusedOfficerId] = useState<string | null>(null);
    const [focusedDateKey, setFocusedDateKey] = useState<string | null>(null);
    const [focusedVisitType, setFocusedVisitType] = useState<string | null>(null);
    const [isDetailView, setIsDetailView] = useState(false);
    const feedRef = useRef<HTMLDivElement>(null);

    const currentUser = useQuery(api.users.getByClerkId,
        user?.id ? { clerkId: user.id } : "skip"
    );
    const organizationId = currentUser?.organizationId;
    const isRestricted = (currentUser?.roles || []).some((r: string) => ["Client", "SO"].includes(r));
    const isAdmin = (currentUser?.roles || []).some((r: string) => ["Owner", "Deployment Manager", "Manager"].includes(r));

    const orgUsers = useQuery(
        api.users.listByOrg,
        (selectedOrganizationId || organizationId) ? { 
            organizationId: (selectedOrganizationId as Id<"organizations">) || organizationId 
        } : "skip"
    );
    const regions = useQuery(api.regions.list, {});
    const orgs = useQuery(api.organizations.list, (selectedOrganizationId || organizationId) ? { 
        requestingUserId: currentUser?._id 
    } : "skip");
    const sites = useQuery(
        api.sites.listSitesByOrg,
        (selectedOrganizationId || organizationId)
            ? { 
                organizationId: (selectedOrganizationId as Id<"organizations">) || organizationId, 
                regionId: selectedRegionId || undefined,
                requestingUserId: currentUser?._id
            }
            : "skip"
    );

    const visitLogs = useQuery(
        api.logs.listOfficerVisitLogs,
        (selectedOrganizationId || organizationId)
            ? {
                organizationId: (selectedOrganizationId as Id<"organizations">) || organizationId,
                regionId: selectedRegionId || undefined,
                city: selectedCity || undefined,
                requestingUserId: currentUser?._id,
                limit: 500
            }
            : "skip"
    );

    useEffect(() => {
        if (currentUser?.regionId && !selectedRegionId) {
            setSelectedRegionId(currentUser.regionId);
        }
    }, [currentUser?.regionId, selectedRegionId]);

    const availableCities = useMemo(() => {
        if (!selectedRegionId) {
            const cities = (regions ?? []).flatMap((region: any) => region.cities ?? []);
            return Array.from(new Set(cities.filter(Boolean))).sort();
        }
        const region = (regions ?? []).find((item: any) => item.regionId === selectedRegionId);
        return Array.from(new Set((region?.cities ?? []).filter(Boolean))).sort();
    }, [regions, selectedRegionId]);

    const visitingOfficers = useMemo(() => {
        const officerRoles = ["Visiting Officer", "Deployment Manager", "Owner", "Manager"];
        return (orgUsers ?? []).filter((officer: any) => {
            const hasOfficerRole = (officer.roles || []).some((r: string) => officerRoles.includes(r));
            if (!hasOfficerRole || officer.status === "inactive") {
                return false;
            }
            const matchesRegion = !selectedRegionId || officer.regionId === selectedRegionId;
            const matchesCity = !selectedCity || !officer.cities?.length || officer.cities.includes(selectedCity);
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
        // Only include SiteCheckDay, SiteCheckNight, Trainer visits
        const officerVisitTypes = ['SiteCheckDay', 'SiteCheckNight', 'Trainer'];
        return (visitLogs ?? [])
            .filter((log: any) => officerIdSet.has(log.userId) && officerVisitTypes.includes(log.visitType || ''))
            .sort((a, b) => (b.createdAt ?? b._creationTime) - (a.createdAt ?? a._creationTime));
    }, [officerIdSet, visitLogs]);

    const feedLogs = useMemo(() => {
        return filteredVisitLogs.filter((log: any) => {
            const matchesOfficer = !focusedOfficerId || log.userId === focusedOfficerId;
            const logDateKey = localDayKey(new Date(log.createdAt ?? log._creationTime));
            const matchesDate = !focusedDateKey || logDateKey === focusedDateKey;
            const matchesType = !focusedVisitType || log.visitType === focusedVisitType;
            return matchesOfficer && matchesDate && matchesType;
        });
    }, [filteredVisitLogs, focusedOfficerId, focusedDateKey, focusedVisitType]);

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

    if (currentUser === undefined || regions === undefined || visitLogs === undefined) {
        return (
            <Layout title="Officer Visits">
                <OfficerLogsSkeleton />
            </Layout>
        );
    }

    return (
        <Layout title="Officer Visits">
            <div className="space-y-6">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                        Officer Activity Logs
                    </h2>
                    <p className="text-muted-foreground mt-2 max-w-2xl">
                        Monitor site inspections, night checks, and training activities. 
                        View performance coverage across the past 30 days.
                    </p>
                </div>

                {/* Filters */}
                <div className="grid gap-4 p-5 rounded-3xl border border-white/10 bg-white/[0.02] md:grid-cols-4 backdrop-blur-md">
                    {/* ... existing user selects ... */}
                    {isAdmin && (
                        <div className="space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Organization</span>
                            <select
                                value={selectedOrganizationId}
                                onChange={(e) => {
                                    setSelectedOrganizationId(e.target.value);
                                    setSelectedRegionId("");
                                    setSelectedCity("");
                                }}
                                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none transition focus:border-primary/50 hover:bg-black/60"
                            >
                                <option value="">All Organizations</option>
                                {(orgs ?? []).map((o: any) => (
                                    <option key={o._id} value={o._id}>{o.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Region</span>
                        <select
                            value={selectedRegionId}
                            onChange={(e) => {
                                setSelectedRegionId(e.target.value);
                                setSelectedCity("");
                            }}
                            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none transition focus:border-primary/50 hover:bg-black/60"
                        >
                            <option value="">All Regions</option>
                            {(regions ?? []).map((region: any) => (
                                <option key={region._id} value={region.regionId}>
                                    {region.regionName}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">City</span>
                        <select
                            value={selectedCity}
                            onChange={(e) => setSelectedCity(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none transition focus:border-primary/50 hover:bg-black/60"
                        >
                            <option value="">All Cities</option>
                            {availableCities.map((city) => (
                                <option key={city} value={city}>{city}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-4 px-4 bg-primary/10 border border-primary/20 rounded-2xl">
                        <div className="p-2 bg-primary/20 rounded-full">
                            <UserCheck className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-white/70 uppercase tracking-tighter">Active Officers</p>
                            <p className="text-xl font-black text-white leading-none">{visitingOfficers.length}</p>
                        </div>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-6 px-4 py-2">
                    {[
                        { label: "Day Check", type: "SiteCheckDay", color: "amber" },
                        { label: "Night Check", type: "SiteCheckNight", color: "indigo" },
                        { label: "Trainer Visit", type: "Trainer", color: "rose" }
                    ].map((item) => (
                        <button
                            key={item.type}
                            onClick={() => {
                                setFocusedVisitType(focusedVisitType === item.type ? null : item.type);
                                setFocusedOfficerId(null);
                                setFocusedDateKey(null);
                                setIsDetailView(true);
                            }}
                            className={cn(
                                "flex items-center gap-2 transition-all transform active:scale-95 group",
                                focusedVisitType === item.type ? "opacity-100 scale-105" : "opacity-60 hover:opacity-90"
                            )}
                        >
                            <div className={cn(
                                "w-3 h-3 rounded-full border transition-all",
                                item.color === "amber" ? "bg-amber-500/50 border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.4)]" :
                                item.color === "indigo" ? "bg-indigo-500/50 border-indigo-500/50 shadow-[0_0_8px_rgba(99,102,241,0.4)]" :
                                "bg-rose-500/50 border-rose-500/50 shadow-[0_0_8px_rgba(244,63,94,0.4)]",
                                focusedVisitType === item.type && "ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0a]"
                            )} />
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">{item.label}</span>
                        </button>
                    ))}
                    <div className="flex items-center gap-2 opacity-60">
                        <div className="w-3 h-3 rounded-full bg-cyan-500/50 border border-cyan-500/50 shadow-[0_0_8px_rgba(6,182,212,0.4)]" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Mixed Activity</span>
                    </div>
                </div>

                {!isDetailView ? (
                    /* Coverage Grid */
                    <div className="glass rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full min-w-[1400px] border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5 bg-white/[0.03]">
                                        <th className="sticky left-0 z-10 min-w-[240px] bg-[#0a0a0a] px-6 py-5 text-left text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                                            Visiting Officer
                                        </th>
                                        {past30Days.map((day) => (
                                            <th key={day.key} className="px-2 py-5 text-center min-w-[40px]">
                                                <div className="text-xs font-bold text-white/90">{day.day}</div>
                                                <div className="text-[9px] font-black tracking-tighter text-muted-foreground/60 uppercase">
                                                    {day.weekday}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {visitingOfficers.map((officer: any) => (
                                        <tr key={officer._id} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="sticky left-0 z-10 bg-[#0a0a0a] px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 group-hover:border-primary/40 transition-colors">
                                                        <UserCheck className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                                    </div>
                                                    <div>
                                                    <button 
                                                        onClick={() => {
                                                            setFocusedOfficerId(officer._id);
                                                            setFocusedDateKey(null);
                                                            setFocusedVisitType(null);
                                                            setIsDetailView(true);
                                                        }}
                                                        className="text-left group/name"
                                                    >
                                                        <div className={cn(
                                                            "text-sm font-bold transition-colors text-white group-hover/name:text-primary"
                                                        )}>
                                                            {officer.name}
                                                        </div>
                                                        <div className="text-[10px] font-bold text-muted-foreground/60 uppercase">
                                                            {officer.regionId || "N/A"} • {officer.cities?.join(", ") || "All"}
                                                        </div>
                                                    </button>
                                                    </div>
                                                </div>
                                            </td>
                                            {past30Days.map((day) => {
                                                const logsForDay = dailyCountsByOfficer.get(officer._id)?.[day.key] ?? [];
                                                const count = logsForDay.length;
                                                
                                                // Determine primary visit type for coloring
                                                const types = new Set(logsForDay.map(l => l.visitType));
                                                const hasTrainer = types.has("Trainer");
                                                const hasNight = types.has("SiteCheckNight");
                                                const hasDay = types.has("SiteCheckDay");
                                                
                                                let cellClass = "bg-white/[0.02] text-white/10 border border-white/5 cursor-default";
                                                if (count > 0) {
                                                    const typeCount = [hasTrainer, hasNight, hasDay].filter(Boolean).length;
                                                    if (typeCount > 1) {
                                                        // Mixed
                                                        cellClass = "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-500 hover:text-white shadow-[0_0_15px_rgba(6,182,212,0.2)]";
                                                    } else if (hasTrainer) {
                                                        cellClass = "bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500 hover:text-white shadow-[0_0_15px_rgba(244,63,94,0.2)]";
                                                    } else if (hasNight) {
                                                        cellClass = "bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 hover:bg-indigo-500 hover:text-white shadow-[0_0_15px_rgba(99,102,241,0.2)]";
                                                    } else if (hasDay) {
                                                        cellClass = "bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500 hover:text-white shadow-[0_0_15px_rgba(245,158,11,0.2)]";
                                                    } else {
                                                        cellClass = "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500 hover:text-white";
                                                    }
                                                }

                                                return (
                                                    <td key={`${officer._id}-${day.key}`} className="px-1 py-3 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (count > 0) {
                                                                    setFocusedOfficerId(officer._id);
                                                                    setFocusedDateKey(day.key);
                                                                    setFocusedVisitType(null);
                                                                    setIsDetailView(true);
                                                                }
                                                            }}
                                                            className={cn(
                                                                "mx-auto flex h-9 w-9 items-center justify-center rounded-2xl text-[10px] font-black transition-all transform active:scale-95",
                                                                cellClass,
                                                                focusedOfficerId === officer._id && focusedDateKey === day.key && "ring-2 ring-primary ring-offset-2 ring-offset-[#0a0a0a] scale-110 z-20"
                                                            )}
                                                        >
                                                            {count > 0 ? count : ""}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    {visitingOfficers.length === 0 && (
                                        <tr>
                                            <td colSpan={31} className="px-6 py-20 text-center">
                                                <div className="flex flex-col items-center gap-3 opacity-40">
                                                    <ShieldCheck className="w-12 h-12" />
                                                    <p className="text-sm font-medium">No active visiting officers found in this selection.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    /* Detailed Operational Feed View */
                    <div ref={feedRef} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-10 rounded-[2.5rem] bg-white/[0.02] border border-white/10 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                <FileText className="w-32 h-32 text-primary" />
                            </div>
                            
                            <div className="space-y-3 relative z-10">
                                <button 
                                    onClick={() => setIsDetailView(false)}
                                    className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary hover:text-white transition-colors"
                                >
                                    <X className="w-4 h-4 p-0.5 rounded-full bg-primary/20 group-hover:bg-white/20" />
                                    Back to Coverage Overview
                                </button>
                                <div>
                                    <h3 className="text-4xl font-black text-white leading-tight">
                                        {focusedVisitType ? 
                                            (focusedVisitType === 'SiteCheckDay' ? "Day Check Reports" : 
                                             focusedVisitType === 'SiteCheckNight' ? "Night Check Reports" : "Trainer Inspection Reports") 
                                            : (focusedOfficerId ? `${orgUsers?.find((u: any) => u._id === focusedOfficerId)?.name}'s Report` : "Detailed Operational Audit")}
                                    </h3>
                                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2 mt-2">
                                        <Calendar className="w-4 h-4" />
                                        {focusedDateKey ? `Activity on ${focusedDateKey}` : "Consolidated Chronological History"}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    setFocusedOfficerId(null);
                                    setFocusedDateKey(null);
                                    setFocusedVisitType(null);
                                }}
                                className="relative z-10 flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black text-white/60 hover:text-white hover:bg-white/10 transition-all uppercase tracking-widest"
                            >
                                <ShieldCheck className="w-4 h-4" />
                                Reset Selection
                            </button>
                        </div>

                        <div className="grid gap-8 mt-10">
                            {feedLogs.length > 0 ? (
                                feedLogs.map((log: any) => {
                                const site = siteLookup.get(log.siteId);
                                const officer = (orgUsers ?? []).find((u: any) => u._id === log.userId);
                                return (
                                    <div key={log._id} className={cn(
                                        "group relative rounded-[2.5rem] border p-8 hover:bg-white/[0.03] transition-all overflow-hidden shadow-2xl",
                                        log.visitType === 'SiteCheckDay' ? "border-amber-500/10 bg-amber-500/[0.01]" :
                                        log.visitType === 'SiteCheckNight' ? "border-indigo-500/10 bg-indigo-500/[0.01]" :
                                        log.visitType === 'Trainer' ? "border-rose-500/10 bg-rose-500/[0.01]" :
                                        "border-white/10 bg-white/[0.02]"
                                    )}>
                                         {/* Decorative Background Accent */}
                                         <div className={cn(
                                            "absolute -right-20 -top-20 h-64 w-64 rounded-full blur-[100px] pointer-events-none",
                                            log.visitType === 'SiteCheckDay' ? "bg-amber-500/5" :
                                            log.visitType === 'SiteCheckNight' ? "bg-indigo-500/5" :
                                            log.visitType === 'Trainer' ? "bg-rose-500/5" :
                                            "bg-primary/5"
                                         )} />
                                         
                                         <div className="relative grid gap-10 md:grid-cols-12">
                                             {/* Column 1: Identity & Compliance */}
                                             <div className="md:col-span-4 space-y-6">
                                                 <div className="space-y-4">
                                                     <div className="p-4 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-3">
                                                         <div className={cn(
                                                            "h-10 w-10 rounded-2xl flex items-center justify-center border",
                                                            log.visitType === 'SiteCheckDay' ? "bg-amber-500/10 border-amber-500/20" :
                                                            log.visitType === 'SiteCheckNight' ? "bg-indigo-500/10 border-indigo-500/20" :
                                                            log.visitType === 'Trainer' ? "bg-rose-500/10 border-rose-500/20" :
                                                            "bg-primary/10 border-primary/20"
                                                         )}>
                                                             <UserCheck className={cn(
                                                                "w-5 h-5",
                                                                log.visitType === 'SiteCheckDay' ? "text-amber-400" :
                                                                log.visitType === 'SiteCheckNight' ? "text-indigo-400" :
                                                                log.visitType === 'Trainer' ? "text-rose-400" :
                                                                "text-primary"
                                                             )} />
                                                         </div>
                                                         <div>
                                                             <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Officer</p>
                                                             <p className="text-sm font-bold text-white">{officer?.name || "Unknown"}</p>
                                                         </div>
                                                     </div>

                                                     <div className="space-y-2 px-1">
                                                         <p className={cn(
                                                            "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest",
                                                            log.visitType === 'SiteCheckDay' ? "text-amber-400" :
                                                            log.visitType === 'SiteCheckNight' ? "text-indigo-400" :
                                                            log.visitType === 'Trainer' ? "text-rose-400" :
                                                            "text-primary"
                                                         )}>
                                                             <Building className="w-3 h-3" /> Visit Identity
                                                         </p>
                                                         <div className="flex items-start flex-wrap gap-2">
                                                            <p className="text-2xl font-black text-white leading-tight">{log.siteName}</p>
                                                            {(log.visitType && log.visitType !== 'General') && (
                                                                <span className={cn(
                                                                    "px-3 py-1 rounded-full text-[9px] font-black tracking-wider uppercase border",
                                                                    log.visitType === 'SiteCheckDay' ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                                                                    log.visitType === 'SiteCheckNight' ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" :
                                                                    log.visitType === 'Trainer' ? "bg-rose-500/20 text-rose-400 border-rose-500/30" :
                                                                    "bg-white/10 text-white/60 border-white/10"
                                                                )}>
                                                                    {log.visitType.replace('SiteCheck', '').toUpperCase()} VISIT
                                                                </span>
                                                            )}
                                                         </div>
                                                         <p className="text-[11px] font-bold text-white/40">{site?.regionId || "-"} • {site?.city || "-"}</p>
                                                     </div>

                                                     <div className="space-y-4 pt-4 border-t border-white/5">
                                                         <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                             <MapPin className="w-3 h-3" /> GPS Tracking
                                                         </p>
                                                         {log.latitude ? (
                                                              <div className="space-y-3">
                                                                  <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                                                                      <div>
                                                                         <p className="text-[9px] font-bold text-muted-foreground uppercase">Compliance</p>
                                                                         <p className={cn(
                                                                             "text-sm font-black",
                                                                             (log.distanceFromSiteM || 0) > 200 ? "text-rose-400" : "text-emerald-400"
                                                                         )}>
                                                                             {log.distanceFromSiteM != null ? 
                                                                                 (log.distanceFromSiteM > 200 ? "OUT OF RANGE" : "ON SITE") 
                                                                                 : "GPS RECORDED"}
                                                                         </p>
                                                                      </div>
                                                                      <div className="text-right">
                                                                         <p className="text-[9px] font-bold text-muted-foreground uppercase">Accuracy</p>
                                                                         <p className="text-sm font-black text-white/80">±{Math.round(log.checkInAccuracyM || 0)}m</p>
                                                                      </div>
                                                                  </div>
                                                              </div>
                                                         ) : (
                                                              <p className="text-xs text-white/20 italic">No GPS data captured.</p>
                                                         )}
                                                     </div>
                                                 </div>
                                             </div>

                                             {/* Column 2: Timing & Professional Notes */}
                                             <div className="md:col-span-4 space-y-6 lg:border-x lg:border-white/5 lg:px-8">
                                                 <div className="space-y-4">
                                                     <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                         <Clock className="w-3 h-3" /> Timing Statistics
                                                     </p>
                                                     <div className="grid grid-cols-2 gap-4">
                                                         <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                                                             <p className="text-[9px] font-bold text-emerald-400 uppercase mb-1">Checked</p>
                                                             <p className="text-sm font-black text-white">{new Date(log.createdAt ?? log._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                             <p className="text-[10px] text-white/30">{new Date(log.createdAt ?? log._creationTime).toLocaleDateString()}</p>
                                                         </div>
                                                         <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                                                             <p className="text-[9px] font-bold text-primary uppercase mb-1">Status</p>
                                                             <p className="text-sm font-black text-white uppercase tracking-tighter">Instant Report</p>
                                                             <p className="text-[10px] text-white/30 truncate">No Checkout Required</p>
                                                         </div>
                                                     </div>
                                                 </div>

                                                 <div className="space-y-3 pt-4 border-t border-white/5">
                                                     <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                         <FileText className="w-3 h-3" /> Observation Detail
                                                     </p>
                                                     <div className="p-5 rounded-2xl bg-white/5 border border-white/5 min-h-[100px]">
                                                         <p className="text-sm leading-relaxed text-white/70 italic">
                                                             "{log.remark || "Regular inspection completed with no major issues found."}"
                                                         </p>
                                                     </div>
                                                 </div>
                                             </div>

                                             {/* Column 3: Photographic Evidence */}
                                             <div className="md:col-span-4 space-y-4">
                                                 <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                     <ImageIcon className="w-3 h-3" /> Media Evidence
                                                 </p>
                                                 {(log.imageUrls && log.imageUrls.length > 0) ? (
                                                     <div className="grid grid-cols-2 gap-3">
                                                         {log.imageUrls.slice(0, 4).map((url: string, i: number) => (
                                                             <div key={i} className="aspect-square rounded-2xl overflow-hidden border border-white/10 group-hover:border-primary/40 transition-all bg-white/5">
                                                                 <img 
                                                                    src={url} 
                                                                    alt="Evidence" 
                                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110" 
                                                                    onClick={() => window.open(url, '_blank')}
                                                                 />
                                                             </div>
                                                         ))}
                                                     </div>
                                                 ) : (
                                                     <div className="h-48 rounded-2xl border border-dashed border-white/10 flex items-center justify-center">
                                                         <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-40">No media captured</p>
                                                     </div>
                                                 )}
                                             </div>
                                         </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="py-20 text-center border border-dashed border-white/10 rounded-[2.5rem]">
                                <FileText className="w-12 h-12 text-white/10 mx-auto mb-4" />
                                <p className="text-sm text-white/40 font-medium">No operational reports found for the selected filters.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Visit Details Modal */}
            {selectedDayDetails && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl animate-in fade-in duration-300"
                    onClick={() => setSelectedDayDetails(null)}
                >
                    <div
                        className="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0f0f0f] shadow-[0_0_100px_-20px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.03] p-6 lg:px-8 text-white">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20">
                                    <ShieldCheck className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black">{selectedDayDetails.officerName}</h3>
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{selectedDayDetails.dateLabel}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedDayDetails(null)}
                                className="rounded-2xl p-2 bg-white/5 text-muted-foreground transition-all hover:bg-rose-500/20 hover:text-rose-400"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>
                        
                        <div className="max-h-[70vh] overflow-y-auto p-6 lg:p-8 custom-scrollbar">
                            <div className="grid gap-6">
                                {selectedDayDetails.logs.map((log: any) => {
                                    const site = siteLookup.get(log.siteId);
                                    return (
                                        <div key={log._id} className="group relative rounded-[2.5rem] border border-white/10 bg-white/[0.02] p-8 hover:bg-white/[0.03] transition-all overflow-hidden shadow-2xl">
                                             {/* Decorative Background Accent */}
                                             <div className="absolute -right-20 -top-20 h-64 w-64 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
                                             
                                             <div className="relative grid gap-10 md:grid-cols-12">
                                                 {/* Column 1: Identity & Compliance */}
                                                 <div className="md:col-span-4 space-y-6">
                                                     <div className="space-y-2">
                                                         <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
                                                             <Building className="w-3 h-3" /> Visit Identity
                                                         </p>
                                                         <div className="flex items-start flex-wrap gap-2">
                                                            <p className="text-2xl font-black text-white leading-tight">{log.siteName}</p>
                                                            {(log.visitType && log.visitType !== 'General') && (
                                                                <span className={cn(
                                                                    "px-3 py-1 rounded-full text-[9px] font-black tracking-wider uppercase border",
                                                                    log.visitType === 'SiteCheckDay' ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                                                                    log.visitType === 'SiteCheckNight' ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" :
                                                                    log.visitType === 'Trainer' ? "bg-rose-500/20 text-rose-400 border-rose-500/30" :
                                                                    "bg-white/10 text-white/60 border-white/10"
                                                                )}>
                                                                    {log.visitType.replace('SiteCheck', '').toUpperCase()} VISIT
                                                                </span>
                                                            )}
                                                         </div>
                                                         <p className="text-[11px] font-bold text-white/40">{site?.regionId || "-"} • {site?.city || "-"}</p>
                                                     </div>

                                                     <div className="space-y-4 pt-4 border-t border-white/5">
                                                         <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                             <MapPin className="w-3 h-3" /> GPS Tracking
                                                         </p>
                                                         {log.latitude ? (
                                                             <div className="space-y-3">
                                                                 <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                                                                     <div>
                                                                        <p className="text-[9px] font-bold text-muted-foreground uppercase">Compliance</p>
                                                                        <p className={cn(
                                                                            "text-sm font-black",
                                                                            log.distanceFromSiteM > 200 ? "text-rose-400" : "text-emerald-400"
                                                                        )}>
                                                                            {log.distanceFromSiteM != null ? 
                                                                                (log.distanceFromSiteM > 200 ? "OUT OF RANGE" : "ON SITE") 
                                                                                : "GPS RECORDED"}
                                                                        </p>
                                                                     </div>
                                                                     <div className="text-right">
                                                                        <p className="text-[9px] font-bold text-muted-foreground uppercase">Accuracy</p>
                                                                        <p className="text-sm font-black text-white/80">±{Math.round(log.checkInAccuracyM || 0)}m</p>
                                                                     </div>
                                                                 </div>
                                                                 
                                                                 <a
                                                                     href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                                                                     target="_blank"
                                                                     rel="noopener noreferrer"
                                                                     className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-primary/20 border border-primary/30 text-[11px] font-black text-primary hover:bg-primary hover:text-white transition-all shadow-lg text-center"
                                                                 >
                                                                     <ExternalLink className="w-4 h-4" />
                                                                     View Precision Location
                                                                 </a>
                                                             </div>
                                                         ) : (
                                                             <p className="text-xs text-white/20 italic">No GPS data captured for this visit.</p>
                                                         )}
                                                     </div>
                                                 </div>

                                                 {/* Column 2: Timing & Compliance Details */}
                                                 <div className="md:col-span-4 space-y-6 lg:border-x lg:border-white/5 lg:px-8">
                                                     <div className="space-y-4">
                                                         <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                             <Clock className="w-3 h-3" /> Timing Statistics
                                                         </p>
                                                         <div className="grid grid-cols-2 gap-4">
                                                             <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                                                                 <p className="text-[9px] font-bold text-emerald-400 uppercase mb-1">Checked IN</p>
                                                                 <p className="text-sm font-black text-white">{new Date(log.createdAt ?? log._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                                 <p className="text-[10px] text-white/30">{new Date(log.createdAt ?? log._creationTime).toLocaleDateString()}</p>
                                                             </div>
                                                             <div className={cn(
                                                                 "p-4 rounded-2xl border",
                                                                 log.checkOutAt ? "bg-rose-500/5 border-rose-500/10" : "bg-white/5 border-white/10"
                                                             )}>
                                                                 <p className={cn("text-[9px] font-bold uppercase mb-1", log.checkOutAt ? "text-rose-400" : "text-muted-foreground")}>Checked OUT</p>
                                                                 <p className="text-sm font-black text-white">{log.checkOutAt ? new Date(log.checkOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Active"}</p>
                                                                 {log.checkOutAt && <p className="text-[10px] text-white/30">{new Date(log.checkOutAt).toLocaleDateString()}</p>}
                                                             </div>
                                                         </div>
                                                     </div>

                                                     <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10">
                                                         <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-3">Report Category</p>
                                                         <div className="flex items-center gap-3">
                                                             <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                                                                 <VisitTypeIcon visitType={log.visitType} />
                                                             </div>
                                                             <div>
                                                                 <p className="text-md font-black text-white uppercase">{log.visitType || "GENERAL INSPECTION"}</p>
                                                                 <p className="text-[10px] font-bold text-muted-foreground uppercase">Validated Log</p>
                                                             </div>
                                                         </div>
                                                     </div>
                                                 </div>

                                                 {/* Column 3: Observations & Media */}
                                                 <div className="md:col-span-4 space-y-6">
                                                     <div className="space-y-4">
                                                         <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                             <Camera className="w-3 h-3" /> Captured Media
                                                         </p>
                                                         {(() => {
                                                             const fromArr = (log.imageUrls as string[] | undefined)?.filter(Boolean) ?? [];
                                                             const urls = fromArr.length > 0 ? fromArr : log.imageUrl ? [log.imageUrl] : [];
                                                             if (!urls.length) return <p className="text-xs text-white/20 italic">No photographic evidence provided.</p>;
                                                             return (
                                                                 <div className="grid grid-cols-4 gap-2">
                                                                     {urls.map((url: string, i: number) => (
                                                                         <button
                                                                             key={`${log._id}-img-${i}`}
                                                                             type="button"
                                                                             onClick={() => setSelectedImage(url)}
                                                                             className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black shadow-lg transition-all hover:scale-105 hover:border-primary/50"
                                                                         >
                                                                             <img src={url} alt="" className="h-full w-full object-cover opacity-90" />
                                                                         </button>
                                                                     ))}
                                                                 </div>
                                                             );
                                                         })()}
                                                     </div>

                                                     <div className="space-y-3">
                                                         <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                             <ImageIcon className="w-3 h-3" /> Officer Observations
                                                         </p>
                                                         <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 relative">
                                                             <p className="text-sm font-bold text-white/90 leading-relaxed italic">
                                                                 “{log.remark || "Regular routine check was conducted without notable incidents."}”
                                                             </p>
                                                         </div>
                                                     </div>
                                                 </div>
                                             </div>
                                         </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Simple Lightbox */}
            {selectedImage && (
                <div 
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
                    onClick={() => setSelectedImage(null)}
                >
                    <div className="relative max-w-5xl w-full h-[85vh] flex items-center justify-center">
                        <img src={selectedImage} alt="Visit Evidence" className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl border border-white/10" />
                        <button 
                            className="absolute top-0 right-0 p-4 text-white/50 hover:text-white transition-colors"
                            onClick={() => setSelectedImage(null)}
                        >
                            <X className="w-10 h-10" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    </Layout>
);
}
