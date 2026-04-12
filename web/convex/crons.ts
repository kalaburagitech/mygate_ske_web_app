import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Send daily report at 23:59 IST (which is 18:29 UTC)
crons.daily(
    "send-daily-report",
    { hourUTC: 18, minuteUTC: 29 },
    internal.reports.sendDailyEmailReport,
    {}
);

export default crons;
