import { useState, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../services/convex";
import { Search, ChevronDown, Check, Loader2, X, MapPin } from "lucide-react";
import { cn } from "../lib/utils";
import type { Id } from "../../convex/_generated/dataModel";

interface SiteSelectorProps {
    organizationId?: Id<"organizations">;
    selectedSiteId: string;
    onSiteChange: (siteId: string) => void;
    className?: string;
    regionId?: string;
    city?: string;
    requestingUserId?: Id<"users">;
    showAllOption?: boolean;
    allOptionLabel?: string;
    placeholder?: string;
}

/**
 * Unified Site Selector component that handles role-based visibility.
 * It uses the backend intersection logic to ensure users only see sites they are authorized to view.
 */
export function SiteSelector({
    organizationId,
    selectedSiteId,
    onSiteChange,
    className,
    regionId,
    city,
    requestingUserId,
    showAllOption = true,
    allOptionLabel = "All Sites",
    placeholder = "Select Site"
}: SiteSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Fetch sites scoped by organization and authorized for the requesting user
    const sites = useQuery(api.sites.listSitesByOrg, organizationId ? {
        organizationId,
        regionId: regionId || undefined,
        city: city || undefined,
        requestingUserId
    } : "skip");

    // Filter sites locally based on search query
    const filteredSites = (sites || []).filter(site => {
        if (!searchQuery.trim()) return true;
        const lower = searchQuery.toLowerCase().trim();
        return (
            site.name.toLowerCase().includes(lower) ||
            site.locationName?.toLowerCase().includes(lower)
        );
    });

    const selectedSite = sites?.find(s => s._id === selectedSiteId);
    const displayName = selectedSiteId === "" || selectedSiteId === "all"
        ? allOptionLabel
        : (selectedSite ? selectedSite.name : (sites === undefined ? "Loading..." : placeholder));

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
                className="w-full flex items-center justify-between px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 hover:bg-white/10 transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 group"
            >
                <div className="flex items-center gap-2 truncate">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary/70 transition-colors" />
                    <span className="truncate">{displayName}</span>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute z-[1000] w-full mt-2 bg-[#121418] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top min-w-[240px]">
                    <div className="p-2 border-b border-white/5 bg-white/[0.02]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                                autoFocus
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search sites..."
                                className="w-full pl-9 pr-8 py-1.5 bg-white/5 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:border-primary/40 transition-colors placeholder:text-muted-foreground/60"
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
                        {sites === undefined ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                            </div>
                        ) : (
                            <>
                                {showAllOption && !searchQuery && (
                                    <button
                                        onClick={() => {
                                            onSiteChange("");
                                            setIsOpen(false);
                                        }}
                                        className={cn(
                                            "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all mb-0.5",
                                            selectedSiteId === "" || selectedSiteId === "all"
                                                ? "bg-primary/20 text-primary font-semibold"
                                                : "text-white/70 hover:bg-white/5 hover:text-white"
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={cn(
                                                "w-1.5 h-1.5 rounded-full",
                                                selectedSiteId === "" || selectedSiteId === "all" ? "bg-primary shadow-[0_0_8px_rgba(37,99,235,0.6)]" : "bg-white/20"
                                            )} />
                                            <span>{allOptionLabel}</span>
                                        </div>
                                        {(selectedSiteId === "" || selectedSiteId === "all") && <Check className="w-3.5 h-3.5" />}
                                    </button>
                                )}

                                {filteredSites.length > 0 ? (
                                    filteredSites.map((site: any) => (
                                        <button
                                            key={site._id}
                                            onClick={() => {
                                                onSiteChange(site._id);
                                                setIsOpen(false);
                                            }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-all mb-0.5 group",
                                                selectedSiteId === site._id
                                                    ? "bg-primary/20 text-primary font-semibold"
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
                                    <div className="text-center py-6 text-xs text-muted-foreground italic">
                                        {searchQuery ? `No sites found matching "${searchQuery}"` : "No sites available"}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
