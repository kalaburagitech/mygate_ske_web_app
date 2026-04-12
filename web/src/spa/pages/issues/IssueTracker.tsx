import React, { useState } from "react";
import { Layout } from "../../../components/Layout";
import { AlertTriangle, Clock, MapPin, CheckCircle2, ShieldAlert, Loader2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../services/convex";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import type { Id } from "../../../../convex/_generated/dataModel";
import { userHasAnyRole } from "../../../lib/userRoles";

export default function IssueTracker() {
    const { user } = useUser();
    const [selectedOrgId, setSelectedOrgId] = useState<string>("");
    const [selectedIssue, setSelectedIssue] = useState<any | null>(null);

    const currentUser = useQuery(api.users.getByClerkId,
        user?.id ? { clerkId: user.id } : "skip"
    );
    const organizationId = currentUser?.organizationId;
    const orgs = useQuery(
        api.organizations.list,
        currentUser?.organizationId ? { currentOrganizationId: currentUser.organizationId } : {}
    );

    const orgIssues = useQuery((api.logs as any).listIssuesByOrg,
        (organizationId || (selectedOrgId as Id<"organizations">)) ? { 
            organizationId: (organizationId || selectedOrgId) as Id<"organizations">,
            requestingUserId: currentUser?._id
        } : "skip"
    );
    const allIssuesList = useQuery(api.logs.listAllIssues);
    const isRestricted = (currentUser?.roles || []).some((r: string) => ["Client", "SO"].includes(r));
    const isSuperAdmin = userHasAnyRole(currentUser, ["Owner", "Deployment Manager"]);
    const isAdmin = isSuperAdmin || (currentUser?.roles || []).includes("Manager");
    const issues = isSuperAdmin ? allIssuesList : orgIssues;

    const resolveIssue = useMutation(api.logs.resolveIssue);

   const handleResolve = async (issueId: any) => {
    try {
        await resolveIssue({ issueId });
        toast.success("Issue resolved successfully");
    } catch (error) {
        console.error("Failed to resolve issue:", error);
        toast.error("Failed to resolve issue");
    }
};

    // Calculate Stats
    const stats = React.useMemo(() => {
        if (!issues) return { critical: 0, warnings: 0, resolvedToday: 0 };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return issues.reduce((acc: any, issue: any) => {
            if (issue.status === "open") {
                if (issue.priority === "High") acc.critical++;
                if (issue.priority === "Medium") acc.warnings++;
            } else if (issue.status === "closed") {
                const issueDate = new Date(issue.timestamp);
                issueDate.setHours(0, 0, 0, 0);
                if (issueDate.getTime() === today.getTime()) {
                    acc.resolvedToday++;
                }
            }
            return acc;
        }, { critical: 0, warnings: 0, resolvedToday: 0 });
    }, [issues]);

    const criticalIssues = React.useMemo(() => {
        return issues?.filter((i: any) => i.status === "open" && i.priority === "High") || [];
    }, [issues]);

    const warningIssues = React.useMemo(() => {
        return issues?.filter((i: any) => i.status === "open" && i.priority !== "High") || [];
    }, [issues]);

    const resolvedIssues = React.useMemo(() => {
        return issues?.filter((i: any) => i.status === "closed") || [];
    }, [issues]);

    const renderIssueCard = (issue: any, isResolved = false) => (
        <div key={issue._id} className="glass p-5 rounded-2xl border border-white/10 hover:border-white/20 transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4 w-full">
                    <div className={cn(
                        "p-3 rounded-xl",
                        issue.priority === "High" ? "bg-red-500/10" : "bg-amber-500/10"
                    )}>
                        <AlertTriangle className={cn(
                            "w-6 h-6",
                            issue.priority === "High" ? "text-red-500" : "text-amber-500"
                        )} />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-base font-bold text-white">{issue.title}</h3>
                            <span className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                issue.priority === "High" ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            )}>
                                {issue.priority}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{issue.description}</p>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" />
                                <span className="text-white font-medium">{issue.siteName}</span>
                                <span className="mx-1 opacity-20">|</span>
                                <span className="text-primary">{issue.locationContext}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {new Date(issue.timestamp).toLocaleString()}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSelectedIssue(issue)}
                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-semibold hover:bg-white/10 transition-colors text-white"
                    >
                        View Details
                    </button>
                    {!isResolved && issue.status === "open" && isAdmin && (
                        <button
                            onClick={() => handleResolve(issue._id)}
                            className="px-4 py-2 bg-primary/10 border border-primary/20 text-primary rounded-xl text-xs font-semibold hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95"
                        >
                            Resolve
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    if (currentUser === undefined || (organizationId && issues === undefined)) {
        return (
            <Layout title="Issue Tracker">
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            </Layout>
        );
    }

    if (!currentUser) {
        return (
            <Layout title="Issue Tracker">
                <div className="flex items-center justify-center h-64">
                    <p className="text-muted-foreground">User profile not found. Please contact support.</p>
                </div>
            </Layout>
        );
    }

    if (!organizationId) {
        return (
            <Layout title="Issue Tracker">
                <div className="flex items-center justify-center h-64">
                    <p className="text-muted-foreground">No organization assigned to your profile.</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="Issue Tracker">
            <div className="space-y-6">
                {/* Organization Selector (if not linked) */}
                {!isRestricted && !currentUser?.organizationId && (
                    <div className="flex items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl mb-6">
                        <span className="text-sm font-semibold text-muted-foreground ml-2">Select Organization:</span>
                        <div className="flex flex-wrap gap-2">
                            {orgs?.map((org) => (
                                <button
                                    key={org._id}
                                    onClick={() => setSelectedOrgId(org._id)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all",
                                        selectedOrgId === org._id
                                            ? "bg-primary text-primary-foreground border-primary shadow-[0_0_15px_rgba(37,99,235,0.3)]"
                                            : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"
                                    )}
                                >
                                    {org.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                
                {isRestricted && (
                    <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 p-4 rounded-2xl mb-6">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <ShieldAlert className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-primary uppercase tracking-wider">Effective Tenant</p>
                            <h3 className="text-lg font-bold text-white leading-tight">
                                {currentUser?.effectiveOrganizationName || "Loading..."}
                            </h3>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="glass p-6 rounded-2xl border border-red-500/20 bg-red-500/[0.02]">
                        <div className="flex items-center gap-3 mb-2">
                            <ShieldAlert className="w-5 h-5 text-red-500" />
                            <span className="text-sm font-semibold text-red-400">Critical Issues</span>
                        </div>
                        <p className="text-3xl font-bold text-white tracking-tight">{stats.critical}</p>
                    </div>
                    <div className="glass p-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.02]">
                        <div className="flex items-center gap-3 mb-2">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            <span className="text-sm font-semibold text-amber-400">Active Warnings</span>
                        </div>
                        <p className="text-3xl font-bold text-white tracking-tight">{stats.warnings}</p>
                    </div>
                    <div className="glass p-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.02]">
                        <div className="flex items-center gap-3 mb-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            <span className="text-sm font-semibold text-emerald-400">Resolved Today</span>
                        </div>
                        <p className="text-3xl font-bold text-white tracking-tight">{stats.resolvedToday}</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-bold">Critical Active Issues</h2>
                            <span className="text-xs text-muted-foreground">{criticalIssues.length} items</span>
                        </div>
                        {criticalIssues.length > 0 ? criticalIssues.map((issue: any) => renderIssueCard(issue, false)) : (
                            <div className="text-center py-8 text-muted-foreground">No critical issues at the moment.</div>
                        )}
                    </section>

                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-bold">Active Warnings</h2>
                            <span className="text-xs text-muted-foreground">{warningIssues.length} items</span>
                        </div>
                        {warningIssues.length > 0 ? warningIssues.map((issue: any) => renderIssueCard(issue, false)) : (
                            <div className="text-center py-8 text-muted-foreground">No active warnings at the moment.</div>
                        )}
                    </section>

                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-bold">Resolved Issues</h2>
                            <span className="text-xs text-muted-foreground">{resolvedIssues.length} items</span>
                        </div>
                        {resolvedIssues.length > 0 ? resolvedIssues.map((issue: any) => renderIssueCard(issue, true)) : (
                            <div className="text-center py-8 text-muted-foreground">No resolved issues yet.</div>
                        )}
                    </section>
                </div>

                {selectedIssue && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <div className="glass w-full max-w-lg rounded-2xl border border-white/10 p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold">Issue Details</h3>
                                <button onClick={() => setSelectedIssue(null)} className="text-muted-foreground">Close</button>
                            </div>
                            <div className="space-y-2">
                                <div><strong>Title:</strong> {selectedIssue.title}</div>
                                <div><strong>Description:</strong> {selectedIssue.description}</div>
                                <div><strong>Status:</strong> {selectedIssue.status}</div>
                                <div><strong>Priority:</strong> {selectedIssue.priority}</div>
                                <div><strong>Location:</strong> {selectedIssue.siteName}</div>
                                <div><strong>Reported by:</strong> {selectedIssue.reporterName} ({selectedIssue.reporterRole})</div>
                                <div><strong>Timestamp:</strong> {new Date(selectedIssue.timestamp).toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
