import { cn } from "../lib/utils";
import {
    LayoutDashboard,
    Users,
    MapPin,
    QrCode,
    ClipboardList,
    ShieldAlert,
    BarChart3,
    Settings,
    Building2,
    Globe,
    Calendar,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../services/convex";
import { NavLink, useLocation } from "react-router-dom";

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

const navItems = [
    { name: "Dashboard", icon: LayoutDashboard, href: "/", permission: "analytics" },
    { name: "Users", icon: Users, href: "/users", permission: "users" },
    { name: "Organizations", icon: Building2, href: "/organizations", permission: "sites" },
    { name: "Regions", icon: Globe, href: "/regions", permission: "regions" },
    { name: "Sites", icon: MapPin, href: "/sites", permission: "sites" },

    // ✅ SINGLE PATROL TAB
    { name: "Patrol Reports", icon: QrCode, href: "/patrol", permission: "patrolLogs" },

    { name: "Visits", icon: ClipboardList, href: "/visit-logs", permission: "visitLogs" },
    { name: "Attendance", icon: Calendar, href: "/attendance", permission: "attendance" },
    { name: "Issue Tracker", icon: ShieldAlert, href: "/issues", permission: "issues" },
    { name: "Analytics", icon: BarChart3, href: "/analytics", permission: "analytics" },
];

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
    const { user } = useUser();
    const location = useLocation();

    const currentUser = useQuery(
        api.users.getByClerkId,
        user?.id ? { clerkId: user.id } : "skip"
    );
    const organization = useQuery(
        api.organizations.get,
        currentUser?.organizationId ? { id: currentUser.organizationId, currentOrganizationId: currentUser.organizationId } : "skip"
    );

    const permissions = currentUser?.permissions;
    const orgAccess = organization?.access;

    const filteredNavItems = navItems.filter((item) => {
        if (!permissions) {
            return false;
        }

        const hasUserPermission = permissions[item.permission as keyof typeof permissions];
        if (!hasUserPermission) return false;

        if (item.permission === "patrolLogs") {
            return orgAccess?.patrolling ?? true;
        }

        if (item.permission === "visitLogs") {
            return orgAccess?.visits ?? true;
        }

        if (item.permission === "attendance") {
            return orgAccess?.attendance ?? true;
        }

        return true;
    });

    return (
        <>
            {isOpen ? (
                <button
                    type="button"
                    aria-label="Close menu"
                    className="fixed inset-0 z-30 bg-black/60 lg:hidden"
                    onClick={onClose}
                />
            ) : null}
            <aside
                className={cn(
                    "w-64 bg-black h-full border-r border-white/10 shrink-0",
                    "fixed inset-y-0 left-0 z-40 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0",
                    isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}
            >
            <nav className="space-y-2 p-4 flex-1 overflow-y-auto">
                {filteredNavItems.map((item) => {
                    const isActive =
                        item.href === "/"
                            ? location.pathname === "/"
                            : location.pathname.startsWith(item.href); // ✅ FIXED ACTIVE STATE

                    return (
                        <NavLink
                            key={item.name}
                            to={item.href}
                            onClick={onClose}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
                                isActive
                                    ? "bg-primary text-white"
                                    : "text-gray-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <item.icon className="w-4 h-4" />
                            {item.name}
                        </NavLink>
                    );
                })}
            </nav>

            {/* ✅ Settings at bottom */}
            <div className="p-4 border-t border-white/10 mt-auto">
                <NavLink
                    to="/settings"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5"
                >
                    <Settings className="w-4 h-4" />
                    Settings
                </NavLink>
            </div>
        </aside>
        </>
    );
}