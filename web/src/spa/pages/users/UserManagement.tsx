import { useState, useMemo, useCallback } from "react";
import { Layout } from "../../../components/Layout";
import { Plus, User, Mail, Shield, Search, Loader2, Edit2, Trash2, X, Smartphone, Check, ChevronDown, Building } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../services/convex";
import { useUser } from "@clerk/nextjs";
import type { Id } from "../../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { getUserRoles } from "../../../lib/userRoles";

// Updated roles as per schema
const ROLES = ["Owner", "Deployment Manager", "Manager", "Visiting Officer", "SO", "Client", "NEW_USER"] as const;
type Role = typeof ROLES[number];
type UserStatus = "active" | "inactive";
type EnrolledStatus = "active" | "inactive";

interface CitySelection {
    all: boolean;
    selected: string[];
}

export default function UserManagement() {
    const { user } = useUser();
    const [activeTab, setActiveTab] = useState<"users" | "enrolled">("users");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [isDeletingId, setIsDeletingId] = useState<Id<"users"> | null>(null);
    const [editingEnrollment, setEditingEnrollment] = useState<any>(null);
    const [isDeletingEnrollmentId, setIsDeletingEnrollmentId] = useState<Id<"enrolledPersons"> | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>("");

    // Form states
    const [newName, setNewName] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newMobile, setNewMobile] = useState("");
    const [newRoles, setNewRoles] = useState<Role[]>(["Visiting Officer"]);
    const [newStatus, setNewStatus] = useState<UserStatus>("active");
    const [newRegionId, setNewRegionId] = useState("");
    const [citySelection, setCitySelection] = useState<CitySelection>({ all: true, selected: [] });
    const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
    const [isEditCityDropdownOpen, setIsEditCityDropdownOpen] = useState(false);
    const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
    const [isEditPermissionsOpen, setIsEditPermissionsOpen] = useState(false);

    const [newPermissions, setNewPermissions] = useState({
        users: false,
        sites: false,
        patrolPoints: false,
        patrolLogs: true,
        visitLogs: true,
        issues: true,
        analytics: true,
        attendance: true,
        regions: false,
    });

    // Mutations
    const createUser = useMutation(api.users.create);
    const updateUser = useMutation(api.users.update);
    const setUserStatus = useMutation(api.users.setStatus);
    const removeUser = useMutation(api.users.remove);
    const updateEnrollment = useMutation(api.enrollment.update);
    const setEnrollmentStatus = useMutation(api.enrollment.setStatus);
    const removeEnrollment = useMutation(api.enrollment.remove);

    // Queries
    const currentUser = useQuery(api.users.getByClerkId,
        user?.id ? { clerkId: user.id } : "skip"
    );

    const regions = useQuery(api.regions.list, {});
    const allUsers = useQuery(api.users.listAll);
    const isRestricted = (currentUser?.roles || []).some((r: string) => ["Client", "SO"].includes(r));
    const isSuperAdmin =
        getUserRoles(currentUser).includes("Owner") ||
        getUserRoles(currentUser).includes("Deployment Manager");
    const isAdmin = isSuperAdmin || getUserRoles(currentUser).includes("Manager");

    const orgUsers = useQuery(api.users.listByOrg,
        (currentUser?.organizationId || (isSuperAdmin && selectedOrganizationId)) ? { 
            organizationId: (selectedOrganizationId as Id<"organizations">) || (currentUser?.organizationId as Id<"organizations">),
            requestingUserId: currentUser?._id
        } : "skip"
    );

    const orgs = useQuery(
        api.organizations.list,
        currentUser?._id ? { 
            currentOrganizationId: currentUser.organizationId,
            requestingUserId: currentUser._id 
        } : "skip"
    );

    const users = isSuperAdmin 
        ? (selectedOrganizationId ? orgUsers : allUsers)
        : orgUsers;
    const enrolledPersons = useQuery(
        api.enrollment.list,
        isSuperAdmin
            ? (selectedOrganizationId ? { organizationId: selectedOrganizationId as Id<"organizations"> } : {})
            : currentUser?.organizationId
              ? { organizationId: (selectedOrganizationId as Id<"organizations">) || currentUser.organizationId }
              : "skip"
    );

    // Get current region's cities
    const currentRegionCities = useMemo(() => {
        if (!newRegionId || !regions) return [];
        const region = regions.find(r => r.regionId === newRegionId);
        return region?.cities || [];
    }, [newRegionId, regions]);

    const editingRegionCities = useMemo(() => {
        if (!editingUser?.regionId || !regions) return [];
        const region = regions.find(r => r.regionId === editingUser.regionId);
        return region?.cities || [];
    }, [editingUser?.regionId, regions]);

    // Filtered users
    const filteredUsers = useMemo(
        () =>
            users?.filter((u: any) => {
                const rq = searchQuery.toLowerCase();
                const rolesStr = getUserRoles(u).join(" ").toLowerCase();
                return (
                    u.name.toLowerCase().includes(rq) ||
                    rolesStr.includes(rq) ||
                    (u.email && u.email.toLowerCase().includes(rq))
                );
            }) || [],
        [users, searchQuery]
    );
    const filteredEnrollments = useMemo(
        () =>
            enrolledPersons?.filter((p: any) => {
                const q = searchQuery.toLowerCase();
                return (
                    String(p.name || "").toLowerCase().includes(q) ||
                    String(p.empId || "").toLowerCase().includes(q) ||
                    String(p.empRank || "").toLowerCase().includes(q) ||
                    String(p.region || "").toLowerCase().includes(q)
                );
            }) || [],
        [enrolledPersons, searchQuery]
    );

    const toggleNewRole = useCallback((r: Role) => {
        setNewRoles((prev) => {
            const next = prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r];
            return next.length ? next : prev;
        });
    }, []);

    const toggleEditRole = useCallback((r: Role) => {
        if (!editingUser) return;
        const cur = getUserRoles(editingUser);
        const next = cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r];
        if (next.length === 0) {
            toast.error("At least one role is required");
            return;
        }
        setEditingUser({ ...editingUser, roles: next as Role[] });
    }, [editingUser]);

    // Handle city selection
    const handleCityToggle = useCallback((city: string) => {
        setCitySelection(prev => {
            if (prev.all) {
                // If "all" was selected, switch to specific selection
                return { all: false, selected: [city] };
            } else {
                // Toggle specific city
                const newSelected = prev.selected.includes(city)
                    ? prev.selected.filter(c => c !== city)
                    : [...prev.selected, city];

                // If all cities are selected, switch to "all" mode
                if (newSelected.length === currentRegionCities.length && currentRegionCities.length > 0) {
                    return { all: true, selected: [] };
                }
                return { ...prev, selected: newSelected };
            }
        });
    }, [currentRegionCities.length]);

    const handleSelectAllCities = useCallback(() => {
        setCitySelection({ all: true, selected: [] });
    }, []);

    const handleClearCities = useCallback(() => {
        setCitySelection({ all: false, selected: [] });
    }, []);

    const updateEditingCities = useCallback((cities: string[]) => {
        if (!editingUser) return;
        setEditingUser({ ...editingUser, cities });
    }, [editingUser]);

    const handleEditCityToggle = useCallback((city: string) => {
        if (!editingUser) return;
        const currentCities = editingUser.cities || [];
        const nextCities = currentCities.includes(city)
            ? currentCities.filter((c: string) => c !== city)
            : [...currentCities, city];
        updateEditingCities(nextCities);
    }, [editingUser, updateEditingCities]);

    const handleEditSelectAllCities = useCallback(() => {
        updateEditingCities(editingRegionCities);
    }, [editingRegionCities, updateEditingCities]);

    const handleEditClearCities = useCallback(() => {
        updateEditingCities([]);
    }, [updateEditingCities]);

    // Reset form
    const resetForm = useCallback(() => {
        setNewName("");
        setNewEmail("");
        setNewMobile("");
        setNewRoles(["Visiting Officer"]);
        setNewStatus("active");
        setNewRegionId("");
        setCitySelection({ all: true, selected: [] });
        setNewPermissions({
            users: false,
            sites: false,
            patrolPoints: false,
            patrolLogs: true,
            visitLogs: true,
            issues: true,
            analytics: true,
            attendance: true,
            regions: false,
        });
        setIsCityDropdownOpen(false);
        setIsEditCityDropdownOpen(false);
        setIsPermissionsOpen(false);
        setIsEditPermissionsOpen(false);
    }, []);

    const handleAddUser = async () => {
        if (!currentUser?.organizationId) {
            toast.error("Organization not found");
            return;
        }

        if (!newName.trim()) {
            toast.error("Please enter a name");
            return;
        }

        if (!newRegionId) {
            toast.error("Please select a region");
            return;
        }

        // Get cities to assign
        const citiesToAssign = citySelection.all
            ? currentRegionCities
            : citySelection.selected;

        if (citiesToAssign.length === 0) {
            toast.error("Please select at least one city");
            return;
        }

        try {
            if (newRoles.length === 0) {
                toast.error("Select at least one role");
                return;
            }
            await createUser({
                name: newName.trim(),
                email: newEmail?.trim() || undefined,
                mobileNumber: newMobile?.trim() || undefined,
                roles: newRoles,
                status: newStatus,
                organizationId: currentUser.organizationId,
                regionId: newRegionId,
                cities: citiesToAssign,
                permissions: newPermissions
            });

            setIsAddModalOpen(false);
            resetForm();
            toast.success("User added successfully");
        } catch (error: any) {
            console.error("Failed to create user:", error);
            toast.error(error.message || "Failed to add user");
        }
    };

    const handleUpdateUser = async () => {
        if (!editingUser) return;

        if (!editingUser.name.trim()) {
            toast.error("Name is required");
            return;
        }

        if (!editingUser.regionId) {
            toast.error("Please select a region");
            return;
        }

        if (!editingUser.cities || editingUser.cities.length === 0) {
            toast.error("Please select at least one city");
            return;
        }

        try {
            const rolesToSave = getUserRoles(editingUser);
            if (rolesToSave.length === 0) {
                toast.error("Select at least one role");
                return;
            }
            await updateUser({
                id: editingUser._id,
                name: editingUser.name.trim(),
                email: editingUser.email?.trim() || undefined,
                mobileNumber: editingUser.mobileNumber?.trim() || undefined,
                roles: rolesToSave as Role[],
                status: editingUser.status ?? "active",
                regionId: editingUser.regionId,
                cities: editingUser.cities || [],
                permissions: editingUser.permissions
            });

            setEditingUser(null);
            toast.success("User updated successfully");
        } catch (error) {
            console.error("Failed to update user:", error);
            toast.error("Failed to update user");
        }
    };

    const handleToggleStatus = async (id: Id<"users">, currentStatus?: UserStatus) => {
        try {
            const nextStatus: UserStatus = currentStatus === "inactive" ? "active" : "inactive";
            await setUserStatus({ id, status: nextStatus });

            if (editingUser?._id === id) {
                setEditingUser({ ...editingUser, status: nextStatus });
            }

            toast.success(`User ${nextStatus === "active" ? "activated" : "deactivated"} successfully`);
        } catch (error) {
            console.error("Failed to update user status:", error);
            toast.error("Failed to update user status");
        }
    };

    const handleDeleteUser = async (id: Id<"users">) => {
        try {
            await removeUser({ id });
            setIsDeletingId(null);
            toast.success("User deleted successfully");
        } catch (error) {
            console.error("Failed to delete user:", error);
            toast.error("Failed to delete user");
        }
    };
    const handleUpdateEnrollment = async () => {
        if (!editingEnrollment) return;
        try {
            await updateEnrollment({
                id: editingEnrollment._id,
                name: String(editingEnrollment.name || "").trim(),
                empId: String(editingEnrollment.empId || "").trim(),
                empRank: String(editingEnrollment.empRank || "").trim(),
                region: String(editingEnrollment.region || "").trim(),
                status: (editingEnrollment.status === "inactive" ? "inactive" : "active") as EnrolledStatus,
            });
            setEditingEnrollment(null);
            toast.success("Enrolled person updated");
        } catch (error) {
            console.error("Failed to update enrolled person:", error);
            toast.error("Failed to update enrolled person");
        }
    };
    const handleToggleEnrollmentStatus = async (id: Id<"enrolledPersons">, currentStatus?: EnrolledStatus) => {
        try {
            const nextStatus: EnrolledStatus = currentStatus === "inactive" ? "active" : "inactive";
            await setEnrollmentStatus({ id, status: nextStatus });
            if (editingEnrollment?._id === id) {
                setEditingEnrollment({ ...editingEnrollment, status: nextStatus });
            }
            toast.success(`Enrolled person ${nextStatus === "active" ? "activated" : "deactivated"}`);
        } catch (error) {
            console.error("Failed to change enrollment status:", error);
            toast.error("Failed to update enrollment status");
        }
    };
    const handleDeleteEnrollment = async (id: Id<"enrolledPersons">) => {
        try {
            await removeEnrollment({ id });
            setIsDeletingEnrollmentId(null);
            toast.success("Enrolled person deleted");
        } catch (error) {
            console.error("Failed to delete enrolled person:", error);
            toast.error("Failed to delete enrolled person");
        }
    };

    // Get role badge color
    const getRoleBadgeStyle = (role: string) => {
        switch (role) {
            case "Owner":
                return "bg-red-500/10 text-red-500 border-red-500/20";
            case "Deployment Manager":
                return "bg-purple-500/10 text-purple-500 border-purple-500/20";
            case "Manager":
                return "bg-primary/10 text-primary border-primary/20";
            case "Visiting Officer":
                return "bg-blue-500/10 text-blue-500 border-blue-500/20";
            case "SO":
                return "bg-amber-500/10 text-amber-500 border-amber-500/20";
            case "Client":
                return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
            case "NEW_USER":
                return "bg-gray-500/10 text-gray-300 border-gray-500/20";
            default:
                return "bg-gray-500/10 text-gray-500 border-gray-500/20";
        }
    };

    const getStatusBadgeStyle = (status?: UserStatus) =>
        status === "inactive"
            ? "bg-red-500/10 text-red-400 border-red-500/20"
            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";

    // Loading state
    if (currentUser === undefined) {
        return (
            <Layout title="User Management">
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="User Management">
            <div className="space-y-4 sm:space-y-6">
                {!currentUser?.organizationId ? (
                    <div className="glass rounded-2xl border border-white/10 p-8 sm:p-12 text-center space-y-4">
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                            <User className="w-8 h-8 text-primary" />
                        </div>
                        <div className="max-w-md mx-auto">
                            <h3 className="text-xl font-bold text-white">Profile Not Found</h3>
                            <p className="text-sm text-muted-foreground mt-2">
                                Your account is authenticated but not yet registered. Please contact an administrator to create your profile.
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Tabs & Search */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex bg-white/5 p-1 rounded-xl w-fit">
                                <button
                                    onClick={() => setActiveTab("users")}
                                    className={cn(
                                        "px-6 py-2 rounded-lg text-sm font-semibold transition-all",
                                        activeTab === "users" ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-white"
                                    )}
                                >
                                    All Users
                                </button>
                                <button
                                    onClick={() => setActiveTab("enrolled")}
                                    className={cn(
                                        "px-6 py-2 rounded-lg text-sm font-semibold transition-all",
                                        activeTab === "enrolled" ? "bg-emerald-500 text-white shadow-lg" : "text-muted-foreground hover:text-white"
                                    )}
                                >
                                    Enrolled Persons
                                </button>
                            </div>

                            <div className="flex flex-1 items-center gap-4 max-w-2xl">
                                {/* Organization Filter */}
                                {isAdmin && (
                                    <div className="relative w-48 shrink-0">
                                        <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <select
                                            value={selectedOrganizationId}
                                            onChange={(e) => setSelectedOrganizationId(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
                                        >
                                            <option value="" className="bg-[#1a1c20]">All Organizations</option>
                                            {orgs?.map((org) => (
                                                <option key={org._id} value={org._id} className="bg-[#1a1c20]">
                                                    {org.name}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                                    </div>
                                )}

                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder={`Search ${activeTab === "users" ? "users" : "enrolled persons"}...`}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>
                                {activeTab === "users" && isAdmin ? (
                                    <button
                                        onClick={() => {
                                            resetForm();
                                            setIsAddModalOpen(true);
                                        }}
                                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-lg"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add User
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        {activeTab === "users" ? (
                            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left min-w-[950px]">
                                    <thead>
                                        <tr className="border-b border-white/5 bg-white/[0.02]">
                                            <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                                            <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</th>
                                            <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Region & Cities</th>
                                            <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                                            <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                                            <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {filteredUsers.map((u: any) => (
                                            <tr key={u._id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-4 sm:px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                                                            <User className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-sm font-medium text-white/90 truncate">{u.name}</span>
                                                            <span className="text-xs text-muted-foreground truncate">{u.clerkId}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        {u.email && (
                                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                                <Mail className="w-3 h-3 text-primary/60 flex-shrink-0" />
                                                                <span className="truncate">{u.email}</span>
                                                            </div>
                                                        )}
                                                        {u.mobileNumber && (
                                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                                <Smartphone className="w-3 h-3 flex-shrink-0" />
                                                                <span>{u.mobileNumber}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-xs font-medium text-primary">{u.regionId || "Not assigned"}</span>
                                                        {u.cities && u.cities.length > 0 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {u.cities.slice(0, 2).map((city: string) => (
                                                                    <span key={city} className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded text-muted-foreground">
                                                                        {city}
                                                                    </span>
                                                                ))}
                                                                {u.cities.length > 2 && (
                                                                    <span className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded text-muted-foreground">
                                                                        +{u.cities.length - 2}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4">
                                                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                        {getUserRoles(u).map((r) => (
                                                            <span
                                                                key={r}
                                                                className={cn(
                                                                    "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                                                    getRoleBadgeStyle(r)
                                                                )}
                                                            >
                                                                <Shield className="w-2 h-2 mr-0.5 shrink-0" />
                                                                {r}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <span className={cn(
                                                            "inline-flex items-center px-2 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider border whitespace-nowrap",
                                                            getStatusBadgeStyle(u.status)
                                                        )}>
                                                            {u.status === "inactive" ? "Inactive" : "Active"}
                                                        </span>
                                                        {isAdmin && (
                                                            <button
                                                                onClick={() => handleToggleStatus(u._id, u.status)}
                                                                className={cn(
                                                                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                                                    u.status === "inactive" ? "bg-white/10" : "bg-emerald-500/80"
                                                                )}
                                                                title={u.status === "inactive" ? "Activate user" : "Deactivate user"}
                                                            >
                                                                <span
                                                                    className={cn(
                                                                        "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                                                                        u.status === "inactive" ? "translate-x-1" : "translate-x-5"
                                                                    )}
                                                                />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-6 py-4 text-right">
                                                    {isAdmin && (
                                                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingUser({
                                                                        ...u,
                                                                        roles: getUserRoles(u) as Role[],
                                                                    });
                                                                    setIsEditPermissionsOpen(false);
                                                                }}
                                                                className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                                                                title="Edit user"
                                                            >
                                                                <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => setIsDeletingId(u._id)}
                                                                className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                                                                title="Delete user"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredUsers.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground text-sm">
                                                    No users found
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left min-w-[860px]">
                                        <thead>
                                            <tr className="border-b border-white/5 bg-white/[0.02]">
                                                <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Person</th>
                                                <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee</th>
                                                <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Region</th>
                                                <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                                                <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {filteredEnrollments.map((p: any) => {
                                                const rowStatus: EnrolledStatus = p.status === "inactive" ? "inactive" : "active";
                                                return (
                                                    <tr key={p._id} className="hover:bg-white/[0.02] transition-colors group">
                                                        <td className="px-4 sm:px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                                                                    <User className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                                                                </div>
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="text-sm font-medium text-white/90 truncate">{p.name}</span>
                                                                    <span className="text-xs text-muted-foreground truncate">{new Date(p.enrolledAt).toLocaleString()}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 sm:px-6 py-4">
                                                            <div className="flex flex-col gap-1 text-xs">
                                                                <span className="text-white/90 font-semibold">{p.empId}</span>
                                                                <span className="text-muted-foreground">{p.empRank}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 sm:px-6 py-4">
                                                            <span className="text-xs font-medium text-primary">{p.region || "—"}</span>
                                                        </td>
                                                        <td className="px-4 sm:px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <span className={cn(
                                                                    "inline-flex items-center px-2 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider border whitespace-nowrap",
                                                                    getStatusBadgeStyle(rowStatus)
                                                                )}>
                                                                    {rowStatus === "inactive" ? "Inactive" : "Active"}
                                                                </span>
                                                                <button
                                                                    onClick={() => handleToggleEnrollmentStatus(p._id, rowStatus)}
                                                                    className={cn(
                                                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                                                        rowStatus === "inactive" ? "bg-white/10" : "bg-emerald-500/80"
                                                                    )}
                                                                    title={rowStatus === "inactive" ? "Activate person" : "Deactivate person"}
                                                                >
                                                                    <span
                                                                        className={cn(
                                                                            "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                                                                            rowStatus === "inactive" ? "translate-x-1" : "translate-x-5"
                                                                        )}
                                                                    />
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 sm:px-6 py-4 text-right">
                                                            <div className="flex items-center justify-end gap-1 sm:gap-2">
                                                                <button
                                                                    onClick={() =>
                                                                        setEditingEnrollment({
                                                                            ...p,
                                                                            status: rowStatus,
                                                                        })
                                                                    }
                                                                    className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                                                                    title="Edit enrolled person"
                                                                >
                                                                    <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => setIsDeletingEnrollmentId(p._id)}
                                                                    className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                                                                    title="Delete enrolled person"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {filteredEnrollments.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground text-sm">
                                                        No enrolled persons found
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Add User Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 p-4 sm:p-6 space-y-4 custom-scrollbar">
                        <div className="flex items-center justify-between sticky top-0 bg-black/50 backdrop-blur-sm py-2 -mt-2">
                            <h3 className="text-lg font-semibold text-white">Add New User</h3>
                            <button
                                onClick={() => {
                                    setIsAddModalOpen(false);
                                    resetForm();
                                }}
                                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Name Field */}
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Full Name *</label>
                                <input
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    type="text"
                                    placeholder="Enter full name"
                                    className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white"
                                />
                            </div>

                            {/* Email and Mobile */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</label>
                                    <input
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        type="email"
                                        placeholder="Optional"
                                        className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mobile</label>
                                    <input
                                        value={newMobile}
                                        onChange={e => setNewMobile(e.target.value)}
                                        type="tel"
                                        placeholder="Optional"
                                        className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm text-white"
                                    />
                                </div>
                            </div>

                            {/* Organization Info - Readonly */}
                            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <Building className="w-3 h-3" />
                                    <span className="uppercase tracking-wider">Organization</span>
                                </div>
                                <p className="text-sm text-white font-medium">
                                    {currentUser?.organizationId ? "Current Organization" : "Not assigned"}
                                </p>
                            </div>

                            {/* Region Selection */}
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Region *</label>
                                <select
                                    value={newRegionId}
                                    onChange={e => {
                                        setNewRegionId(e.target.value);
                                        setCitySelection({ all: true, selected: [] });
                                    }}
                                    className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white"
                                >
                                    <option value="">Select Region</option>
                                    {regions?.map(r => (
                                        <option key={r._id} value={r.regionId}>
                                            {r.regionName} ({r.regionId})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* City Selection - Only show if region selected */}
                            {newRegionId && currentRegionCities.length > 0 && (
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                                        <span>Cities *</span>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={handleSelectAllCities}
                                                className="text-[10px] text-primary hover:underline"
                                            >
                                                Select All
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleClearCities}
                                                className="text-[10px] text-muted-foreground hover:text-white"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </label>

                                    <div className="relative mt-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setIsCityDropdownOpen(!isCityDropdownOpen)}
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-left flex items-center justify-between hover:bg-white/10 transition-colors"
                                        >
                                            <span className="text-sm text-white">
                                                {citySelection.all
                                                    ? `All Cities (${currentRegionCities.length})`
                                                    : `${citySelection.selected.length} selected`}
                                            </span>
                                            <ChevronDown className={cn(
                                                "w-4 h-4 text-muted-foreground transition-transform",
                                                isCityDropdownOpen && "rotate-180"
                                            )} />
                                        </button>

                                        {isCityDropdownOpen && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-900 border border-white/10 rounded-xl shadow-lg z-10 max-h-60 overflow-y-auto">
                                                <div className="p-2 space-y-1">
                                                    {currentRegionCities.map(city => (
                                                        <label
                                                            key={city}
                                                            className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={citySelection.all || citySelection.selected.includes(city)}
                                                                onChange={() => handleCityToggle(city)}
                                                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary/50"
                                                            />
                                                            <span className="text-sm text-white/90">{city}</span>
                                                            {(citySelection.all || citySelection.selected.includes(city)) && (
                                                                <Check className="w-4 h-4 text-primary ml-auto" />
                                                            )}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-1.5">
                                        Sites in selected cities will be automatically assigned
                                    </p>
                                </div>
                            )}

                            {/* Roles — multi-select */}
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Roles * (select one or more)
                                </label>
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {ROLES.map((r) => (
                                        <label
                                            key={r}
                                            className="flex items-center gap-2 p-2 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={newRoles.includes(r)}
                                                onChange={() => toggleNewRole(r)}
                                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary"
                                            />
                                            <span className="text-sm text-white/90">{r}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status *</label>
                                <select
                                    value={newStatus}
                                    onChange={e => setNewStatus(e.target.value as UserStatus)}
                                    className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50"
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>

                            {/* Permissions */}
                            <div className="space-y-2 pt-2 border-t border-white/5">
                                <button
                                    type="button"
                                    onClick={() => setIsPermissionsOpen(!isPermissionsOpen)}
                                    className="w-full flex items-center justify-between group"
                                >
                                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer group-hover:text-white transition-colors">
                                        Dashboard Access
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const allTrue = Object.keys(newPermissions).reduce((acc, key) => {
                                                    acc[key as keyof typeof newPermissions] = true;
                                                    return acc;
                                                }, { ...newPermissions });
                                                setNewPermissions(allTrue);
                                            }}
                                            className="text-[10px] text-primary hover:underline"
                                        >
                                            Select All
                                        </button>
                                        <ChevronDown className={cn(
                                            "w-4 h-4 text-muted-foreground transition-transform",
                                            isPermissionsOpen && "rotate-180"
                                        )} />
                                    </div>
                                </button>
                                
                                {isPermissionsOpen && (
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2 pt-2 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
                                        {Object.entries(newPermissions).map(([key, value]) => (
                                            <label key={key} className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={value}
                                                    onChange={e => setNewPermissions({ ...newPermissions, [key]: e.target.checked })}
                                                    className="w-3.5 h-3.5 rounded border-white/10 bg-white/5 text-primary focus:ring-primary/50"
                                                />
                                                <span className="text-xs text-white/70 group-hover:text-white capitalize">
                                                    {key.replace(/([A-Z])/g, ' $1').trim()}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={handleAddUser}
                            className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-all mt-4"
                        >
                            Create User
                        </button>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 p-4 sm:p-6 space-y-4 custom-scrollbar">
                        <div className="flex items-center justify-between sticky top-0 bg-black/50 backdrop-blur-sm py-2 -mt-2">
                            <h3 className="text-lg font-semibold text-white">Edit User</h3>
                            <button onClick={() => setEditingUser(null)} className="p-1 hover:bg-white/10 rounded-lg">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase">Full Name *</label>
                                <input
                                    value={editingUser.name}
                                    onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                                    type="text"
                                    className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase">Email</label>
                                    <input
                                        value={editingUser.email || ""}
                                        onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                                        type="email"
                                        className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase">Mobile</label>
                                    <input
                                        value={editingUser.mobileNumber || ""}
                                        onChange={e => setEditingUser({ ...editingUser, mobileNumber: e.target.value })}
                                        type="tel"
                                        className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm text-white"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase">Region</label>
                                <select
                                    value={editingUser.regionId || ""}
                                    onChange={e => {
                                        setEditingUser({ ...editingUser, regionId: e.target.value, cities: [] });
                                        setIsEditCityDropdownOpen(false);
                                    }}
                                    className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white"
                                >
                                    <option value="">Select Region</option>
                                    {regions?.map(r => (
                                        <option key={r._id} value={r.regionId}>{r.regionName} ({r.regionId})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase">
                                    Roles (one or more)
                                </label>
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {ROLES.map((r) => (
                                        <label
                                            key={r}
                                            className="flex items-center gap-2 p-2 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={getUserRoles(editingUser).includes(r)}
                                                onChange={() => toggleEditRole(r)}
                                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary"
                                            />
                                            <span className="text-sm text-white/90">{r}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase">Status</label>
                                <select
                                    value={editingUser.status || "active"}
                                    onChange={e => setEditingUser({ ...editingUser, status: e.target.value as UserStatus })}
                                    className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50"
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>

                             {/* Permissions / Dashboard Access - FORCED VISIBILITY FOR DEBUG */}
                             <div className="space-y-4 pt-4 border-2 border-red-500 rounded-xl p-4 bg-red-500/5">
                                 <div className="flex items-center justify-between">
                                     <label className="text-sm font-bold text-red-500 uppercase tracking-widest">
                                         Dashboard Access (ADMIN)
                                     </label>
                                     <button
                                         type="button"
                                         onClick={(e) => {
                                             e.stopPropagation();
                                             const defaultPerms = {
                                                 users: false, sites: false, patrolPoints: false,
                                                 patrolLogs: true, visitLogs: true, issues: true,
                                                 analytics: true, attendance: true, regions: false
                                             };
                                             const currentPerms = { ...defaultPerms, ...(editingUser.permissions || {}) };
                                             const allTrue = Object.keys(currentPerms).reduce((acc: any, key) => {
                                                 acc[key] = true;
                                                 return acc;
                                             }, {});
                                             setEditingUser({ ...editingUser, permissions: allTrue });
                                         }}
                                         className="text-xs text-primary hover:underline font-bold"
                                     >
                                         Select All
                                     </button>
                                 </div>
 
                                 <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                     {Object.entries({
                                         users: false, sites: false, patrolPoints: false,
                                         patrolLogs: true, visitLogs: true, issues: true,
                                         analytics: true, attendance: true, regions: false,
                                         ...(editingUser.permissions || {})
                                     }).map(([key, value]) => (
                                         <label key={key} className="flex items-center gap-2 cursor-pointer group bg-white/5 p-2 rounded-lg hover:bg-white/10 transition-colors">
                                             <input
                                                 type="checkbox"
                                                 checked={!!value}
                                                 onChange={e => {
                                                     const perms = { 
                                                         users: false, sites: false, patrolPoints: false,
                                                         patrolLogs: true, visitLogs: true, issues: true,
                                                         analytics: true, attendance: true, regions: false,
                                                         ...(editingUser.permissions || {}), 
                                                         [key]: e.target.checked 
                                                     };
                                                     setEditingUser({ ...editingUser, permissions: perms });
                                                 }}
                                                 className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary/50"
                                             />
                                             <span className="text-xs text-white/90 group-hover:text-white capitalize font-medium">
                                                 {key.replace(/([A-Z])/g, ' $1').trim()}
                                             </span>
                                         </label>
                                     ))}
                                 </div>
                             </div>

                            {editingUser.regionId && editingRegionCities.length > 0 && (
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                                        <span>Cities *</span>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={handleEditSelectAllCities}
                                                className="text-[10px] text-primary hover:underline"
                                            >
                                                Select All
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleEditClearCities}
                                                className="text-[10px] text-muted-foreground hover:text-white"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </label>

                                    <div className="relative mt-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setIsEditCityDropdownOpen(!isEditCityDropdownOpen)}
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-left flex items-center justify-between hover:bg-white/10 transition-colors"
                                        >
                                            <span className="text-sm text-white">
                                                {editingUser.cities?.length
                                                    ? `${editingUser.cities.length} selected`
                                                    : "Select cities"}
                                            </span>
                                            <ChevronDown className={cn(
                                                "w-4 h-4 text-muted-foreground transition-transform",
                                                isEditCityDropdownOpen && "rotate-180"
                                            )} />
                                        </button>

                                        {isEditCityDropdownOpen && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-900 border border-white/10 rounded-xl shadow-lg z-10 max-h-60 overflow-y-auto">
                                                <div className="p-2 space-y-1">
                                                    {editingRegionCities.map(city => (
                                                        <label
                                                            key={city}
                                                            className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={(editingUser.cities || []).includes(city)}
                                                                onChange={() => handleEditCityToggle(city)}
                                                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary/50"
                                                            />
                                                            <span className="text-sm text-white/90">{city}</span>
                                                            {(editingUser.cities || []).includes(city) && (
                                                                <Check className="w-4 h-4 text-primary ml-auto" />
                                                            )}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                        </div>

                        <button
                            onClick={handleUpdateUser}
                            className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-all"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            )}

            {/* Edit Enrolled Person Modal */}
            {editingEnrollment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 p-4 sm:p-6 space-y-4 custom-scrollbar">
                        <div className="flex items-center justify-between sticky top-0 bg-black/50 backdrop-blur-sm py-2 -mt-2">
                            <h3 className="text-lg font-semibold text-white">Edit Enrolled Person</h3>
                            <button onClick={() => setEditingEnrollment(null)} className="p-1 hover:bg-white/10 rounded-lg">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase">Name</label>
                                <input
                                    value={editingEnrollment.name || ""}
                                    onChange={e => setEditingEnrollment({ ...editingEnrollment, name: e.target.value })}
                                    className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase">Employee ID</label>
                                    <input
                                        value={editingEnrollment.empId || ""}
                                        onChange={e => setEditingEnrollment({ ...editingEnrollment, empId: e.target.value })}
                                        className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase">Rank</label>
                                    <input
                                        value={editingEnrollment.empRank || ""}
                                        onChange={e => setEditingEnrollment({ ...editingEnrollment, empRank: e.target.value })}
                                        className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase">Region</label>
                                <input
                                    value={editingEnrollment.region || ""}
                                    onChange={e => setEditingEnrollment({ ...editingEnrollment, region: e.target.value })}
                                    className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase">Status</label>
                                <select
                                    value={editingEnrollment.status || "active"}
                                    onChange={e => setEditingEnrollment({ ...editingEnrollment, status: e.target.value as EnrolledStatus })}
                                    className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50"
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                        </div>
                        <button
                            onClick={handleUpdateEnrollment}
                            className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-all"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {isDeletingId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass w-full max-w-sm rounded-2xl border border-white/10 p-6 space-y-4 text-center">
                        <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                            <Trash2 className="w-6 h-6 text-red-500" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-white">Delete User?</h3>
                            <p className="text-sm text-muted-foreground">This action cannot be undone. The user will lose access to the system.</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setIsDeletingId(null)} className="flex-1 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors">
                                Cancel
                            </button>
                            <button onClick={() => handleDeleteUser(isDeletingId)} className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Enrolled Person Confirmation */}
            {isDeletingEnrollmentId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass w-full max-w-sm rounded-2xl border border-white/10 p-6 space-y-4 text-center">
                        <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                            <Trash2 className="w-6 h-6 text-red-500" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-white">Delete Enrolled Person?</h3>
                            <p className="text-sm text-muted-foreground">This will remove the enrolled person record from the system.</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setIsDeletingEnrollmentId(null)} className="flex-1 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors">
                                Cancel
                            </button>
                            <button onClick={() => handleDeleteEnrollment(isDeletingEnrollmentId)} className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}