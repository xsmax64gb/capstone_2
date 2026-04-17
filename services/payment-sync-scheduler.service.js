import { runPaymentSync } from "./payment-sync.service.js";

const SCHEDULER_STARTED_KEY = "__paymentSyncSchedulerStarted";
const SCHEDULER_TIMER_KEY = "__paymentSyncSchedulerTimer";

const normalizeTrimmedString = (value) => String(value ?? "").trim();

const sanitizePositiveInt = (value, fallback, min = 1000, max = 86400000) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const resolveSchedulerIntervalMs = () =>
    sanitizePositiveInt(process.env.XGATE_SYNC_INTERVAL_MS, 300000, 60000, 86400000);

const isSchedulerEnabled = () =>
    normalizeTrimmedString(process.env.XGATE_SYNC_ENABLED).toLowerCase() === "true";

const bootstrapPaymentSyncScheduler = () => {
    if (!isSchedulerEnabled()) {
        return false;
    }

    if (globalThis[SCHEDULER_STARTED_KEY]) {
        return false;
    }

    const intervalMs = resolveSchedulerIntervalMs();
    const executeSync = async () => {
        try {
            await runPaymentSync({ source: "scheduler" });
        } catch (error) {
            console.error("[PaymentSyncScheduler] Sync run failed", error);
        }
    };

    globalThis[SCHEDULER_STARTED_KEY] = true;
    globalThis[SCHEDULER_TIMER_KEY] = setInterval(executeSync, intervalMs);

    void executeSync();
    return true;
};

export { bootstrapPaymentSyncScheduler };
