import { useState, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../services/convex";
import { Search, ChevronDown, Check, Loader2, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { Id } from "../../convex/_generated/dataModel";

interface SearchableSitePickerProps {
    organizationId: Id<"organizations">;
    selectedSiteId: string;
    onSelect: (siteId: string) => void;
    className?: string;
    regionId?: string;
    city?: string;
    requestingUserId?: Id<"users">;
}

export function SearchableSitePicker({
    organizationId,
    selectedSiteId,
    onSelect,
    className,
    regionId,
    city,
    requestingUserId
}: SearchableSitePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Fetch sites ordinarily by org
    const orgSites = useQuery(api.sites.listSitesByOrg, {
        organizationId,
        requestingUserId
    });
    
    // Only fetch listAll if we don't have a requestingUserId (non-restricted role)
    const allSitesFallback = useQuery(api.sites.listAll, !requestingUserId ? {} : "skip");

    // If we have all sites (admin), we trust it; otherwise, use org sites (which are filtered by requestingUserId).
    const allSites = allSitesFallback || orgSites || [];

    // Debug: Log current state
    console.log("SearchableSitePicker - orgId:", organizationId, "orgSites:", orgSites?.length, "allSitesFallback:", allSitesFallback?.length, "allSites:", allSites?.length);

    // Filter sites locally based on search query, region, and city
    const filteredSites = (allSites || []).filter(site => {
        // First apply region filter if present
        if (regionId && site.regionId !== regionId) return false;
        
        // Then apply city filter if present
        if (city && site.city !== city) return false;

        // Finally apply search query
        if (!searchQuery.trim()) return true;
        const lower = searchQuery.toLowerCase().trim();
        return (
            site.name.toLowerCase().includes(lower) ||
            site.locationName?.toLowerCase().includes(lower)
        );
    });

    // Get display name from cached results or load selected site
    const selectedSiteFromResults = allSites?.find(site => site._id === selectedSiteId);
    const displayName = selectedSiteId === "all" 
        ? "All Sites" 
        : (selectedSiteFromResults 
            ? selectedSiteFromResults.name 
            : (selectedSiteId ? "Loading..." : "Select Site"));

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className={cn("relative w-full", className)} ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
                <div className="flex items-center gap-2 truncate">
                    <Search className="w-4 h-4 text-muted-foreground mr-1 flex-shrink-0" />
                    <span className="truncate">{displayName}</span>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-[#1a1c20] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                    <div className="p-2 border-b border-white/5">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                autoFocus
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search sites..."
                                className="w-full pl-9 pr-8 py-2 bg-white/5 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:border-primary/30 transition-colors"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-colors"
                                >
                                    <X className="w-3 h-3 text-muted-foreground" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                        {allSites === undefined ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                            </div>
                        ) : (
                            <>
                                <button
                                    onClick={() => {
                                        onSelect("all");
                                        setIsOpen(false);
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all mb-0.5",
                                        selectedSiteId === "all" 
                                            ? "bg-primary/20 text-primary font-semibold shadow-[inset_0_0_10px_rgba(37,99,235,0.1)]" 
                                            : "text-white/70 hover:bg-white/5 hover:text-white"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full",
                                            selectedSiteId === "all" ? "bg-primary shadow-[0_0_8px_rgba(37,99,235,0.8)]" : "bg-white/20"
                                        )} />
                                        <span>All Sites</span>
                                    </div>
                                    {selectedSiteId === "all" && <Check className="w-3.5 h-3.5" />}
                                </button>

                                {filteredSites.length > 0 ? (
                                    filteredSites.map((site: any) => (
                                        <button
                                            key={site._id}
                                            onClick={() => {
                                                onSelect(site._id);
                                                setIsOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-all mb-0.5 group",
                                                selectedSiteId === site._id 
                                                    ? "bg-primary/20 text-primary font-semibold shadow-[inset_0_0_10px_rgba(37,99,235,0.1)]" 
                                                    : "text-white/70 hover:bg-white/5 hover:text-white"
                                            )}
                                        >
                                            <div className="flex flex-col items-start min-w-0">
                                                <span className="truncate w-full text-left font-medium">{site.name}</span>
                                                {site.locationName && (
                                                    <span className="text-[10px] text-muted-foreground truncate w-full text-left group-hover:text-muted-foreground/80">
                                                        {site.locationName}
                                                    </span>
                                                )}
                                            </div>
                                            {selectedSiteId === site._id && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                                        </button>
                                    ))
                                ) : (
                                    searchQuery && (
                                        <div className="text-center py-6 text-xs text-muted-foreground italic">
                                            No sites found matching "{searchQuery}"
                                        </div>
                                    )
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
