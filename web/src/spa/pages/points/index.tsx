import { useState } from "react";
import { cn } from "../../../lib/utils";
import { Layout } from "../../../components/Layout";
import { SiteSelector } from "../../../components/SiteSelector";
import { useQuery } from "convex/react";
import { api } from "../../../services/convex";
import { useUser } from "@clerk/nextjs";
import type { Id } from "../../../../convex/_generated/dataModel";

import PatrolLogs from "./PatrolLogs";
import PatrolPoints from "./PatrolPoints";
import PatrolQRCodes from "./PatrolQRCodes";

export default function Patrol() {
    const { user } = useUser();
    const currentUser = useQuery(api.users.getByClerkId,
        user?.id ? { clerkId: user.id } : "skip"
    );
    const isAdminOrOfficer = (currentUser?.roles || []).some((r: string) => 
        ["Owner", "Deployment Manager", "Manager", "Visiting Officer"].includes(r)
    );
    const [tab, setTab] = useState<"points" | "logs" | "qr">("points");
    const [selectedSiteId, setSelectedSiteId] = useState<string>("all");

    return (
        <Layout title="Patrol Dashboard">
            <div className="space-y-6">
                
                {/* Unified Site Selector */}
                <div className="relative z-[60] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Active Scope</h2>
                        <p className="text-xs text-muted-foreground mt-1">Select a site to filter points and reports</p>
                    </div>
                    {currentUser && (
                        <SiteSelector
                            organizationId={currentUser.organizationId}
                            selectedSiteId={selectedSiteId}
                            onSiteChange={setSelectedSiteId}
                            requestingUserId={currentUser._id}
                        />
                    )}
                </div>

                {/* Tabs — QR first (print labels before registering on mobile) */}
                <div className="flex gap-6 border-b border-white/10 px-2 relative z-10">
                    {isAdminOrOfficer && (
                        <button
                            onClick={() => setTab("qr")}
                            className={cn(
                                "pb-2 text-sm font-medium transition-all relative",
                                tab === "qr"
                                    ? "text-primary border-b-2 border-primary"
                                    : "text-muted-foreground hover:text-white"
                            )}
                        >
                            QR code
                        </button>
                    )}
                    
                    <button
                        onClick={() => setTab("points")}
                        className={cn(
                            "pb-2 text-sm font-medium transition-all relative",
                            tab === "points"
                                ? "text-primary border-b-2 border-primary"
                                : "text-muted-foreground hover:text-white"
                        )}
                    >
                        Patrol Points
                    </button>

                    <button
                        onClick={() => setTab("logs")}
                        className={cn(
                            "pb-2 text-sm font-medium transition-all relative",
                            tab === "logs"
                                ? "text-primary border-b-2 border-primary"
                                : "text-muted-foreground hover:text-white"
                        )}
                    >
                        Patrol Reports
                    </button>
                </div>

                {/* Content */}
                <div className="relative z-10">
                    {isAdminOrOfficer && tab === "qr" && <PatrolQRCodes selectedSiteId={selectedSiteId} />}
                    {tab === "points" && <PatrolPoints selectedSiteId={selectedSiteId} />}
                    {tab === "logs" && <PatrolLogs selectedSiteId={selectedSiteId} />}
                </div>
            </div>
        </Layout>
    );
}