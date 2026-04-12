import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthorizedSiteIds } from "./accessControl";

function normShiftKey(shiftName: string | undefined): string {
    const t = (shiftName ?? "").trim();
    return t.length ? t.toLowerCase() : "default";
}

export const create = mutation({
    args: {
        personId: v.optional(v.string()),
        empId: v.string(),
        name: v.string(),
        date: v.string(),
        checkInTime: v.optional(v.number()),
        checkOutTime: v.optional(v.number()),
        status: v.union(v.literal("present"), v.literal("absent")),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        locationAccuracy: v.optional(v.number()),
        region: v.string(),
        organizationId: v.optional(v.id("organizations")),
        siteId: v.optional(v.id("sites")),
        siteName: v.optional(v.string()),
        shiftName: v.optional(v.string()),
        attendanceId: v.optional(v.id("attendanceRecords")),
        type: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const shiftKey = normShiftKey(args.shiftName);

        let existing = null;
        if (args.attendanceId) {
            existing = await ctx.db.get(args.attendanceId);
        }

        if (!existing) {
            const dayRecords = await ctx.db
                .query("attendanceRecords")
                .withIndex("by_empId_date", (q) => q.eq("empId", args.empId).eq("date", args.date))
                .collect();

            existing =
                dayRecords.find((r) => normShiftKey(r.shiftName) === shiftKey) ?? null;

            if (!existing && dayRecords.length === 1) {
                const only = dayRecords[0];
                if (!only.shiftName && shiftKey === "default") {
                    existing = only;
                }
            }
        }

        const incomingIn = args.checkInTime;
        const incomingOut = args.checkOutTime;

        if (existing) {
            const complete =
                existing.checkInTime != null && existing.checkOutTime != null;
            if (
                complete &&
                incomingIn != null &&
                incomingOut == null
            ) {
                throw new Error(
                    "Attendance for this shift is already complete. Use another shift if you are working a double."
                );
            }
            const dupOpenCheckIn =
                incomingIn != null &&
                existing.checkInTime != null &&
                existing.checkOutTime == null &&
                incomingOut == null;
            if (dupOpenCheckIn) {
                throw new Error(
                    "Already checked in for this shift. Check out first or pick a different shift."
                );
            }

            await ctx.db.patch(existing._id, {
                checkInTime: args.checkInTime ?? existing.checkInTime,
                checkOutTime: args.checkOutTime ?? existing.checkOutTime,
                status: args.status,
                latitude: args.latitude ?? existing.latitude,
                longitude: args.longitude ?? existing.longitude,
                locationAccuracy: args.locationAccuracy ?? existing.locationAccuracy,
                siteId: args.siteId ?? existing.siteId,
                siteName: args.siteName ?? existing.siteName,
                shiftName: args.shiftName ?? existing.shiftName,
            });
            return existing._id;
        }

        const attendanceId = await ctx.db.insert("attendanceRecords", {
            personId: args.personId,
            empId: args.empId,
            name: args.name,
            date: args.date,
            checkInTime: args.checkInTime,
            checkOutTime: args.checkOutTime,
            status: args.status,
            latitude: args.latitude,
            longitude: args.longitude,
            locationAccuracy: args.locationAccuracy,
            region: args.region,
            organizationId: args.organizationId,
            siteId: args.siteId,
            siteName: args.siteName,
            shiftName: args.shiftName,
        });
        return attendanceId;
    },
});

export const createManualAttendance = mutation({
    args: {
        name: v.string(),
        date: v.string(),
        checkInTime: v.optional(v.number()),
        latitude: v.number(),
        longitude: v.number(),
        locationAccuracy: v.optional(v.number()),
        region: v.string(),
        organizationId: v.id("organizations"),
        siteId: v.id("sites"),
        siteName: v.optional(v.string()),
        imageId: v.string(),
        type: v.literal("staff_manual"),
    },
    handler: async (ctx, args) => {
        const attendanceId = await ctx.db.insert("attendanceRecords", {
            empId: "MANUAL_" + Date.now(), // Generate a placeholder empId
            name: args.name,
            date: args.date,
            checkInTime: args.checkInTime,
            status: "present", // Marked as present initially, but pending approval
            approvalStatus: "pending",
            latitude: args.latitude,
            longitude: args.longitude,
            locationAccuracy: args.locationAccuracy,
            region: args.region,
            organizationId: args.organizationId,
            siteId: args.siteId,
            siteName: args.siteName,
            imageId: args.imageId,
            createdAt: Date.now(),
            type: "staff_manual",
        });

        // Trigger notification for the client
        const site = await ctx.db.get(args.siteId);
        await ctx.db.insert("notifications", {
            organizationId: args.organizationId,
            type: "issue", // Reusing issue type for now to show in dashboard, or can extend
            title: `Attendance Approval Needed`,
            message: `${args.name} at ${site?.name || "Unknown Site"}`,
            isRead: false,
            createdAt: Date.now(),
        });

        return attendanceId;
    },
});

export const updateAttendanceStatus = mutation({
    args: {
        attendanceId: v.id("attendanceRecords"),
        status: v.union(v.literal("approved"), v.literal("rejected")),
        approverId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        let approverName = undefined;
        if (args.approverId) {
            const user = await ctx.db.get(args.approverId);
            approverName = user?.name;
        }

        await ctx.db.patch(args.attendanceId, {
            approvalStatus: args.status,
            approverId: args.approverId,
            approvedByName: approverName,
            approvedAt: Date.now(),
        });
    },
});

export const getByPersonAndDate = query({
    args: {
        empId: v.string(),
        date: v.string(),
    },
    handler: async (ctx, args) => {
        const record = await ctx.db
            .query("attendanceRecords")
            .withIndex("by_empId_date", (q) => q.eq("empId", args.empId).eq("date", args.date))
            .first();

        return record;
    },
});

export const getByEmpIdAndDate = query({
    args: {
        empId: v.string(),
        date: v.string(),
    },
    handler: async (ctx, args) => {
        const records = await ctx.db
            .query("attendanceRecords")
            .withIndex("by_empId_date", (q) => q.eq("empId", args.empId).eq("date", args.date))
            .collect();

        const open = records.find((r) => r.checkInTime != null && r.checkOutTime == null);
        if (open) return open;
        return records[0] ?? null;
    },
});

/** All rows for an employee on a calendar day (multiple shifts). */
export const listByEmpIdAndDate = query({
    args: {
        empId: v.string(),
        date: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("attendanceRecords")
            .withIndex("by_empId_date", (q) => q.eq("empId", args.empId).eq("date", args.date))
            .collect();
    },
});

export const list = query({
    args: {
        organizationId: v.optional(v.id("organizations")),
        region: v.optional(v.string()),
        date: v.optional(v.string()),
        empId: v.optional(v.string()),
        siteId: v.optional(v.id("sites")),
        shiftName: v.optional(v.string()),
        requestingUserId: v.optional(v.id("users")),
        approvalStatus: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        
        let records;
        if (args.siteId) {
            records = await ctx.db
                .query("attendanceRecords")
                .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
                .collect();
        } else if (authorizedSiteIds) {
            const recordsPromises = authorizedSiteIds.map(sid => 
                ctx.db.query("attendanceRecords")
                    .withIndex("by_site", q => q.eq("siteId", sid))
                    .collect()
            );
            const results = await Promise.all(recordsPromises);
            records = results.flat();
        } else if (args.organizationId) {
            // Unrestricted fallback: use hierarchy
            const orgIds = [args.organizationId];
            const childOrgs = await ctx.db.query("organizations")
                .withIndex("by_parent_org", (q: any) => q.eq("parentOrganizationId", args.organizationId))
                .collect();
            childOrgs.forEach(o => orgIds.push(o._id));
            
            let all = [] as any[];
            for (const oid of orgIds) {
                const results = await ctx.db.query("attendanceRecords")
                    .withIndex("by_org", q => q.eq("organizationId", oid))
                    .collect();
                all = [...all, ...results];
            }
            records = all;
        } else if (args.region) {
            records = await ctx.db
                .query("attendanceRecords")
                .withIndex("by_region", (q) => q.eq("region", args.region!))
                .collect();
        } else if (args.empId) {
            records = await ctx.db
                .query("attendanceRecords")
                .withIndex("by_empId", (q) => q.eq("empId", args.empId!))
                .collect();
        } else if (args.date) {
            records = await ctx.db
                .query("attendanceRecords")
                .withIndex("by_date", (q) => q.eq("date", args.date!))
                .collect();
        } else {
            records = await ctx.db.query("attendanceRecords").collect();
        }
        
        let filtered = records;
        if (authorizedSiteIds) {
            const allowedSet = new Set(authorizedSiteIds.map(id => id.toString()));
            filtered = filtered.filter(r => r.siteId && allowedSet.has(r.siteId.toString()));
        }

        // Filter by additional criteria if needed
        if (args.date) {
            filtered = filtered.filter((r) => r.date === args.date);
        }
        if (args.region && (args.organizationId || args.empId || args.date)) {
            filtered = filtered.filter((r) => r.region === args.region);
        }
        if (args.empId && (args.organizationId || args.region || args.date)) {
            filtered = filtered.filter((r) => r.empId === args.empId);
        }
        if (args.siteId) {
            filtered = filtered.filter((r) => r.siteId === args.siteId);
        }
        if (args.shiftName) {
            filtered = filtered.filter((r) => r.shiftName === args.shiftName);
        }
        if (args.approvalStatus) {
            filtered = filtered.filter((r) => r.approvalStatus === args.approvalStatus);
        }

        return filtered;
    },
});

export const listForOrgDateRange = query({
    args: {
        organizationId: v.id("organizations"),
        startDate: v.string(),
        endDate: v.string(),
        requestingUserId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        const records = await ctx.db
            .query("attendanceRecords")
            .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
            .collect();

        const inDateRange = records.filter(
            (r) => r.date >= args.startDate && r.date <= args.endDate
        );

        if (authorizedSiteIds) {
            const allowedSet = new Set(authorizedSiteIds.map((id) => id.toString()));
            return inDateRange.filter((r) => r.siteId && allowedSet.has(r.siteId.toString()));
        }

        return inDateRange;
    },
});

export const countByOrg = query({
    args: {
        organizationId: v.optional(v.id("organizations")),
        siteId: v.optional(v.id("sites")),
        regionId: v.optional(v.string()),
        city: v.optional(v.string()),
        requestingUserId: v.optional(v.id("users")),
        date: v.optional(v.string()), // Optional: count for a specific day
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        let records;

        if (args.organizationId) {
            records = await ctx.db
                .query("attendanceRecords")
                .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId!))
                .collect();
        } else {
            records = await ctx.db.query("attendanceRecords").collect();
        }

        let filtered = records;
        if (authorizedSiteIds) {
            const allowedSet = new Set(authorizedSiteIds.map(id => id.toString()));
            filtered = filtered.filter(r => r.siteId && allowedSet.has(r.siteId.toString()));
        }

        if (args.date) {
            filtered = filtered.filter((r) => r.date === args.date);
        }
        if (args.siteId) {
            filtered = filtered.filter((r) => r.siteId === args.siteId);
        }
        if (args.regionId) {
            filtered = filtered.filter((r) => r.region === args.regionId);
        }

        return filtered.length;
    },
});

export const countPending = query({
    args: {
        organizationId: v.optional(v.id("organizations")),
        requestingUserId: v.optional(v.id("users")),
        siteId: v.optional(v.id("sites")),
    },
    handler: async (ctx, args) => {
        const authorizedSiteIds = await getAuthorizedSiteIds(ctx, args.requestingUserId);
        
        let records;
        if (args.siteId) {
            records = await ctx.db.query("attendanceRecords")
                .withIndex("by_site", q => q.eq("siteId", args.siteId as any))
                .filter(q => q.eq(q.field("approvalStatus"), "pending"))
                .collect();
        } else if (authorizedSiteIds) {
            const promises = authorizedSiteIds.map(sid => 
                ctx.db.query("attendanceRecords")
                    .withIndex("by_site", q => q.eq("siteId", sid))
                    .filter(q => q.eq(q.field("approvalStatus"), "pending"))
                    .collect()
            );
            const results = await Promise.all(promises);
            records = results.flat();
        } else if (args.organizationId) {
            records = await ctx.db.query("attendanceRecords")
                .withIndex("by_org", q => q.eq("organizationId", args.organizationId!))
                .filter(q => q.eq(q.field("approvalStatus"), "pending"))
                .collect();
        } else {
            records = await ctx.db.query("attendanceRecords")
                .filter(q => q.eq(q.field("approvalStatus"), "pending"))
                .collect();
        }

        return records.length;
    }
});
