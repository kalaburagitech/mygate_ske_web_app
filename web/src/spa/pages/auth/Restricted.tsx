"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Clock3, LogOut } from "lucide-react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../services/convex";
import { shouldRestrictToPendingUser } from "../../../lib/userRoles";

export default function Restricted() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const currentUser = useQuery(
    api.users.getByClerkId,
    user?.id ? { clerkId: user.id } : "skip"
  );
  const notifyAdmin = useMutation(api.notifications.notifyUnique);
  const [isPinging, setIsPinging] = useState(false);

  useEffect(() => {
    if (currentUser && !shouldRestrictToPendingUser(currentUser) && currentUser.status !== "inactive") {
      navigate("/", { replace: true });
    }
  }, [currentUser, navigate]);

  const isInactive = currentUser?.status === "inactive";

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-[520px] z-10">
        <div className="glass rounded-[32px] border border-white/10 shadow-2xl p-8 md:p-10 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-white tracking-tight">Access Pending Approval</h1>
            <p className="text-gray-400">
              {isInactive
                ? "Your account is currently inactive. Please contact your administrator to reactivate your dashboard access."
                : "Your login was created successfully, but your account is waiting for an administrator to assign a role and organization access."}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
            <div className="flex items-start gap-3">
              <Clock3 className="w-5 h-5 text-primary mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">What happens next</p>
                <p className="text-sm text-gray-400">
                  {isInactive
                    ? "Ask your owner or admin to change your user status back to active. Once they do, this page will unlock automatically."
                    : "Ask your owner or admin to update your role from `NEW_USER` to the correct access level. Once they do, this page will unlock automatically."}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={async () => {
                if (currentUser?._id && currentUser?.organizationId) {
                  setIsPinging(true);
                  try {
                    await notifyAdmin({
                      organizationId: currentUser.organizationId,
                      type: "new_user",
                      title: "User Waiting for Approval",
                      message: `${currentUser.name} is checking their access. Please assign a role.`,
                      referenceId: currentUser._id,
                    });
                    toast.success("Request sent to administrator");
                  } catch (e) {
                    // Ignore errors if they spam
                  } finally {
                    setIsPinging(false);
                  }
                }
                window.location.reload();
              }}
              disabled={isPinging}
              className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPinging ? "Checking..." : "Check Access Again"}
            </button>
            <button
              onClick={async () => {
                await signOut();
                navigate("/login", { replace: true });
              }}
              className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white text-sm font-medium hover:bg-white/10 transition-colors inline-flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
