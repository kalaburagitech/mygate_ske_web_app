import { useMemo, useState, Fragment } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../services/convex";
import { Layout } from "../../../components/Layout";
import {
    Plus,
    Pencil,
    Trash2,
    Power,
    Calendar,
    Search,
    Loader2,
    X,
    Check,
    MapPin,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";

export default function OrganizationManagement() {
    const { user } = useUser();
    const currentUser = useQuery(
        api.users.getByClerkId,
        user?.id ? { clerkId: user.id } : "skip"
    );
    const isRestricted = (currentUser?.roles || []).some((r: string) => ["Client", "SO"].includes(r));
    const orgs = useQuery(
        (api as any).organizations.list,
        currentUser?._id ? { 
            currentOrganizationId: currentUser.organizationId,
            requestingUserId: currentUser._id 
        } : "skip"
    );
    const allSites = useQuery(
        api.sites.listSitesByUser, 
        currentUser?._id ? { 
            userId: currentUser._id
        } : "skip"
    );
    const allUsers = useQuery(
        api.users.listByOrg, 
        currentUser?._id ? { 
            requestingUserId: currentUser._id 
        } : "skip"
    );
    const createOrg = useMutation((api as any).organizations.create);
    const updateOrg = useMutation((api as any).organizations.update);
    const setOrgStatus = useMutation((api as any).organizations.setStatus);
    const updateOrgAccess = useMutation((api as any).organizations.updateAccess);
    const removeOrg = useMutation((api as any).organizations.remove);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOrg, setEditingOrg] = useState<{
        id: Id<"organizations">;
        name: string;
        status: "active" | "inactive";
        access: {
            patrolling: boolean;
            visits: boolean;
            attendance: boolean;
        };
    } | null>(null);
    const [name, setName] = useState("");
    const [status, setStatus] = useState<"active" | "inactive">("active");
    const [access, setAccess] = useState({
        patrolling: true,
        visits: true,
        attendance: true,
    });
    const [searchQuery, setSearchQuery] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedParentId, setSelectedParentId] = useState<Id<"organizations"> | "">("");
    const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());

    const toggleOrg = (orgId: string) => {
        const next = new Set(expandedOrgs);
        if (next.has(orgId)) {
            next.delete(orgId);
        } else {
            next.add(orgId);
        }
        setExpandedOrgs(next);
    };

    const getSiteCount = (orgId: string) => {
        return (allSites as any)?.filter((s: any) => s.organizationId === orgId).length || 0;
    };

    const getUserCount = (orgId: string) => {
        return (allUsers as any)?.filter((u: any) => u.organizationId === orgId).length || 0;
    };

    const getMainOrgName = (org: any) => {
        if (!org.parentOrganizationId) {
            return "Self";
        }
        const parentOrg = orgs?.find((item: any) => item._id === org.parentOrganizationId);
        return parentOrg?.name || "-";
    };

    const isOwnerRole = (currentUser?.roles || []).some((r: string) => ["Owner", "Manager", "Deployment Manager"].includes(r));
    const isStrictlyRestricted = isRestricted && !isOwnerRole;

    const groupedOrgs = useMemo(() => {
        if (!orgs) return [];
        
        // Final filtered set
        const filtered = orgs.filter((org: any) =>
            org.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

        const roots = orgs.filter((org: any) => !org.parentOrganizationId || !orgs.some((o: any) => o._id === org.parentOrganizationId));
        const children = orgs.filter((org: any) => org.parentOrganizationId && orgs.some((o: any) => o._id === org.parentOrganizationId));

        return roots.map((root: any) => {
            const groupChildren = children.filter((child: any) => child.parentOrganizationId === root._id);
            
            // For strictly restricted roles (Client/SO without Owner status), 
            // only show sub-orgs that have sites or users attached
            const activeChildren = groupChildren.filter((c: any) => {
                const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
                if (!matchesSearch) return false;
                
                if (isStrictlyRestricted) {
                    return getSiteCount(c._id) > 0 || getUserCount(c._id) > 0;
                }
                return true;
            });

            const matchesRoot = root.name.toLowerCase().includes(searchQuery.toLowerCase());
            
            if (matchesRoot || activeChildren.length > 0) {
                return {
                    parent: root,
                    children: activeChildren
                };
            }
            return null;
        }).filter(Boolean);
    }, [orgs, searchQuery]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSubmitting(true);
        try {
            if (editingOrg) {
                await updateOrg({ id: editingOrg.id, name, status, access });
                toast.success("Organization updated successfully");
            } else {
                await createOrg({ 
                    name, 
                    status, 
                    access,
                    parentOrganizationId: selectedParentId || undefined 
                });
                toast.success("Organization created successfully");
            }
            setIsModalOpen(false);
            setName("");
            setStatus("active");
            setAccess({ patrolling: true, visits: true, attendance: true });
            setEditingOrg(null);
        } catch (error: any) {
            toast.error(error.message || "Something went wrong");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (org: any) => {
        const siteCount = getSiteCount(org._id);
        const userCount = getUserCount(org._id);

        if (siteCount > 0 || userCount > 0) {
            let message = "Cannot delete organization.";
            if (siteCount > 0 && userCount > 0) {
                message += ` It has ${siteCount} site(s) and ${userCount} user(s) connected.`;
            } else if (siteCount > 0) {
                message += ` It has ${siteCount} site(s) connected. Please remove sites first.`;
            } else {
                message += ` It has ${userCount} user(s) registered. Please remove users first.`;
            }
            toast.error(message);
            return;
        }

        if (!confirm("Are you sure you want to delete this organization?")) return;

        try {
            await removeOrg({ id: org._id });
            toast.success("Organization deleted successfully");
        } catch (error: any) {
            toast.error(error.message || "Failed to delete organization");
        }
    };

    const openCreateModal = () => {
        setEditingOrg(null);
        setName("");
        setStatus("active");
        setAccess({ patrolling: true, visits: true, attendance: true });
        setSelectedParentId("");
        setIsModalOpen(true);
    };

    const openEditModal = (org: any) => {
        setEditingOrg({
            id: org._id,
            name: org.name,
            status: org.status || "active",
            access: org.access || { patrolling: true, visits: true, attendance: true },
        });
        setName(org.name);
        setStatus(org.status || "active");
        setAccess(org.access || { patrolling: true, visits: true, attendance: true });
        setSelectedParentId(org.parentOrganizationId || "");
        setIsModalOpen(true);
    };

    const handleToggleStatus = async (org: any) => {
        try {
            const nextStatus = org.status === "inactive" ? "active" : "inactive";
            await setOrgStatus({ id: org._id, status: nextStatus });
            toast.success(`Organization ${nextStatus === "active" ? "activated" : "deactivated"} successfully`);
        } catch (error: any) {
            toast.error(error.message || "Failed to update organization status");
        }
    };

    const handleToggleAccess = async (org: any, key: "patrolling" | "visits" | "attendance") => {
        try {
            const currentAccess = org.access || { patrolling: true, visits: true, attendance: true };
            const nextAccess = {
                ...currentAccess,
                [key]: !currentAccess[key],
            };
            await updateOrgAccess({ id: org._id, access: nextAccess });
            toast.success(`${key} access updated`);
        } catch (error: any) {
            toast.error(error.message || "Failed to update organization access");
        }
    };

    const renderToggle = (
        checked: boolean,
        onClick: () => void,
        title: string
    ) => (
        <button
            onClick={onClick}
            className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                checked ? "bg-emerald-500/80" : "bg-white/10"
            )}
            title={title}
        >
            <span
                className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                    checked ? "translate-x-5" : "translate-x-1"
                )}
            />
        </button>
    );

    return (
        <Layout title="Organization Management">
            <div className="space-y-8">
                {/* Header Actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search organizations..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        />
                    </div>
                    {isOwnerRole && (
                        <button
                            onClick={openCreateModal}
                            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-primary/20"
                        >
                            <Plus className="w-4 h-4" />
                            New Organization
                        </button>
                    )}
                </div>

                {/* Table */}
                {!orgs || !allSites || !allUsers ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : groupedOrgs?.length === 0 ? (
                    <div className="text-center py-20 glass rounded-3xl border border-white/5">
                        <Power className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                        <h3 className="text-lg font-medium text-white/60">No organizations found</h3>
                        <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or create a new one.</p>
                    </div>
                ) : (
                    <div className="glass rounded-2xl border border-white/10 overflow-hidden">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left min-w-[1250px]">
                                <thead>
                                    <tr className="border-b border-white/5 bg-white/[0.02]">
                                        <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Organization</th>
                                        {!isRestricted && (
                                            <>
                                                <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                                                <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Main Org</th>
                                            </>
                                        )}
                                        <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
                                        <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sites</th>
                                        <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Users</th>
                                        <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                                        <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Patrolling</th>
                                        <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Visits</th>
                                        <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attendance</th>
                                        <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right"> </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {groupedOrgs.map((group: any) => (
                                        <Fragment key={group.parent._id}>
                                            {[group.parent, ...group.children].map((org) => {
                                                const isChild = org.parentOrganizationId;
                                                const siteCount = getSiteCount(org._id);
                                                const userCount = getUserCount(org._id);
                                                const orgAccess = org.access || { patrolling: true, visits: true, attendance: true };
                                                
                                                const allOrgSites = (allSites as any)?.filter((s: any) => s.organizationId === org._id) || [];
                                                
                                                // Filter sites by authorization for restricted roles
                                                const orgSites = isStrictlyRestricted
                                                    ? allOrgSites.filter((s: any) => {
                                                        const userSiteIds = (currentUser as any)?.siteIds || [];
                                                        const userSiteId = (currentUser as any)?.siteId;
                                                        return userSiteIds.includes(s._id) || userSiteId === s._id;
                                                    })
                                                    : allOrgSites;

                                                return (
                                                    <Fragment key={org._id}>
                                                        <tr className={cn(
                                                            "hover:bg-white/[0.02] transition-colors",
                                                            isChild ? "bg-white/[0.01]" : "bg-white/[0.03]"
                                                        )}>
                                                            <td className="px-4 sm:px-6 py-4">
                                                                 <div className={cn(
                                                                    "flex items-center gap-2",
                                                                    isChild && "ml-6 pl-4 border-l-2 border-primary/20"
                                                                )}>
                                                                    {orgSites.length > 0 && (
                                                                        <button
                                                                            onClick={() => toggleOrg(org._id)}
                                                                            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                                                                        >
                                                                            {expandedOrgs.has(org._id) ? (
                                                                                <ChevronDown className="w-4 h-4 text-primary" />
                                                                            ) : (
                                                                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                    {!orgSites.length && <div className="w-6" />}
                                                                    
                                                                    <div className="flex flex-col min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-sm font-semibold text-white truncate">{org.name}</span>
                                                                            {isChild && (
                                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold uppercase tracking-wider">Sub</span>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-xs text-muted-foreground truncate">{org._id}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            {!isRestricted && (
                                                                <>
                                                                    <td className="px-4 sm:px-6 py-4 text-sm text-white">
                                                                        <span className={cn(
                                                                            "inline-flex items-center px-2 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider border whitespace-nowrap",
                                                                            !org.parentOrganizationId
                                                                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                                                : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                                        )}>
                                                                            {!org.parentOrganizationId ? "MAIN_ORG" : "SUB_ORG"}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 sm:px-6 py-4 text-sm text-white">{getMainOrgName(org)}</td>
                                                                </>
                                                            )}
                                                            <td className="px-4 sm:px-6 py-4 text-sm text-muted-foreground">
                                                                <div className="flex items-center gap-2">
                                                                    <Calendar className="w-4 h-4" />
                                                                    {new Date(org._id ? (org as any)._creationTime : Date.now()).toLocaleDateString()}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 sm:px-6 py-4 text-sm text-white">{siteCount}</td>
                                                            <td className="px-4 sm:px-6 py-4 text-sm text-white">{userCount}</td>
                                                            <td className="px-4 sm:px-6 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <span className={cn(
                                                                        "inline-flex items-center px-2 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider border whitespace-nowrap",
                                                                        org.status === "inactive"
                                                                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                                    )}>
                                                                        {org.status === "inactive" ? "Inactive" : "Active"}
                                                                    </span>
                                                                    {renderToggle(
                                                                        org.status !== "inactive",
                                                                        () => handleToggleStatus(org),
                                                                        org.status === "inactive" ? "Activate organization" : "Deactivate organization"
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 sm:px-6 py-4">
                                                                {renderToggle(orgAccess.patrolling, () => handleToggleAccess(org, "patrolling"), `${orgAccess.patrolling ? "Revoke" : "Grant"} patrolling access`)}
                                                            </td>
                                                            <td className="px-4 sm:px-6 py-4">
                                                                {renderToggle(orgAccess.visits, () => handleToggleAccess(org, "visits"), `${orgAccess.visits ? "Revoke" : "Grant"} visit access`)}
                                                            </td>
                                                            <td className="px-4 sm:px-6 py-4">
                                                                {renderToggle(orgAccess.attendance, () => handleToggleAccess(org, "attendance"), `${orgAccess.attendance ? "Revoke" : "Grant"} attendance access`)}
                                                            </td>
                                                            <td className="px-4 sm:px-6 py-4 text-right">
                                                                {!isRestricted && (
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <button onClick={() => openEditModal(org)} className="p-2 bg-white/5 hover:bg-primary/20 rounded-lg text-muted-foreground hover:text-primary transition-colors disabled:opacity-50" disabled={!org.parentOrganizationId}><Pencil className="w-4 h-4" /></button>
                                                                        <button onClick={() => handleDelete(org)} className={cn("p-2 bg-white/5 rounded-lg text-muted-foreground transition-colors", (siteCount > 0 || userCount > 0 || !org.parentOrganizationId) ? "cursor-not-allowed opacity-50" : "hover:bg-red-500/20 hover:text-red-500")} disabled={siteCount > 0 || userCount > 0 || !org.parentOrganizationId}><Trash2 className="w-4 h-4" /></button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>

                                                        {/* Nested Sites Tier */}
                                                        {expandedOrgs.has(org._id) && (
                                                            <>
                                                                {orgSites.map((site: any) => {
                                                                    const siteUsers = (allUsers as any[])?.filter(u => u.siteId === site._id || u.siteIds?.includes(site._id));
                                                                    return (
                                                                        <Fragment key={site._id}>
                                                                            <tr className="hover:bg-white/[0.04] transition-colors bg-white/[0.005] animate-in slide-in-from-top-1 duration-200">
                                                                                <td className="px-4 sm:px-6 py-3">
                                                                                    <div className={cn(
                                                                                        "flex items-center gap-3",
                                                                                        isChild ? "ml-24" : "ml-16",
                                                                                        "pl-4 border-l-2 border-white/5"
                                                                                    )}>
                                                                                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                                                                            <MapPin className="w-3.5 h-3.5" />
                                                                                        </div>
                                                                                        <div className="flex flex-col min-w-0">
                                                                                            <div className="flex items-center gap-2">
                                                                                                <span className="text-xs font-medium text-white/90 truncate">{site.name}</span>
                                                                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/10 font-bold uppercase tracking-wider">Site</span>
                                                                                            </div>
                                                                                            <span className="text-[10px] text-muted-foreground/60 truncate">{site._id}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                                {!isRestricted && (
                                                                                    <>
                                                                                        <td className="px-4 sm:px-6 py-3 text-[11px] text-muted-foreground/50">LEVEL 3</td>
                                                                                        <td className="px-4 sm:px-6 py-3 text-[11px] text-muted-foreground/50">-</td>
                                                                                    </>
                                                                                )}
                                                                                <td className="px-4 sm:px-6 py-3 text-[11px] text-muted-foreground/60">{new Date(site._creationTime).toLocaleDateString()}</td>
                                                                                <td className="px-4 sm:px-6 py-3 text-[11px] text-muted-foreground/40">-</td>
                                                                                <td className="px-4 sm:px-6 py-3 text-[11px] text-emerald-400/60 font-medium">Users: {siteUsers.length}</td>
                                                                                <td className="px-4 sm:px-6 py-3">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                                                                                        <span className="text-[11px] text-muted-foreground/80 lowercase">active</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td colSpan={4} className="px-4 sm:px-6 py-3 text-right">
                                                                                    {siteUsers.length > 0 && (
                                                                                        <div className="flex -space-x-1.5 overflow-hidden justify-end">
                                                                                            {siteUsers.slice(0, 5).map((u, idx) => (
                                                                                                <div key={idx} className="inline-block h-5 w-5 rounded-full ring-2 ring-black bg-primary/30 flex items-center justify-center text-[7px] font-bold text-white uppercase" title={`${u.name} (${u.roles?.join(', ')})`}>
                                                                                                    {u.name[0]}
                                                                                                </div>
                                                                                            ))}
                                                                                            {siteUsers.length > 5 && (
                                                                                                <div className="inline-block h-5 w-5 rounded-full ring-2 ring-black bg-white/10 flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                                                                                                    +{siteUsers.length - 5}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        </Fragment>
                                                                    );
                                                                })}
                                                                {/* Org Level Users (not assigned to specific sites) */}
                                                                {(() => {
                                                                    const orgUsers = (allUsers as any[])?.filter(u => u.organizationId === org._id && !u.siteId && (!u.siteIds || u.siteIds.length === 0));
                                                                    if (orgUsers.length === 0) return null;
                                                                    return (
                                                                        <tr className="bg-white/5 border-t border-white/5">
                                                                            <td colSpan={10} className="px-8 py-2">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Office / Admin Staff:</span>
                                                                                    <div className="flex flex-wrap gap-2">
                                                                                        {orgUsers.map((u, idx) => (
                                                                                            <span key={idx} className="px-2 py-0.5 rounded-lg bg-primary/5 border border-primary/20 text-[10px] text-primary/80 font-medium">
                                                                                                {u.name} ({u.roles?.[0]})
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })()}
                                                            </>
                                                        )}
                                                    </Fragment>
                                                );
                                            })}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
                    <div className="relative w-full max-w-md glass rounded-3xl border border-white/10 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white">
                                {editingOrg ? "Edit Organization" : "New Organization"}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {!editingOrg && !isRestricted && (
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">
                                        Parent Organization
                                    </label>
                                    <select
                                        value={selectedParentId}
                                        onChange={(e) => setSelectedParentId(e.target.value as Id<"organizations">)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    >
                                        <option value="">No Parent (Root Organization)</option>
                                        {orgs?.filter((o: any) => !o.parentOrganizationId).map((o: any) => (
                                            <option key={o._id} value={o._id}>{o.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-muted-foreground ml-1 italic">
                                        Sub-organizations belong to a parent (Root) organization.
                                    </p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">
                                    Display Name
                                </label>
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder="Enter organization name..."
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    disabled={editingOrg ? !orgs?.find((org: any) => org._id === editingOrg.id)?.parentOrganizationId : false}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">
                                    Status
                                </label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">
                                    Organization Access
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {([
                                        ["patrolling", "Patrolling"],
                                        ["visits", "Visits"],
                                        ["attendance", "Attendance"],
                                    ] as const).map(([key, label]) => (
                                        <div key={key} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between">
                                            <span className="text-sm text-white">{label}</span>
                                            {renderToggle(
                                                access[key],
                                                () => setAccess({ ...access, [key]: !access[key] }),
                                                `Toggle ${label.toLowerCase()} access`
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white font-semibold hover:bg-white/5 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !name.trim()}
                                    className="flex-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <Check className="w-5 h-5" />
                                    )}
                                    {editingOrg ? "Update Name" : "Create Organization"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
}
