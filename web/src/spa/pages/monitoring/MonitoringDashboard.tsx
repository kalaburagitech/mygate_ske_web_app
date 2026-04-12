import { Layout } from "../../../components/Layout";
import { 
  ShieldCheck, 
  MapPin, 
  Clock, 
  ClipboardList, 
  TrendingUp,
  LayoutDashboard,
  Check,
  X as XIcon,
  User as UserIcon,
  Car
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../services/convex";
import { useState } from "react";
import { cn } from "../../../lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";
import { SiteSelector } from "../../../components/SiteSelector";
import { toast } from "sonner";

interface MonitoringDashboardProps {
  userId: Id<"users">;
}

export default function MonitoringDashboard({ userId }: MonitoringDashboardProps) {
  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const updateStatus = useMutation(api.logs.updateVisitorStatus);
  
  const dashboardData = useQuery(
    api.clientDashboard.getClientDashboardData, 
    { userId, siteIds: (selectedSiteId === "all" || !selectedSiteId) ? undefined : [selectedSiteId as Id<"sites">] }
  );

  if (!dashboardData) {
    return (
      <Layout title="Monitoring Dashboard">
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-pulse flex flex-col items-center gap-4">
             <LayoutDashboard className="w-12 h-12 text-primary/20" />
             <p className="text-muted-foreground font-medium">Loading command center...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const { organizationName, stats, pendingVisitors, pendingVehicles } = dashboardData;

  const handleAction = async (logId: Id<"visitLogs">, status: "approved" | "rejected") => {
    try {
      await updateStatus({ logId, status });
      toast.success(`Request ${status} successfully`);
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  return (
    <Layout title={`${organizationName} • Monitoring`}>
      <div className="space-y-8 pb-12">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/5 border border-white/10 p-6 rounded-3xl glass shadow-2xl relative z-[100]">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{organizationName} Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Real-time visitor and vehicle tracking</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="min-w-[200px]">
              <SiteSelector
                organizationId={dashboardData.assignedSites[0]?.organizationId}
                selectedSiteId={selectedSiteId === "all" ? "" : selectedSiteId}
                onSiteChange={(id) => setSelectedSiteId(id || "all")}
                requestingUserId={userId}
                allOptionLabel="All Sites"
              />
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            label="Attendance Awaiting" 
            value={stats?.pendingAttendance ?? 0} 
            icon={Clock} 
            color="text-pink-400" 
            bg="bg-pink-400/10" 
          />
          <StatCard 
            label="Pending Visitors" 
            value={stats?.pendingVisitors ?? 0} 
            icon={UserIcon} 
            color="text-amber-400" 
            bg="bg-amber-400/10" 
          />
          <StatCard 
            label="Pending Vehicles" 
            value={stats?.pendingVehicles ?? 0} 
            icon={Car} 
            color="text-blue-400" 
            bg="bg-blue-400/10" 
          />
          <StatCard 
            label="Approved Today" 
            value={stats?.approvedToday ?? 0} 
            icon={ShieldCheck} 
            color="text-emerald-400" 
            bg="bg-emerald-400/10" 
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Pending Visitor Approvals */}
          <DataSection 
            title="Pending Visitor Approvals" 
            icon={ClipboardList} 
            color="text-amber-400"
          >
            {(pendingVisitors?.length ?? 0) > 0 ? (
              <div className="space-y-4">
                {pendingVisitors?.map((log: any) => (
                  <ApprovalItem 
                    key={log._id}
                    log={log}
                    onApprove={() => handleAction(log._id, "approved")}
                    onReject={() => handleAction(log._id, "rejected")}
                  />
                ))}
              </div>
            ) : (
              <EmptyState message="No pending visitors" />
            )}
          </DataSection>

          {/* Pending Vehicle Approvals */}
          <DataSection 
            title="Pending Vehicle Approvals" 
            icon={ShieldCheck} 
            color="text-blue-400"
          >
            {(pendingVehicles?.length ?? 0) > 0 ? (
              <div className="space-y-4">
                {pendingVehicles?.map((log: any) => (
                  <ApprovalItem 
                    key={log._id}
                    log={log}
                    onApprove={() => handleAction(log._id, "approved")}
                    onReject={() => handleAction(log._id, "rejected")}
                  />
                ))}
              </div>
            ) : (
              <EmptyState message="No pending vehicles" />
            )}
          </DataSection>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ label, value, icon: Icon, color, bg }: any) {
  return (
    <div className="glass p-6 rounded-3xl border border-white/10 hover:border-primary/50 transition-all group relative overflow-hidden">
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
      <div className="flex items-center gap-4 relative z-10">
        <div className={cn("p-4 rounded-2xl", bg, color)}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
          <p className="text-3xl font-bold text-white mt-1">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DataSection({ title, icon: Icon, color, children }: any) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 lg:p-8 glass shadow-xl min-h-[400px]">
      <div className="flex items-center gap-3 mb-8">
        <div className={cn("p-2 rounded-xl bg-white/5", color)}>
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ApprovalItem({ log, onApprove, onReject }: any) {
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-primary/20 border border-white/10">
          {log.photoUrl ? (
            <img src={log.photoUrl} alt="Visitor" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-primary">
              {log.vehicleNumber ? <Car className="w-6 h-6" /> : <UserIcon className="w-6 h-6" />}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-bold text-white transition-colors">
            {log.visitorName || "Unknown Visitor"} {log.numberOfPeople > 1 ? `(+${log.numberOfPeople - 1})` : ""}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase mt-1">
            {log.vehicleNumber ? `Vehicle: ${log.vehicleNumber} • ` : ""}
            {log.siteName} • {new Date(log._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-[10px] text-primary/80 mt-1">SO: {log.userName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button 
          onClick={onApprove}
          className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 transition-colors"
          title="Approve"
        >
          <Check className="w-5 h-5" />
        </button>
        <button 
          onClick={onReject}
          className="p-2 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 transition-colors"
          title="Reject"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-20 flex flex-col items-center justify-center text-center opacity-50">
      <TrendingUp className="w-8 h-8 text-muted-foreground/30 mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
