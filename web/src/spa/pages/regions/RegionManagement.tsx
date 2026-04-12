import React, { useState } from "react";
import { Layout } from "../../../components/Layout";
import { Plus, Globe, Search, Loader2, Edit2, Trash2, X, Hash } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../services/convex";
import { useUser } from "@clerk/nextjs";
import type { Id } from "../../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { getUserRoles } from "../../../lib/userRoles";

export default function RegionManagement() {
    const { user } = useUser();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingRegion, setEditingRegion] = useState<{ 
        id: Id<"regions">; 
        regionId: string; 
        regionName: string;
        cities: string[];
        isActive: boolean;
    } | null>(null);
    const [isDeletingId, setIsDeletingId] = useState<Id<"regions"> | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const [newRegion, setNewRegion] = useState({
        regionId: "",
        regionName: "",
        cities: [] as string[],
        isActive: true
    });

    const [cityInput, setCityInput] = useState("");

    const regions = useQuery(api.regions.list);
    const createRegion = useMutation(api.regions.create);
    const updateRegion = useMutation(api.regions.update);
    const setRegionStatus = useMutation(api.regions.setStatus);
    const removeRegion = useMutation(api.regions.remove);

    const currentUser = useQuery(api.users.getByClerkId,
        user?.id ? { clerkId: user.id } : "skip"
    );

    const isSuperAdmin =
        getUserRoles(currentUser).includes("Owner") ||
        getUserRoles(currentUser).includes("Deployment Manager");

    const filteredRegions = regions?.filter(r =>
        r.regionName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.regionId.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getRegionErrorMessage = (error: any) => {
        const message = error?.message || "";
        if (message.includes("Region ID already exists")) {
            return "This Region ID is already taken. Please use a different Region ID.";
        }
        if (message.includes("Region name already exists")) {
            return "This Region Name is already taken. Please use a different Region Name.";
        }
        return message || "Failed to save region";
    };

    const handleAddRegion = async () => {
        if (!newRegion.regionId.trim() || !newRegion.regionName.trim()) {
            toast.error("Please fill in required fields");
            return;
        }
        try {
            await createRegion({
                ...newRegion,
            });
            setIsAddModalOpen(false);
            setNewRegion({
                regionId: "",
                regionName: "",
                cities: [],
                isActive: true
            });
            setCityInput("");
            toast.success("Region created successfully");
        } catch (error: any) {
            console.error("Failed to create region:", error);
            toast.error(getRegionErrorMessage(error));
        }
    };

    const handleUpdateRegion = async () => {
        if (!editingRegion) return;
        try {
            await updateRegion({
                id: editingRegion.id,
                regionId: editingRegion.regionId,
                regionName: editingRegion.regionName,
                cities: editingRegion.cities,
                isActive: editingRegion.isActive,
            });
            setEditingRegion(null);
            toast.success("Region updated successfully");
        } catch (error: any) {
            console.error("Failed to update region:", error);
            toast.error(getRegionErrorMessage(error));
        }
    };

    const handleDeleteRegion = async (id: Id<"regions">) => {
        try {
            await removeRegion({ id });
            setIsDeletingId(null);
            toast.success("Region deleted successfully");
        } catch (error) {
            console.error("Failed to delete region:", error);
            toast.error("Failed to delete region");
        }
    };

    const handleToggleRegionStatus = async (region: any) => {
        try {
            await setRegionStatus({
                id: region._id,
                isActive: !region.isActive,
            });
            toast.success(`Region ${region.isActive ? "deactivated" : "activated"} successfully`);
        } catch (error: any) {
            console.error("Failed to update region status:", error);
            toast.error(error.message || "Failed to update region status");
        }
    };

    const addCity = (isEdit: boolean) => {
        if (!cityInput.trim()) return;
        const cities = cityInput.split(",").map(c => c.trim()).filter(c => c !== "");
        if (isEdit && editingRegion) {
            setEditingRegion({
                ...editingRegion,
                cities: Array.from(new Set([...editingRegion.cities, ...cities]))
            });
        } else {
            setNewRegion({
                ...newRegion,
                cities: Array.from(new Set([...newRegion.cities, ...cities]))
            });
        }
        setCityInput("");
    };

    const removeCity = (cityToRemove: string, isEdit: boolean) => {
        if (isEdit && editingRegion) {
            setEditingRegion({
                ...editingRegion,
                cities: editingRegion.cities.filter(c => c !== cityToRemove)
            });
        } else {
            setNewRegion({
                ...newRegion,
                cities: newRegion.cities.filter(c => c !== cityToRemove)
            });
        }
    };

    if (currentUser === undefined || regions === undefined) {
        return (
            <Layout title="Region Management">
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            </Layout>
        );
    }

    if (!isSuperAdmin) {
        return (
            <Layout title="Region Management">
                <div className="flex items-center justify-center h-64">
                    <p className="text-muted-foreground">You do not have permission to manage regions.</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="Region Management">
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search regions..."
                                className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 w-full sm:w-64 text-white"
                            />
                        </div>
                    </div>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)]"
                    >
                        <Plus className="w-4 h-4" />
                        Add New Region
                    </button>
                </div>

                <div className="glass rounded-2xl border border-white/10 overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/[0.02]">
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Region Info</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cities</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Status</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {(filteredRegions || [])?.map((region: any) => (
                                    <tr key={region._id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                                    <Globe className="w-5 h-5 text-primary" />
                                                </div>
                                                <div>
                                                    <span className="block text-sm font-semibold text-white/90">{region.regionName}</span>
                                                    <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">{region.regionId}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1 max-w-xs">
                                                {(region.cities || []).slice(0, 3).map((city: string) => (
                                                    <span key={city} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-muted-foreground">
                                                        {city}
                                                    </span>
                                                ))}
                                                {region.cities?.length > 3 && (
                                                    <span className="text-[10px] text-primary font-medium pl-1">+{region.cities.length - 3} more</span>
                                                )}
                                                {(!region.cities || region.cities.length === 0) && (
                                                    <span className="text-xs text-muted-foreground/30 italic">No cities added</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-3">
                                                <span className={cn(
                                                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                                    region.isActive 
                                                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                                                        : "bg-red-500/10 text-red-500 border border-red-500/20"
                                                )}>
                                                    {region.isActive ? "Active" : "Inactive"}
                                                </span>
                                                <button
                                                    onClick={() => handleToggleRegionStatus(region)}
                                                    className={cn(
                                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                                        region.isActive ? "bg-emerald-500/80" : "bg-white/10"
                                                    )}
                                                    title={region.isActive ? "Deactivate region" : "Activate region"}
                                                >
                                                    <span
                                                        className={cn(
                                                            "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                                                            region.isActive ? "translate-x-5" : "translate-x-1"
                                                        )}
                                                    />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setEditingRegion({
                                                        id: region._id,
                                                        regionId: region.regionId,
                                                        regionName: region.regionName,
                                                        cities: region.cities || [],
                                                        isActive: region.isActive ?? true,
                                                    })}
                                                    className="p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setIsDeletingId(region._id)}
                                                    className="p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredRegions?.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground text-sm">
                                            No regions found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Add Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                    <div className="glass w-full max-w-lg rounded-2xl border border-white/10 p-6 my-8 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-white">Add New Region</h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                        
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Region ID</label>
                                    <input
                                        value={newRegion.regionId}
                                        onChange={e => setNewRegion({ ...newRegion, regionId: e.target.value.toUpperCase() })}
                                        type="text"
                                        className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white text-sm"
                                        placeholder="e.g. KA"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Status</label>
                                    <button 
                                        onClick={() => setNewRegion({ ...newRegion, isActive: !newRegion.isActive })}
                                        className={cn(
                                            "w-full mt-1.5 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all",
                                            newRegion.isActive 
                                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
                                                : "bg-red-500/10 border-red-500/30 text-red-500"
                                        )}
                                    >
                                        {newRegion.isActive ? "ACTIVE" : "INACTIVE"}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Region Name</label>
                                <input
                                    value={newRegion.regionName}
                                    onChange={e => setNewRegion({ ...newRegion, regionName: e.target.value })}
                                    type="text"
                                    className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white text-sm"
                                    placeholder="e.g. Karnataka"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Cities</label>
                                <div className="flex gap-2 mt-1.5">
                                    <div className="relative flex-1">
                                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <input
                                            value={cityInput}
                                            onChange={e => setCityInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    addCity(false);
                                                }
                                            }}
                                            type="text"
                                            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white text-sm"
                                            placeholder="Enter city and press Enter..."
                                        />
                                    </div>
                                    <button 
                                        onClick={() => addCity(false)}
                                        className="h-10 w-10 shrink-0 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                                    >
                                        <Plus className="w-5 h-5 text-white" />
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl min-h-[44px]">
                                    {newRegion.cities.map(city => (
                                        <span key={city} className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-lg text-xs text-primary font-medium animate-in fade-in slide-in-from-top-1">
                                            {city}
                                            <button onClick={() => removeCity(city, false)} className="hover:text-red-400 transition-colors">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                    {newRegion.cities.length === 0 && <span className="text-xs text-muted-foreground/40 italic">No cities added yet</span>}
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex gap-3">
                            <button onClick={() => setIsAddModalOpen(false)} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-semibold hover:bg-white/10 transition-colors text-white">Cancel</button>
                            <button onClick={handleAddRegion} className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-xl shadow-primary/20">Create Region</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingRegion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                    <div className="glass w-full max-w-lg rounded-2xl border border-white/10 p-6 my-8 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-white">Edit Region</h3>
                            <button onClick={() => setEditingRegion(null)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>

                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Region ID</label>
                                    <input
                                        value={editingRegion.regionId}
                                        onChange={e => setEditingRegion({ ...editingRegion, regionId: e.target.value.toUpperCase() })}
                                        type="text"
                                        className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Status</label>
                                    <button 
                                        onClick={() => setEditingRegion({ ...editingRegion, isActive: !editingRegion.isActive })}
                                        className={cn(
                                            "w-full mt-1.5 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all",
                                            editingRegion.isActive 
                                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
                                                : "bg-red-500/10 border-red-500/30 text-red-500"
                                        )}
                                    >
                                        {editingRegion.isActive ? "ACTIVE" : "INACTIVE"}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Region Name</label>
                                <input
                                    value={editingRegion.regionName}
                                    onChange={e => setEditingRegion({ ...editingRegion, regionName: e.target.value })}
                                    type="text"
                                    className="w-full mt-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white text-sm"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Cities</label>
                                <div className="flex gap-2 mt-1.5">
                                    <div className="relative flex-1">
                                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <input
                                            value={cityInput}
                                            onChange={e => setCityInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    addCity(true);
                                                }
                                            }}
                                            type="text"
                                            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-white text-sm"
                                            placeholder="Add city..."
                                        />
                                    </div>
                                    <button 
                                        onClick={() => addCity(true)}
                                        className="h-10 w-10 shrink-0 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                                    >
                                        <Plus className="w-5 h-5 text-white" />
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl min-h-[44px]">
                                    {editingRegion.cities.map(city => (
                                        <span key={city} className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-lg text-xs text-primary font-medium">
                                            {city}
                                            <button onClick={() => removeCity(city, true)} className="hover:text-red-400 transition-colors">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                    {editingRegion.cities.length === 0 && <span className="text-xs text-muted-foreground/40 italic">No cities added yet</span>}
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex gap-3">
                            <button onClick={() => setEditingRegion(null)} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-semibold hover:bg-white/10 transition-colors text-white">Cancel</button>
                            <button onClick={handleUpdateRegion} className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-xl shadow-primary/20">Save Changes</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {isDeletingId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass w-full max-w-sm rounded-2xl border border-white/10 p-6 space-y-4 text-center animate-in fade-in slide-in-from-bottom-2">
                        <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                            <Trash2 className="w-6 h-6 text-red-500" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-white">Delete Region?</h3>
                            <p className="text-sm text-muted-foreground">This will permanently remove the region. Sites and users assigned to this region will lose their region reference.</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setIsDeletingId(null)} className="flex-1 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors text-white">Cancel</button>
                            <button onClick={() => handleDeleteRegion(isDeletingId)} className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
