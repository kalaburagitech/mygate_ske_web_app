import { useQuery, useMutation } from "convex/react";
import { api } from "../services/convex";
import { Check, Trash2, UserPlus, AlertCircle, Clock, Bell, Copy } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { cn } from "../lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface NotificationListProps {
    organizationId: Id<"organizations">;
    onClose?: () => void;
}

function formatTimeDistance(timestamp: number) {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
}

export function NotificationList({ organizationId, onClose }: NotificationListProps) {
    const notifications = useQuery(api.notifications.list, { organizationId, limit: 10 });
    const markAsRead = useMutation(api.notifications.markAsRead);
    const markAllAsRead = useMutation(api.notifications.markAllAsRead);
    const removeNotification = useMutation(api.notifications.remove);
    const clearAll = useMutation(api.notifications.removeAll);
    const navigate = useNavigate();

    if (!notifications) return null;

    const handleNotificationClick = async (id: Id<"notifications">, type: string) => {
        await markAsRead({ id });
        if (type === "new_user") {
            navigate("/users");
        } else if (type === "issue") {
            navigate("/issues");
        }
        if (onClose) onClose();
    };

    return (
        <div className="w-80 sm:w-96 flex flex-col bg-[#141414] border border-white/5 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-white/90">Notifications</h3>
                </div>
                <div className="flex items-center gap-3">
                    {notifications.length > 0 && (
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                clearAll({ organizationId });
                            }}
                            className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors flex items-center gap-1"
                        >
                            <Trash2 className="w-3 h-3" />
                            Clear all
                        </button>
                    )}
                    {notifications.some(n => !n.isRead) && (
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                markAllAsRead({ organizationId });
                            }}
                            className="text-[10px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                        >
                            <Check className="w-3 h-3" />
                            Mark all
                        </button>
                    )}
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto max-h-[400px] custom-scrollbar">
                {notifications.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                        <Bell className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">No notifications yet</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {notifications.map((note) => (
                            <div 
                                key={note._id}
                                className={cn(
                                    "px-4 py-3 hover:bg-white/[0.02] transition-colors relative group cursor-pointer",
                                    !note.isRead && "bg-primary/5"
                                )}
                                onClick={() => handleNotificationClick(note._id, note.type)}
                            >
                                <div className="flex gap-3">
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                        note.type === "new_user" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                                    )}>
                                        {note.type === "new_user" ? (
                                            <UserPlus className="w-4 h-4" />
                                        ) : (
                                            <AlertCircle className="w-4 h-4" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <p className="text-xs font-semibold text-white/90 truncate">
                                                {note.title}
                                            </p>
                                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 whitespace-nowrap">
                                                <Clock className="w-2.5 h-2.5" />
                                                {formatTimeDistance(note.createdAt)}
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                            {note.message}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                        <div className="flex items-center gap-1">
                                            {note.type === "new_user" && (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const emailMatch = note.message.match(/\((.*?)\)/);
                                                        if (emailMatch?.[1]) {
                                                            navigator.clipboard.writeText(emailMatch[1]);
                                                            toast.success(`Email copied: ${emailMatch[1]}`);
                                                        }
                                                    }}
                                                    className="p-1 hover:bg-white/10 rounded-md text-muted-foreground/0 group-hover:text-muted-foreground hover:text-primary transition-all"
                                                    title="Copy Email"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </button>
                                            )}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeNotification({ id: note._id });
                                                }}
                                                className="p-1 hover:bg-white/10 rounded-md text-muted-foreground/0 group-hover:text-muted-foreground hover:text-red-400 transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                        {!note.isRead && (
                                            <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(37,99,235,0.6)]" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-white/5 bg-white/[0.01]">
                <button 
                    onClick={onClose}
                    className="w-full text-[11px] text-muted-foreground hover:text-white transition-colors py-1"
                >
                    Close
                </button>
            </div>
        </div>
    );
}
