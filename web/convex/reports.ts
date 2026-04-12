import { internalAction, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const getDailySummary = internalQuery({
    args: {},
    handler: async (ctx) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayMs = today.getTime();

        const patrolLogs = await ctx.db
            .query("patrolLogs")
            .filter((q) => q.gte(q.field("createdAt"), todayMs))
            .collect();

        const visitLogs = await ctx.db
            .query("visitLogs")
            .filter((q) => q.gte(q.field("createdAt"), todayMs))
            .collect();

        // Get organization names for context
        const orgs = await ctx.db.query("organizations").collect();

        // Group by organization
        const summaryByOrg = orgs.map(org => {
            const orgPatrols = patrolLogs.filter(l => l.organizationId === org._id).length;
            const orgVisits = visitLogs.filter(l => l.organizationId === org._id).length;

            return {
                name: org.name,
                patrols: orgPatrols,
                visits: orgVisits
            };
        }).filter(s => s.patrols > 0 || s.visits > 0);

        return {
            date: today.toDateString(),
            totalPatrols: patrolLogs.length,
            totalVisits: visitLogs.length,
            breakdown: summaryByOrg
        };
    }
});

export const sendDailyEmailReport = internalAction({
    args: {
        testEmail: v.optional(v.string()),
        force: v.optional(v.boolean())
    },
    handler: async (ctx, args) => {
        // @ts-ignore
        const brevoApiKey = process.env.BREVO_API_KEY;
        if (!brevoApiKey) {
            console.error("BREVO_API_KEY is not set in environment variables");
            return;
        }

        const stats = await ctx.runQuery(internal.reports.getDailySummary);

        if (!args.force && stats.totalPatrols === 0 && stats.totalVisits === 0) {
            console.log("No activity today, skipping report.");
            return;
        }

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">Daily Security Summary</h2>
                <p style="color: #64748b; font-size: 14px;">Report for ${stats.date}</p>
                
                <div style="display: flex; justify-content: space-between; gap: 10px; margin: 20px 0;">
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; flex: 1;">
                        <div style="font-size: 24px; font-weight: bold; color: #2563eb;">${stats.totalPatrols}</div>
                        <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Total Patrols</div>
                    </div>
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; flex: 1;">
                        <div style="font-size: 24px; font-weight: bold; color: #10b981;">${stats.totalVisits}</div>
                        <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Total Visits</div>
                    </div>
                </div>

                <h3 style="color: #1e293b; margin-top: 30px;">Organization Breakdown</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background: #f1f5f9;">
                            <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 12px;">Organization</th>
                            <th style="padding: 10px; text-align: center; border-bottom: 1px solid #e2e8f0; font-size: 12px;">Patrols</th>
                            <th style="padding: 10px; text-align: center; border-bottom: 1px solid #e2e8f0; font-size: 12px;">Visits</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.breakdown.map(org => `
                            <tr>
                                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 14px;">${org.name}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: center; font-size: 14px;">${org.patrols}</td>
                                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: center; font-size: 14px;">${org.visits}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
                    This is an automated report from the Security OS Management System.
                </div>
            </div>
        `;

        try {
            const response = await fetch("https://api.brevo.com/v3/smtp/email", {
                method: "POST",
                headers: {
                    "accept": "application/json",
                    "content-type": "application/json",
                    "api-key": brevoApiKey,
                },
                body: JSON.stringify({
                    sender: { name: "Security OS Reports", email: "kalaburagitech@gmail.com" },
                    to: [{ email: args.testEmail || "kalaburagitech@gmail.com" }],
                    subject: `Daily Security Report - ${stats.date}`,
                    htmlContent: html,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Brevo API error: ${error}`);
            }

            console.log("Daily report sent successfully via Brevo to kalaburagitech@gmail.com");
        } catch (error) {
            console.error("Failed to send daily report via Brevo:", error);
        }
    }
});

// Test mutation to trigger the report manually
export const sendTestReport = mutation({
    args: {
        email: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        // Schedule the internal action to run immediately with force flag
        await ctx.scheduler.runAfter(0, internal.reports.sendDailyEmailReport, {
            testEmail: args.email,
            force: true
        });
        return { success: true, message: `Report triggered for ${args.email || 'default recipient'}. Check logs in Convex dashboard.` };
    }
});
