import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Layout } from "../../../components/Layout";
import { Plus, MapPin, Search, Loader2, Edit2, Trash2, X, ChevronDown, ChevronRight, Clock, Users, UserPlus, UserMinus, Check } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useQuery, useMutation } from "convex/react";
const MapPicker = dynamic(() => import("../../../components/MapPicker").then(mod => mod.MapPicker), { ssr: false });
import { api } from "../../../services/convex";
import { useUser } from "@clerk/nextjs";
import type { Id } from "../../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { getUserRoles, userHasRole, userHasAnyRole, ADMIN_ROLES, RESTRICTED_ROLES } from "../../../lib/userRoles";

type SiteShift = {
    name: string;
    start: string;
    end: string;
    strength: number;
};

type SiteFormState = {
    id?: Id<"sites">;
    name: string;
    latitude: number;
    longitude: number;
    allowedRadius: number;
    regionId?: string;
    city?: string;
    shifts: SiteShift[];
    organizationId?: Id<"organizations">;
};

const createDefaultShift = (): SiteShift => ({
    name: "Shift 1",
    start: "08:00",
    end: "20:00",
    strength: 1,
});

const createDefaultSiteForm = (): SiteFormState => ({
    name: "",
    latitude: 0,
    longitude: 0,
    allowedRadius: 100,
    regionId: "",
    city: "",
    shifts: [createDefaultShift()],
    organizationId: undefined,
});

export default function SiteManagement() {
    const { user } = useUser();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingSite, setEditingSite] = useState<SiteFormState | null>(null);
    const [isDeletingId, setIsDeletingId] = useState<Id<"sites"> | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [newSite, setNewSite] = useState<SiteFormState>(createDefaultSiteForm());
    const [expandedSiteId, setExpandedSiteId] = useState<Id<"sites"> | null>(null);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [assigningSiteId, setAssigningSiteId] = useState<Id<"sites"> | null>(null);
    const [assignSearchQuery, setAssignSearchQuery] = useState("");
    const [showMapPicker, setShowMapPicker] = useState(false);
    const [showEditMapPicker, setShowEditMapPicker] = useState(false);
    const [shiftEditor, setShiftEditor] = useState<{
        siteId: Id<"sites">;
        shiftIndex: number | null;
        shift: SiteShift;
    } | null>(null);

    const createSite = useMutation(api.sites.createSite);
    const updateSite = useMutation(api.sites.updateSite);
    const removeSite = useMutation(api.sites.removeSite);
    const updateUser = useMutation(api.users.update);

    const currentUser = useQuery(api.users.getByClerkId, user?.id ? { clerkId: user.id } : "skip");
    const organizationId = currentUser?.organizationId;
    const regions = useQuery(api.regions.list, {});
    const allSites = useQuery(api.sites.listAll, {});
    const orgSites = useQuery(api.sites.listSitesByOrg, organizationId ? { 
        organizationId,
        requestingUserId: currentUser?._id
    } : "skip");
    const allOrgs = useQuery(api.organizations.list, { 
        requestingUserId: currentUser?._id 
    });
    const allUsers = useQuery(api.users.listAll, {});

    const isRestricted = userHasAnyRole(currentUser, RESTRICTED_ROLES as any);
    const isSuperAdmin =
        userHasAnyRole(currentUser, ["Owner", "Deployment Manager"] as any);
    const isAdmin = isSuperAdmin || userHasRole(currentUser, "Manager") || userHasRole(currentUser, "Visiting Officer");
    const sites = isSuperAdmin ? allSites : orgSites;
    const assignableUsers = useMemo(
        () =>
            (allUsers || []).filter(
                (u: any) =>
                    (userHasRole(u, "SO") || userHasRole(u, "Client")) && (!organizationId || u.organizationId === organizationId)
            ),
        [allUsers, organizationId]
    );

    const filteredSites = useMemo(
        () => (sites || []).filter((site: any) =>
            site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            site.regionId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            site.city?.toLowerCase().includes(searchQuery.toLowerCase())
        ),
        [sites, searchQuery]
    );

    const getRegionCities = (regionId?: string) => {
        if (!regionId || !regions) return [];
        return regions.find((region: any) => region.regionId === regionId)?.cities || [];
    };

    const normalizeShifts = (shifts: SiteShift[]) =>
        shifts
            .map((shift, index) => ({
                name: shift.name.trim() || `Shift ${index + 1}`,
                start: shift.start,
                end: shift.end,
                strength: Number(shift.strength) || 0,
            }))
            .filter((shift) => shift.start && shift.end);

    const buildSitePayload = (site: SiteFormState) => {
        const shifts = normalizeShifts(site.shifts);
        return {
            name: site.name.trim(),
            latitude: site.latitude,
            longitude: site.longitude,
            allowedRadius: site.allowedRadius,
            regionId: site.regionId || undefined,
            city: site.city || undefined,
            shifts,
            shiftStart: shifts[0]?.start,
            shiftEnd: shifts[0]?.end,
        };
    };

    const resetNewSite = () => {
        setNewSite(createDefaultSiteForm());
        setShowMapPicker(false);
    };

    const addShiftRow = (target: "new" | "edit") => {
        if (target === "new") {
            setNewSite((current) => ({
                ...current,
                shifts: [...current.shifts, { ...createDefaultShift(), name: `Shift ${current.shifts.length + 1}` }],
            }));
            return;
        }

        if (!editingSite) return;
        setEditingSite({
            ...editingSite,
            shifts: [...editingSite.shifts, { ...createDefaultShift(), name: `Shift ${editingSite.shifts.length + 1}` }],
        });
    };

    const updateShiftRow = (target: "new" | "edit", index: number, field: keyof SiteShift, value: string | number) => {
        const updater = (shifts: SiteShift[]) =>
            shifts.map((shift, shiftIndex) => shiftIndex === index ? { ...shift, [field]: value } : shift);

        if (target === "new") {
            setNewSite((current) => ({ ...current, shifts: updater(current.shifts) }));
            return;
        }

        if (!editingSite) return;
        setEditingSite({ ...editingSite, shifts: updater(editingSite.shifts) });
    };

    const removeShiftRow = (target: "new" | "edit", index: number) => {
        const remover = (shifts: SiteShift[]) => {
            if (shifts.length === 1) {
                toast.error("At least one shift is required");
                return shifts;
            }
            return shifts.filter((_, shiftIndex) => shiftIndex !== index);
        };

        if (target === "new") {
            setNewSite((current) => ({ ...current, shifts: remover(current.shifts) }));
            return;
        }

        if (!editingSite) return;
        setEditingSite({ ...editingSite, shifts: remover(editingSite.shifts) });
    };

    const handleGetCurrentLocation = (target: "new" | "edit") => {
        if (!navigator.geolocation) {
            toast.error("Geolocation is not supported by your browser");
            return;
        }

        const toastId = toast.loading("Fetching current location...");
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                if (target === "new") {
                    setNewSite((current) => ({ ...current, latitude, longitude }));
                } else if (editingSite) {
                    setEditingSite({ ...editingSite, latitude, longitude });
                }
                toast.success("Location updated", { id: toastId });
            },
            (error) => {
                toast.error(`Failed to get location: ${error.message}`, { id: toastId });
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const handleAddSite = async () => {
        if (!newSite.name.trim()) {
            toast.error("Please enter site name");
            return;
        }

        const shifts = normalizeShifts(newSite.shifts);
        if (shifts.length === 0) {
            toast.error("Please add at least one shift");
            return;
        }

        try {
            await createSite({
                ...buildSitePayload(newSite),
                organizationId: newSite.organizationId || organizationId,
            });
            setIsAddModalOpen(false);
            resetNewSite();
            toast.success("Site created successfully");
        } catch (error: any) {
            toast.error(error.message || "Failed to create site");
        }
    };

    const handleUpdateSite = async () => {
        if (!editingSite?.id) return;
        if (!editingSite.name.trim()) {
            toast.error("Please enter site name");
            return;
        }

        const shifts = normalizeShifts(editingSite.shifts);
        if (shifts.length === 0) {
            toast.error("Please keep at least one shift");
            return;
        }

        try {
            await updateSite({
                id: editingSite.id,
                ...buildSitePayload(editingSite),
                organizationId: editingSite.organizationId || organizationId,
            });
            setEditingSite(null);
            setShowEditMapPicker(false);
            toast.success("Site updated successfully");
        } catch (error: any) {
            toast.error(error.message || "Failed to update site");
        }
    };

    const handleDeleteSite = async (id: Id<"sites">) => {
        try {
            await removeSite({ id });
            setIsDeletingId(null);
            toast.success("Site deleted successfully");
        } catch (error: any) {
            toast.error(error.message || "Failed to delete site");
        }
    };

    const handleUpdateSiteShifts = async (site: any, shifts: SiteShift[]) => {
        await updateSite({
            id: site._id,
            name: site.name,
            latitude: site.latitude,
            longitude: site.longitude,
            allowedRadius: site.allowedRadius,
            regionId: site.regionId,
            city: site.city,
            shifts,
            shiftStart: shifts[0]?.start,
            shiftEnd: shifts[0]?.end,
            organizationId: site.organizationId,
        });
    };

    const handleDeleteShift = async (site: any, shiftIndex: number) => {
        const nextShifts = (site.shifts || []).filter((_: any, index: number) => index !== shiftIndex);
        if (nextShifts.length === 0) {
            toast.error("At least one shift is required");
            return;
        }

        try {
            await handleUpdateSiteShifts(site, nextShifts);
            toast.success("Shift deleted");
        } catch (error: any) {
            toast.error(error.message || "Failed to delete shift");
        }
    };

    const handleSaveShift = async () => {
        if (!shiftEditor) return;
        const site = sites?.find((item: any) => item._id === shiftEditor.siteId);
        if (!site) return;

        const currentShifts = [...(site.shifts || [])];
        if (shiftEditor.shiftIndex === null) {
            currentShifts.push(shiftEditor.shift);
        } else {
            currentShifts[shiftEditor.shiftIndex] = shiftEditor.shift;
        }

        try {
            await handleUpdateSiteShifts(site, currentShifts);
            setShiftEditor(null);
            toast.success(`Shift ${shiftEditor.shiftIndex === null ? "added" : "updated"} successfully`);
        } catch (error: any) {
            toast.error(error.message || "Failed to save shift");
        }
    };

    const assignOfficerToSite = async (officer: any, siteId: Id<"sites">) => {
        const currentSiteIds = officer.siteIds || [];
        if (currentSiteIds.includes(siteId)) return;

        await updateUser({
            id: officer._id,
            name: officer.name,
            roles: getUserRoles(officer),
            email: officer.email,
            mobileNumber: officer.mobileNumber,
            organizationId: officer.organizationId,
            regionId: officer.regionId,
            cities: officer.cities,
            permissions: officer.permissions,
            siteIds: [...currentSiteIds, siteId],
        } as any);
    };

    const unassignOfficerFromSite = async (officer: any, siteId: Id<"sites">) => {
        await updateUser({
            id: officer._id,
            name: officer.name,
            roles: getUserRoles(officer),
            email: officer.email,
            mobileNumber: officer.mobileNumber,
            organizationId: officer.organizationId,
            regionId: officer.regionId,
            cities: officer.cities,
            permissions: officer.permissions,
            siteIds: (officer.siteIds || []).filter((currentSiteId: Id<"sites">) => currentSiteId !== siteId),
        } as any);
    };

    if (currentUser === undefined || (organizationId && sites === undefined) || regions === undefined) {
        return (
            <Layout title="Site Management">
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            </Layout>
        );
    }

    if (!currentUser || !organizationId) {
        return (
            <Layout title="Site Management">
                <div className="glass rounded-2xl border border-white/10 p-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                        <MapPin className="w-8 h-8 text-primary" />
                    </div>
                    <div className="max-w-md mx-auto">
                        <h3 className="text-xl font-bold text-white">Organization Not Assigned</h3>
                        <p className="text-sm text-muted-foreground mt-2">
                            You need organization access before managing sites.
                        </p>
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="Site Management">
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search sites..."
                            className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 w-full sm:w-72"
                        />
                    </div>
                    {isAdmin && (
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)]"
                        >
                            <Plus className="w-4 h-4" />
                            Add New Site
                        </button>
                    )}
                </div>

                <div className="glass rounded-2xl border border-white/10 overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left min-w-[900px]">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/[0.02]">
                                    <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Site Name</th>
                                    <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Region / City</th>
                                    <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Radius</th>
                                    <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Coordinates</th>
                                    <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shifts</th>
                                    <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredSites.map((site: any) => (
                                    <React.Fragment key={site._id}>
                                        <tr
                                            className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                                            onClick={() => setExpandedSiteId(expandedSiteId === site._id ? null : site._id)}
                                        >
                                            <td className="px-4 sm:px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="text-muted-foreground">
                                                        {expandedSiteId === site._id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                    </div>
                                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                                        <MapPin className="w-4 h-4 text-primary" />
                                                    </div>
                                                    <span className="text-sm font-medium text-white">{site.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-sm text-muted-foreground">
                                                {site.regionId ? `${site.regionId}${site.city ? ` / ${site.city}` : ""}` : "Not assigned"}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-sm text-white">{site.allowedRadius} m</td>
                                            <td className="px-4 sm:px-6 py-4 text-xs font-mono text-muted-foreground">
                                                {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-sm text-white">{site.shifts?.length || 0}</td>
                                            <td className="px-4 sm:px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                {isAdmin && (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => setEditingSite({
                                                                id: site._id,
                                                                name: site.name,
                                                                latitude: site.latitude,
                                                                longitude: site.longitude,
                                                                allowedRadius: site.allowedRadius,
                                                                regionId: site.regionId || "",
                                                                city: site.city || "",
                                                                shifts: site.shifts?.length ? site.shifts : [createDefaultShift()],
                                                                organizationId: site.organizationId,
                                                            })}
                                                            className="p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setIsDeletingId(site._id)}
                                                            className="p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                        {expandedSiteId === site._id && (
                                            <tr className="bg-white/[0.01]">
                                                <td colSpan={6} className="px-6 py-4 bg-primary/5">
                                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                                        <div className="space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <h4 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                                                                    <Clock className="w-3.5 h-3.5" />
                                                                    Shift Details
                                                                </h4>
                                                                {isAdmin && (
                                                                    <button
                                                                        onClick={() => setShiftEditor({
                                                                            siteId: site._id,
                                                                            shiftIndex: null,
                                                                            shift: { ...createDefaultShift(), name: `Shift ${(site.shifts?.length || 0) + 1}` },
                                                                        })}
                                                                        className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-bold hover:bg-primary/20 transition-all border border-primary/20"
                                                                    >
                                                                        <Plus className="w-3 h-3" />
                                                                        Add New Shift
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <div className="space-y-3">
                                                                {(site.shifts || []).map((shift: SiteShift, index: number) => (
                                                                    <div key={`${site._id}-${index}`} className="glass rounded-xl p-4 border border-white/5">
                                                                        <div className="flex items-center justify-between gap-3">
                                                                            <div>
                                                                                <p className="text-sm font-semibold text-white">{shift.name}</p>
                                                                                <p className="text-xs text-muted-foreground">{shift.start} - {shift.end}</p>
                                                                                <p className="text-xs text-muted-foreground mt-1">Shift Strength: {shift.strength}</p>
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                {isAdmin && (
                                                                                    <>
                                                                                        <button
                                                                                            onClick={() => setShiftEditor({ siteId: site._id, shiftIndex: index, shift: { ...shift } })}
                                                                                            className="p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                                                                                        >
                                                                                            <Edit2 className="w-4 h-4" />
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => handleDeleteShift(site, index)}
                                                                                            className="p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                                                                                        >
                                                                                            <Trash2 className="w-4 h-4" />
                                                                                        </button>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        <div className="space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <h4 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                                                                    <Users className="w-3.5 h-3.5" />
                                                                    Assigned Officers & Clients
                                                                </h4>
                                                                {isAdmin && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setAssigningSiteId(site._id);
                                                                            setIsAssignModalOpen(true);
                                                                        }}
                                                                        className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-bold hover:bg-primary/20 transition-all border border-primary/20"
                                                                    >
                                                                        <UserPlus className="w-3 h-3" />
                                                                        Add Officer
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <div className="glass rounded-xl p-4 border border-white/5 min-h-[60px]">
                                                                <SiteOfficersList
                                                                    siteId={site._id}
                                                                    allUsers={assignableUsers}
                                                                    onRemove={isAdmin ? async (officerId) => {
                                                                        const officer = assignableUsers.find((currentOfficer: any) => currentOfficer._id === officerId);
                                                                        if (!officer) return;
                                                                        try {
                                                                            await unassignOfficerFromSite(officer, site._id);
                                                                            toast.success(`${officer.name} unassigned`);
                                                                        } catch (error: any) {
                                                                            toast.error(error.message || "Failed to unassign officer");
                                                                        }
                                                                    } : undefined}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                                {filteredSites.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground text-sm">
                                            No sites found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {isAssignModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass w-full max-w-md max-h-[80vh] overflow-hidden rounded-2xl border border-white/10 flex flex-col">
                        <div className="p-4 sm:p-6 border-b border-white/5 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-primary" />
                                Add Officer
                            </h3>
                            <button onClick={() => setIsAssignModalOpen(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="p-4 border-b border-white/5">
                            <div className="relative group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <input
                                    type="text"
                                    value={assignSearchQuery}
                                    onChange={(e) => setAssignSearchQuery(e.target.value)}
                                    placeholder="Search officers and clients..."
                                    className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-white"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {allUsers === undefined ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                </div>
                            ) : (
                                assignableUsers
                                    .filter((officer: any) =>
                                        officer.name.toLowerCase().includes(assignSearchQuery.toLowerCase()) ||
                                        officer.email?.toLowerCase().includes(assignSearchQuery.toLowerCase()) ||
                                        officer.mobileNumber?.toLowerCase().includes(assignSearchQuery.toLowerCase())
                                    )
                                    .map((officer: any) => {
                                        const isAssigned = officer.siteIds?.includes(assigningSiteId!);
                                        return (
                                            <button
                                                key={officer._id}
                                                disabled={isAssigned}
                                                onClick={async () => {
                                                    if (!assigningSiteId || isAssigned) return;
                                                    try {
                                                        await assignOfficerToSite(officer, assigningSiteId);
                                                        toast.success(`${officer.name} assigned successfully`);
                                                    } catch (error: any) {
                                                        toast.error(error.message || "Failed to assign officer");
                                                    }
                                                }}
                                                className={cn(
                                                    "w-full flex items-center gap-3 p-3 border rounded-xl transition-all",
                                                    isAssigned
                                                        ? "bg-emerald-500/5 border-emerald-500/20 cursor-default"
                                                        : "bg-white/5 border-white/10 hover:bg-white/10"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                                                    isAssigned ? "bg-emerald-500/20 text-emerald-500" : "bg-primary/20 text-primary"
                                                )}>
                                                    {isAssigned ? <Check className="w-5 h-5" /> : officer.name.charAt(0)}
                                                </div>
                                                <div className="text-left flex-1">
                                                    <div className="text-sm font-medium text-white">{officer.name}</div>
                                                    <div className="text-xs text-muted-foreground">{officer.mobileNumber || officer.email || getUserRoles(officer).join(", ") || "—"}</div>
                                                </div>
                                            </button>
                                        );
                                    })
                            )}
                        </div>
                        <div className="p-4 border-t border-white/5 bg-white/5 flex justify-end">
                            <button
                                onClick={() => {
                                    setIsAssignModalOpen(false);
                                    setAssignSearchQuery("");
                                }}
                                className="px-6 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-lg"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isAddModalOpen && (
                <SiteModal
                    title="Add New Site"
                    form={newSite}
                    regions={regions}
                    showMapPicker={showMapPicker}
                    onClose={() => {
                        setIsAddModalOpen(false);
                        resetNewSite();
                    }}
                    onChange={setNewSite}
                    onToggleMap={() => setShowMapPicker((current) => !current)}
                    onCurrentLocation={() => handleGetCurrentLocation("new")}
                    onAddShift={() => addShiftRow("new")}
                    onUpdateShift={(index, field, value) => updateShiftRow("new", index, field, value)}
                    onRemoveShift={(index) => removeShiftRow("new", index)}
                    onSubmit={handleAddSite}
                    submitLabel="Create Site"
                    getRegionCities={getRegionCities}
                    organizations={allOrgs}
                    isAdmin={isAdmin}
                />
            )}

            {editingSite && (
                <SiteModal
                    title="Edit Site"
                    form={editingSite}
                    regions={regions}
                    showMapPicker={showEditMapPicker}
                    onClose={() => {
                        setEditingSite(null);
                        setShowEditMapPicker(false);
                    }}
                    onChange={setEditingSite}
                    onToggleMap={() => setShowEditMapPicker((current) => !current)}
                    onCurrentLocation={() => handleGetCurrentLocation("edit")}
                    onAddShift={() => addShiftRow("edit")}
                    onUpdateShift={(index, field, value) => updateShiftRow("edit", index, field, value)}
                    onRemoveShift={(index) => removeShiftRow("edit", index)}
                    onSubmit={handleUpdateSite}
                    submitLabel="Save Changes"
                    getRegionCities={getRegionCities}
                    organizations={allOrgs}
                    isAdmin={isAdmin}
                />
            )}

            {shiftEditor && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass w-full max-w-md rounded-2xl border border-white/10 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white">
                                {shiftEditor.shiftIndex === null ? "Add Shift" : "Edit Shift"}
                            </h3>
                            <button onClick={() => setShiftEditor(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase">Shift Name</label>
                                <input
                                    value={shiftEditor.shift.name}
                                    onChange={(e) => setShiftEditor({ ...shiftEditor, shift: { ...shiftEditor.shift, name: e.target.value } })}
                                    className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase">Start</label>
                                    <input
                                        type="time"
                                        value={shiftEditor.shift.start}
                                        onChange={(e) => setShiftEditor({ ...shiftEditor, shift: { ...shiftEditor.shift, start: e.target.value } })}
                                        className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase">End</label>
                                    <input
                                        type="time"
                                        value={shiftEditor.shift.end}
                                        onChange={(e) => setShiftEditor({ ...shiftEditor, shift: { ...shiftEditor.shift, end: e.target.value } })}
                                        className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase">Shift Strength</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={shiftEditor.shift.strength}
                                    onChange={(e) => setShiftEditor({ ...shiftEditor, shift: { ...shiftEditor.shift, strength: parseInt(e.target.value) || 0 } })}
                                    className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl"
                                />
                            </div>
                        </div>
                        <button onClick={handleSaveShift} className="w-full py-2 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90">
                            Save Shift
                        </button>
                    </div>
                </div>
            )}

            {isDeletingId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass w-full max-w-sm rounded-2xl border border-white/10 p-6 space-y-4 text-center">
                        <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                            <Trash2 className="w-6 h-6 text-red-500" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-white">Delete Site?</h3>
                            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setIsDeletingId(null)} className="flex-1 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors">Cancel</button>
                            <button onClick={() => handleDeleteSite(isDeletingId)} className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}

function SiteModal({
    title,
    form,
    regions,
    organizations,
    isAdmin,
    showMapPicker,
    onClose,
    onChange,
    onToggleMap,
    onCurrentLocation,
    onAddShift,
    onUpdateShift,
    onRemoveShift,
    onSubmit,
    submitLabel,
    getRegionCities,
}: {
    title: string;
    form: SiteFormState;
    regions: any[] | undefined;
    organizations: any[] | undefined;
    isAdmin: boolean;
    showMapPicker: boolean;
    onClose: () => void;
    onChange: (nextForm: any) => void;
    onToggleMap: () => void;
    onCurrentLocation: () => void;
    onAddShift: () => void;
    onUpdateShift: (index: number, field: keyof SiteShift, value: string | number) => void;
    onRemoveShift: (index: number) => void;
    onSubmit: () => void;
    submitLabel: string;
    getRegionCities: (regionId?: string) => string[];
}) {
    const cities = getRegionCities(form.regionId);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 p-4 sm:p-6 space-y-4 custom-scrollbar">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">{title}</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
                </div>

                <div className="space-y-4">
                    {isAdmin && (
                        <div>
                            <label className="text-xs font-medium text-muted-foreground uppercase">Organization</label>
                            <select
                                value={form.organizationId || ""}
                                onChange={(e) => onChange({ ...form, organizationId: e.target.value as Id<"organizations"> })}
                                className="w-full mt-1 px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-white"
                            >
                                <option value="">Default (Your Organization)</option>
                                {organizations?.map((org: any) => (
                                    <option key={org._id} value={org._id}>
                                        {org.name} {org.parentOrganizationId ? "(Sub-Org)" : "(Root)"}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase">Site Name</label>
                        <input
                            value={form.name}
                            onChange={(e) => onChange({ ...form, name: e.target.value })}
                            className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-medium text-muted-foreground uppercase">Region</label>
                            <select
                                value={form.regionId || ""}
                                onChange={(e) => onChange({ ...form, regionId: e.target.value, city: "" })}
                                className="w-full mt-1 px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-white"
                            >
                                <option value="">Select Region (Optional)</option>
                                {regions?.map((region: any) => (
                                    <option key={region._id} value={region.regionId}>
                                        {region.regionName} ({region.regionId})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground uppercase">City</label>
                            <select
                                value={form.city || ""}
                                onChange={(e) => onChange({ ...form, city: e.target.value })}
                                className="w-full mt-1 px-4 py-2 bg-neutral-900 border border-white/10 rounded-xl text-white"
                                disabled={!form.regionId}
                            >
                                <option value="">Select City (Optional)</option>
                                {cities.map((city) => (
                                    <option key={city} value={city}>{city}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-muted-foreground uppercase">Latitude</label>
                                <div className="flex gap-2">
                                    <button onClick={onCurrentLocation} className="text-[10px] text-primary hover:underline">Current</button>
                                    <button onClick={onToggleMap} className="text-[10px] text-primary hover:underline">Pick Map</button>
                                </div>
                            </div>
                            <input
                                type="number"
                                step="any"
                                value={form.latitude}
                                onChange={(e) => onChange({ ...form, latitude: parseFloat(e.target.value) || 0 })}
                                className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground uppercase">Longitude</label>
                            <input
                                type="number"
                                step="any"
                                value={form.longitude}
                                onChange={(e) => onChange({ ...form, longitude: parseFloat(e.target.value) || 0 })}
                                className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl"
                            />
                        </div>
                    </div>

                    {showMapPicker && (
                        <MapPicker
                            initialLat={form.latitude}
                            initialLng={form.longitude}
                            onLocationSelect={(latitude, longitude) => onChange({ ...form, latitude, longitude })}
                        />
                    )}

                    <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase">Allowed Radius (m)</label>
                        <input
                            type="number"
                            value={form.allowedRadius}
                            onChange={(e) => onChange({ ...form, allowedRadius: parseInt(e.target.value) || 0 })}
                            className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl"
                        />
                    </div>

                    <div className="space-y-3 border-t border-white/5 pt-4">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground uppercase">Shifts</label>
                            <button onClick={onAddShift} className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-bold border border-primary/20">
                                <Plus className="w-3 h-3" />
                                Add New Shift
                            </button>
                        </div>
                        <div className="space-y-3">
                            {form.shifts.map((shift, index) => (
                                <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-medium text-muted-foreground uppercase">Shift Name</label>
                                        <input
                                            value={shift.name}
                                            onChange={(e) => onUpdateShift(index, "name", e.target.value)}
                                            className="w-full mt-1 px-3 py-2 bg-black/20 border border-white/10 rounded-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-medium text-muted-foreground uppercase">Start</label>
                                        <input
                                            type="time"
                                            value={shift.start}
                                            onChange={(e) => onUpdateShift(index, "start", e.target.value)}
                                            className="w-full mt-1 px-3 py-2 bg-black/20 border border-white/10 rounded-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-medium text-muted-foreground uppercase">End</label>
                                        <input
                                            type="time"
                                            value={shift.end}
                                            onChange={(e) => onUpdateShift(index, "end", e.target.value)}
                                            className="w-full mt-1 px-3 py-2 bg-black/20 border border-white/10 rounded-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-medium text-muted-foreground uppercase">Strength</label>
                                        <div className="mt-1 flex gap-2">
                                            <input
                                                type="number"
                                                min="0"
                                                value={shift.strength}
                                                onChange={(e) => onUpdateShift(index, "strength", parseInt(e.target.value) || 0)}
                                                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg"
                                            />
                                            <button
                                                onClick={() => onRemoveShift(index)}
                                                className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <button onClick={onSubmit} className="w-full py-2 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-all">
                    {submitLabel}
                </button>
            </div>
        </div>
    );
}

function SiteOfficersList({ siteId, allUsers, onRemove }: {
    siteId: Id<"sites">;
    allUsers: any[] | undefined;
    onRemove?: (id: Id<"users">) => void | Promise<void>;
}) {
    if (allUsers === undefined) {
        return <div className="text-xs text-muted-foreground italic flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Loading officers...</div>;
    }

    const officers = allUsers.filter(
        (u: any) =>
            (userHasRole(u, "SO") || userHasRole(u, "Client")) && ((u.siteIds && u.siteIds.includes(siteId)) || u.siteId === siteId)
    );
    if (officers.length === 0) {
        return <div className="text-xs text-muted-foreground italic">No officers or clients assigned to this site.</div>;
    }

    return (
        <div className="flex flex-wrap gap-2">
            {officers.map((officer: any) => (
                <div key={officer._id} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                        {officer.name.charAt(0)}
                    </div>
                    <div>
                        <div className="text-xs font-medium text-white">{officer.name}</div>
                        <div className="text-[10px] text-muted-foreground">{getUserRoles(officer).join(", ") || "—"}</div>
                    </div>
                    {onRemove && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove(officer._id);
                            }}
                            className="p-1.5 bg-white/5 hover:bg-red-500/20 rounded-lg text-red-400 transition-all"
                        >
                            <UserMinus className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
