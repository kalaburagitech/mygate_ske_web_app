import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CustomUser {
    _id: string;
    /** Optional staff / face enrollment ID (Convex `users.id`); must match attendance `empId` for self check-out. */
    id?: string;
    name: string;
    email?: string;
    /** Single source of truth from Convex (may include multiple, e.g. SO + Visiting Officer). */
    roles: string[];
    organizationId: string;
    siteId?: string;
    siteIds?: string[];
    regionId?: string;
    city?: string;
    cities?: string[];
    mobileNumber?: string;
    status?: string;
    effectiveOrganizationId?: string;
    effectiveOrganizationName?: string;
}

interface AuthContextType {
    isCustomSignedIn: boolean;
    customUser: CustomUser | null;
    userId: string | null;
    organizationId: string | null;
    login: (user: unknown) => Promise<void>;
    logout: () => Promise<void>;
    isLoading: boolean;
}

function normalizeUserPayload(raw: unknown): CustomUser {
    const u = raw as Record<string, unknown> & {
        _id: string;
        name: string;
        organizationId: string;
    };
    const fromRoles = u.roles;
    const legacy = u.role;
    const roles =
        Array.isArray(fromRoles) && fromRoles.length > 0
            ? [...(fromRoles as string[])]
            : typeof legacy === "string" && legacy
              ? [legacy]
              : ["NEW_USER"];
    const { role: _omit, ...rest } = u;
    return { ...(rest as Omit<CustomUser, "roles">), roles };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [customUser, setCustomUser] = useState<CustomUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadStorageData();
    }, []);

    const loadStorageData = async () => {
        try {
            const storedUser = await AsyncStorage.getItem('custom_user');
            if (storedUser) {
                setCustomUser(JSON.parse(storedUser));
            }
        } catch (e) {
            console.error('Failed to load auth state', e);
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (user: unknown) => {
        try {
            const normalized = normalizeUserPayload(user);
            await AsyncStorage.setItem('custom_user', JSON.stringify(normalized));
            setCustomUser(normalized);
        } catch (e) {
            console.error('Failed to save auth state', e);
        }
    };

    const logout = async () => {
        try {
            if (customUser?._id) {
                try {
                    // Temporarily disabling backend logout log because we removed convex imports from mobile
                    console.log("Logged out user", customUser._id);
                } catch (err) {
                    console.error('Failed to log logout', err);
                }
            }
            await AsyncStorage.removeItem('custom_user');
            const store = require('../store/usePatrolStore').usePatrolStore;
            store.getState().setLastSelection(null, null);
            store.getState().clearLastScannedPoints();
            setCustomUser(null);
        } catch (e) {
            console.error('Failed to clear auth state', e);
        }
    };

    return (
        <AuthContext.Provider value={{
            isCustomSignedIn: !!customUser,
            customUser,
            userId: customUser?._id || null,
            organizationId: customUser?.effectiveOrganizationId || customUser?.organizationId || null,
            login,
            logout,
            isLoading
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useCustomAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useCustomAuth must be used within an AuthProvider');
    }
    return context;
};
