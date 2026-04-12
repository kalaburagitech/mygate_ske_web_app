import { SignIn, useUser } from "@clerk/nextjs";
import { ShieldCheck } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../../services/convex";
import { shouldRestrictToPendingUser } from "../../../lib/userRoles";

export default function Login() {
  const { user, isLoaded } = useUser();
  const currentUser = useQuery(
    api.users.getByClerkId,
    user?.id ? { clerkId: user.id } : "skip"
  );

  if (!isLoaded) {
    return null;
  }

  if (user) {
    if (shouldRestrictToPendingUser(currentUser) || currentUser?.status === "inactive") {
      return <Navigate to="/restricted" replace />;
    }

    if (currentUser) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-[440px] z-10 space-y-8">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10 shadow-2xl">
            <ShieldCheck className="w-12 h-12 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-white tracking-tight">Security OS</h1>
            <p className="text-gray-400">Enterprise Security Management System</p>
          </div>
        </div>

        <div className="glass rounded-[32px] border border-white/10 shadow-2xl overflow-hidden">
          <SignIn
            forceRedirectUrl="/dashboard"
            fallbackRedirectUrl="/dashboard"
            signUpForceRedirectUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "bg-transparent shadow-none w-full p-8",
                headerTitle: "text-white text-xl font-semibold",
                headerSubtitle: "text-gray-400",
                socialButtonsBlockButton:
                  "bg-white/5 border-white/10 hover:bg-white/10 text-white transition-all rounded-xl",
                socialButtonsBlockButtonText: "text-white font-medium",
                dividerLine: "bg-white/10",
                dividerText: "text-gray-500",
                formFieldLabel: "text-gray-300 mb-2",
                formFieldInput:
                  "bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary focus:border-primary",
                formButtonPrimary:
                  "bg-primary hover:bg-primary/90 text-white rounded-xl py-3 transition-all font-semibold",
                footerActionLink: "text-primary hover:text-primary/80",
                identityPreviewText: "text-white",
                identityPreviewEditButtonIcon: "text-gray-400",
              },
              layout: {
                socialButtonsPlacement: "top",
                showOptionalFields: false,
              },
            }}
          />
        </div>

        <p className="text-center text-gray-500 text-sm">
          Protected by high-level encryption & Clerk security.
        </p>
      </div>
    </div>
  );
}
