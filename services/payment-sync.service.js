import {
    expireOverduePendingPayments,
    listPendingPayments,
    markPaymentPaidByInvoice,
} from "./payment.service.js";
import { fetchXGateTransactions } from "./xgate.service.js";

const RATE_WINDOW_MS = 60 * 1000;
const XGATE_RATE_LIMIT_PER_MINUTE = 5;

const syncRequestTimestamps = [];

const normalizeTrimmedString = (value) => String(value ?? "").trim();

const sanitizePositiveInt = (value, fallback, min = 1, max = 200) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const sanitizeInvoiceToken = (value) =>
    normalizeTrimmedString(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

const sanitizeTextForMatch = (value) =>
    String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const pruneRateWindow = () => {
    const now = Date.now();
    while (syncRequestTimestamps.length > 0) {
        if (now - syncRequestTimestamps[0] <= RATE_WINDOW_MS) {
            break;
        }

        syncRequestTimestamps.shift();
    }
};

const canSendXGateRequest = () => {
    pruneRateWindow();
    return syncRequestTimestamps.length < XGATE_RATE_LIMIT_PER_MINUTE;
};

const registerXGateRequest = () => {
    syncRequestTimestamps.push(Date.now());
};

const resolveMaxRequests = (maxRequests) => {
    const envValue = sanitizePositiveInt(process.env.XGATE_MAX_REQUESTS_PER_RUN, 1, 1, 5);
    return sanitizePositiveInt(maxRequests, envValue, 1, 5);
};

const resolveFetchType = () => {
    const normalized = normalizeTrimmedString(process.env.XGATE_TYPE).toLowerCase();
    return normalized === "out" ? "out" : "in";
};

const runPaymentSync = async ({
    source = "manual",
    maxRequests,
} = {}) => {
    const startedAt = new Date();

    await expireOverduePendingPayments();

    const pendingPayments = await listPendingPayments(300);
    if (pendingPayments.length === 0) {
        return {
            source,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            pendingChecked: 0,
            matchedPayments: 0,
            updatedPayments: 0,
            xgateRequests: 0,
            xgateTransactions: 0,
            skippedByRateLimit: false,
            status: "completed",
            message: "No pending payments to process",
        };
    }

    const pendingByToken = new Map();
    for (const payment of pendingPayments) {
        const token = sanitizeInvoiceToken(payment.invoiceNumber);
        if (token) {
            pendingByToken.set(token, payment);
        }
    }

    if (pendingByToken.size === 0) {
        return {
            source,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            pendingChecked: pendingPayments.length,
            matchedPayments: 0,
            updatedPayments: 0,
            xgateRequests: 0,
            xgateTransactions: 0,
            skippedByRateLimit: false,
            status: "completed",
            message: "No valid invoice token found for pending payments",
        };
    }

    const requestLimit = resolveMaxRequests(maxRequests);
    const pageLimit = sanitizePositiveInt(process.env.XGATE_PAGE_LIMIT, 50, 1, 50);
    const account = normalizeTrimmedString(process.env.XGATE_ACCOUNT);

    const transactions = [];
    let xgateRequests = 0;
    let skippedByRateLimit = false;

    for (let page = 1; page <= requestLimit; page += 1) {
        if (!canSendXGateRequest()) {
            skippedByRateLimit = true;
            break;
        }

        registerXGateRequest();
        xgateRequests += 1;

        const response = await fetchXGateTransactions({
            page,
            limit: pageLimit,
            type: resolveFetchType(),
            account,
            sort: "date_desc",
        });

        transactions.push(...response.transactions);
    }

    const matchedByInvoice = new Map();
    for (const transaction of transactions) {
        const normalizedContent = sanitizeTextForMatch(transaction.content);
        if (!normalizedContent) {
            continue;
        }

        for (const [token, payment] of pendingByToken.entries()) {
            if (matchedByInvoice.has(payment.invoiceNumber)) {
                continue;
            }

            if (normalizedContent.includes(token)) {
                matchedByInvoice.set(payment.invoiceNumber, {
                    payment,
                    transaction,
                });
            }
        }
    }

    let updatedPayments = 0;
    for (const [invoiceNumber, match] of matchedByInvoice.entries()) {
        const affected = await markPaymentPaidByInvoice({
            invoiceNumber,
            xgateReference: match.transaction.referenceCode || match.transaction.id,
            matchedContent: match.transaction.content,
        });

        updatedPayments += affected;
    }

    const message =
        skippedByRateLimit && xgateRequests === 0
            ? "Skipped sync because XGate rate limit window is full"
            : skippedByRateLimit
                ? "Sync completed with partial data due to XGate rate limit"
                : updatedPayments > 0
                    ? `Updated ${updatedPayments} payment(s) to paid status`
                    : "Sync completed without matched pending payments";

    return {
        source,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        pendingChecked: pendingPayments.length,
        matchedPayments: matchedByInvoice.size,
        updatedPayments,
        xgateRequests,
        xgateTransactions: transactions.length,
        skippedByRateLimit,
        status: "completed",
        message,
    };
};

export {
    RATE_WINDOW_MS,
    XGATE_RATE_LIMIT_PER_MINUTE,
    runPaymentSync,
    sanitizeInvoiceToken,
    sanitizeTextForMatch,
};
