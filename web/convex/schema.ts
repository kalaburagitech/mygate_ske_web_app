import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    organizations: defineTable({
        name: v.string(),
        parentOrganizationId: v.optional(v.id("organizations")),
        status: v.union(v.literal("active"), v.literal("inactive")),
        access: v.object({
            patrolling: v.boolean(),
            visits: v.boolean(),
            attendance: v.boolean(),
        }),
        createdAt: v.number(),
    }).index("by_parent_org", ["parentOrganizationId"]),

    users: defineTable({
        clerkId: v.string(),
        name: v.string(),
        email: v.optional(v.string()),
        mobileNumber: v.optional(v.string()),
        id: v.optional(v.string()),
        roles: v.array(
            v.union(
                v.literal("Owner"),
                v.literal("Deployment Manager"),
                v.literal("Manager"),
                v.literal("Visiting Officer"),
                v.literal("SO"),
                v.literal("Client"),
                v.literal("NEW_USER")
            )
        ),
        status: v.union(v.literal("active"), v.literal("inactive")),
        organizationId: v.id("organizations"),
        regionId: v.optional(v.string()),
        cities: v.optional(v.array(v.string())), // Changed from city to cities array
        siteId: v.optional(v.id("sites")),
        siteIds: v.optional(v.array(v.id("sites"))),
        permissions: v.optional(v.object({
            users: v.boolean(),
            sites: v.boolean(),
            patrolPoints: v.boolean(),
            patrolLogs: v.boolean(),
            visitLogs: v.boolean(),
            issues: v.boolean(),
            analytics: v.boolean(),
            attendance: v.optional(v.boolean()),
            regions: v.optional(v.boolean()),
        })),
        creationTime: v.optional(v.number()),
    }).index("by_clerkId", ["clerkId"])
        .index("by_org", ["organizationId"])
        .index("by_email", ["email"])
        .index("by_region", ["regionId"]),

    loginLogs: defineTable({
        userId: v.id("users"),
        email: v.string(),
        organizationId: v.optional(v.id("organizations")),
        loginTime: v.optional(v.number()),
        logoutTime: v.optional(v.number()),
        ipAddress: v.optional(v.string()),
        browserInfo: v.optional(v.string()),
        sessionId: v.optional(v.string()),
        loginStatus: v.union(v.literal("success"), v.literal("failed"), v.literal("logout")),
        failureReason: v.optional(v.string()),
    }).index("by_user", ["userId"]),

    sites: defineTable({
        name: v.string(),
        locationName: v.optional(v.string()),
        latitude: v.number(),
        longitude: v.number(),
        allowedRadius: v.number(),
        organizationId: v.id("organizations"),
        regionId: v.optional(v.string()),
        city: v.optional(v.string()),
        shiftStart: v.optional(v.string()),
        shiftEnd: v.optional(v.string()),
        shifts: v.optional(v.array(v.object({
            name: v.string(),
            start: v.string(),
            end: v.string(),
            strength: v.number(),
        }))),
    }).index("by_org", ["organizationId"])
        .index("by_region", ["regionId"]),

    patrolPoints: defineTable({
        siteId: v.id("sites"),
        siteName: v.optional(v.string()),
        name: v.string(),
        qrCode: v.string(),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        /** Geofence for this checkpoint only (meters). Default 200 in app logic if unset. */
        pointRadiusMeters: v.optional(v.number()),
        organizationId: v.id("organizations"),
        imageId: v.optional(v.string()),
        createdAt: v.optional(v.number()),
    })
        .index("by_org", ["organizationId"])
        .index("by_site", ["siteId"])
        .index("by_org_qr", ["organizationId", "qrCode"]),

    patrolLogs: defineTable({
        userId: v.id("users"),
        siteId: v.id("sites"),
        patrolPointId: v.optional(v.id("patrolPoints")),
        imageId: v.optional(v.string()),
        comment: v.string(),
        latitude: v.number(),
        longitude: v.number(),
        distance: v.number(),
        createdAt: v.number(),
        organizationId: v.id("organizations"),
        /** Links scans to one patrol session (start → end). */
        sessionId: v.optional(v.id("patrolSessions")),
        /** When a supervisor runs patrol on behalf of an enrolled guard (mobile picker). */
        patrolSubjectEmpId: v.optional(v.string()),
        patrolSubjectName: v.optional(v.string()),
    })
        .index("by_org", ["organizationId"])
        .index("by_site", ["siteId"])
        .index("by_user", ["userId"])
        .index("by_session", ["sessionId"]),

    visitLogs: defineTable({
        userId: v.id("users"),
        siteId: v.id("sites"),
        qrData: v.string(),
        visitType: v.optional(v.string()),
        imageId: v.optional(v.string()),
        /** Additional proof images (storage ids). */
        imageIds: v.optional(v.array(v.string())),
        /** Optional separate ID proof image id. */
        idProofImageId: v.optional(v.string()),
        remark: v.string(),
        latitude: v.number(),
        longitude: v.number(),
        createdAt: v.number(),
        organizationId: v.id("organizations"),
        status: v.optional(
            v.union(
                v.literal("pending"),
                v.literal("approved"),
                v.literal("rejected"),
                v.literal("inside"),
                v.literal("exited")
            )
        ),
        entryTime: v.optional(v.number()),
        exitTime: v.optional(v.number()),
        checkOutAt: v.optional(v.number()),
        checkOutLatitude: v.optional(v.number()),
        checkOutLongitude: v.optional(v.number()),
        checkOutAccuracyM: v.optional(v.number()),
        checkInAccuracyM: v.optional(v.number()),
        distanceFromSiteM: v.optional(v.number()),
        visitorName: v.optional(v.string()),
        numberOfPeople: v.optional(v.number()),
        vehicleNumber: v.optional(v.string()),
        targetUserId: v.optional(v.id("users")), // Client responsible for approval
        exitImageId: v.optional(v.string()),
    })
        .index("by_org", ["organizationId"])
        .index("by_site", ["siteId"])
        .index("by_user_created", ["userId", "createdAt"])
        .index("by_org_created", ["organizationId", "createdAt"]),

    issues: defineTable({
        siteId: v.id("sites"),
        logId: v.union(v.id("patrolLogs"), v.id("visitLogs")),
        title: v.string(),
        description: v.string(),
        priority: v.union(v.literal("Low"), v.literal("Medium"), v.literal("High")),
        status: v.union(v.literal("open"), v.literal("closed")),
        timestamp: v.number(),
        organizationId: v.id("organizations"),
    }).index("by_org", ["organizationId"]).index("by_site", ["siteId"]),

    logs: defineTable({
        type: v.union(v.literal("patrol"), v.literal("visit"), v.literal("issue")),
        refId: v.union(v.id("patrolLogs"), v.id("visitLogs"), v.id("issues")),
        organizationId: v.id("organizations"),
        siteId: v.optional(v.id("sites")),
        guardId: v.optional(v.id("users")),
        status: v.optional(v.string()),
        issue: v.optional(v.boolean()),
        createdAt: v.optional(v.number()),
    }).index("by_org", ["organizationId"])
        .index("by_guard", ["guardId"])
        .index("by_org_status", ["organizationId", "status"]),

    patrolSessions: defineTable({
        guardId: v.id("users"),
        siteId: v.id("sites"),
        organizationId: v.id("organizations"),
        status: v.union(v.literal("active"), v.literal("inactive"), v.literal("completed")),
        startTime: v.number(),
        endTime: v.optional(v.number()),
        scannedPoints: v.optional(v.array(v.id("patrolPoints"))),
    })
        .index("by_org_status", ["organizationId", "status"])
        .index("by_site", ["siteId"])
        .index("by_org", ["organizationId"])
        .index("by_org_end", ["organizationId", "endTime"]),

    incidents: defineTable({
        guardId: v.id("users"),
        userId: v.optional(v.id("users")),
        siteId: v.id("sites"),
        patrolPointId: v.optional(v.id("patrolPoints")),
        imageId: v.optional(v.string()),
        comment: v.string(),
        severity: v.union(v.literal("Low"), v.literal("Medium"), v.literal("High")),
        timestamp: v.number(),
        organizationId: v.id("organizations"),
    }).index("by_org", ["organizationId"]).index("by_site", ["siteId"]),

    regions: defineTable({
        cities: v.array(v.string()),
        createdAt: v.float64(),
        isActive: v.boolean(),
        organizationId: v.optional(v.id("organizations")),
        regionName: v.string(),
        regionId: v.string(),
    })
        .index("by_regionId", ["regionId"])
        .index("by_regionName", ["regionName"])
        .index("by_org", ["organizationId"]),

    enrolledPersons: defineTable({
        name: v.string(),
        empId: v.string(),
        empRank: v.string(),
        status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
        region: v.string(),
        faceEncodingIds: v.array(v.number()),
        enrolledAt: v.number(),
        organizationId: v.optional(v.id("organizations")),
        empCode: v.optional(v.string()),
        description: v.optional(v.string()),
    }).index("by_org", ["organizationId"])
        .index("by_empId", ["empId"])
        .index("by_region", ["region"]),

    attendanceRecords: defineTable({
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
        siteName: v.optional(v.string()),
        shiftName: v.optional(v.string()),
        imageId: v.optional(v.string()),
        approvalStatus: v.optional(
            v.union(
                v.literal("pending"),
                v.literal("approved"),
                v.literal("rejected")
            )
        ),
        targetUserId: v.optional(v.id("users")), // For client approval
        approverId: v.optional(v.id("users")),
        approvedByName: v.optional(v.string()),
        approvedAt: v.optional(v.number()),
        createdAt: v.optional(v.number()),
        type: v.optional(v.string()), // e.g., 'manual'
    }).index("by_org", ["organizationId"])
        .index("by_empId", ["empId"])
        .index("by_date", ["date"])
        .index("by_region", ["region"])
        .index("by_empId_date", ["empId", "date"])
        .index("by_site", ["siteId"])
        .index("by_org_date", ["organizationId", "date"]),

    notifications: defineTable({
        organizationId: v.id("organizations"),
        type: v.union(v.literal("new_user"), v.literal("issue")),
        title: v.string(),
        message: v.string(),
        isRead: v.boolean(),
        createdAt: v.number(),
        referenceId: v.optional(v.union(v.id("users"), v.id("issues"), v.id("incidents"))),
    }).index("by_org", ["organizationId"])
        .index("by_org_read", ["organizationId", "isRead"])
        .index("by_type", ["type"]),
});