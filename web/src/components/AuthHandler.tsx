import React, { useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { toast } from "sonner";
import { useMutation, useAction } from "convex/react";
import { api } from "../services/convex";
import { useNavigate } from "react-router-dom";
import { primaryRoleForJwt, shouldRestrictToPendingUser } from "../lib/userRoles";

export default function AuthHandler({ children }: { children: React.ReactNode }) {
    const { user, isLoaded } = useUser();
    const { session } = useClerk();
    const navigate = useNavigate();
    const syncUser = useMutation(api.auth.getOrCreateUser);
    const logLogin = useMutation(api.loginLogs.logLogin);
    const generateToken = useAction(api.jwt.generateUserToken);
    const [isSynced, setIsSynced] = useState(false);

    useEffect(() => {
        const handleAuth = async () => {
            console.log("AuthHandler: checking status...", { isLoaded, hasUser: !!user, isSynced });
            if (isLoaded && user && !isSynced) {
                try {
                    console.log("AuthHandler: syncing user with options:", {
                        clerkId: user.id,
                        email: user.primaryEmailAddress?.emailAddress,
                        name: user.fullName || user.username
                    });
                    
                    const convexUser = await syncUser({
                        clerkId: user.id,
                        name: user.fullName || user.username || "Unknown",
                        email: user.primaryEmailAddress?.emailAddress || "",
                    });

                    if (convexUser) {
                        console.log("AuthHandler: user synced successfully:", {
                            id: convexUser._id,
                            roles: convexUser.roles,
                            clerkIdInConvex: convexUser.clerkId
                        });
                        const token = await generateToken({
                            userId: convexUser._id,
                            email: convexUser.email || "",
                            role: primaryRoleForJwt(convexUser),
                            permissions: convexUser.permissions,
                        });

                        console.log("AuthHandler: token generated, storing in localStorage");
                        localStorage.setItem("auth_token", token);

                        await logLogin({
                            userId: convexUser._id,
                            email: user.primaryEmailAddress?.emailAddress || "",
                            organizationId: convexUser.organizationId,
                            sessionId: session?.id,
                            browserInfo: navigator.userAgent,
                            loginStatus: "success",
                        });

                        console.log("AuthHandler: sync complete");
                        setIsSynced(true);

                        if ((shouldRestrictToPendingUser(convexUser) || convexUser.status === "inactive") && window.location.pathname !== "/restricted") {
                            console.log("AuthHandler: redirecting to restricted access");
                            navigate("/restricted");
                        }
                    } else {
                        console.error("AuthHandler: syncUser returned null");
                        toast.error("User synchronization failed: no user data returned.");
                    }
                } catch (error: any) {
                    console.error("AuthHandler: sync failed error:", error);
                    toast.error(`Authentication sync error: ${error.message || "Unknown error"}`);
                }
            }
        };

        handleAuth();
    }, [isLoaded, user, isSynced, syncUser, logLogin, generateToken, session, navigate]);

    // Keep the app interactive while auth sync completes in background.
    if (!isLoaded) return null;

    return <>{children}</>;
}
