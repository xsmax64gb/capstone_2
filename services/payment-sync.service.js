import {
    expireOverduePendingPayments,
    getPaymentByInvoice,
    listPendingPayments,
    markPaymentPaidByInvoice,
} from "./payment.service.js";
import { fetchXGateTransactions } from "./xgate.service.js";

const RATE_WINDOW_MS = 60 * 1000;
const XGATE_RATE_LIMIT_PER_MINUTE = 5;

const syncRequestTimestamps = [];
const focusSyncRequestTimestamps = [];

const pad2 = (value) => String(value).padStart(2, "0");

const toYmd = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const pruneFocusRateWindow = () => {
    const now = Date.now();
    while (focusSyncRequestTimestamps.length > 0) {
        if (now - focusSyncRequestTimestamps[0] <= RATE_WINDOW_MS) {
            break;
        }

        focusSyncRequestTimestamps.shift();
    }
};

const resolveFocusRateLimitPerMinute = () =>
    sanitizePositiveInt(process.env.XGATE_FOCUS_RATE_LIMIT_PER_MINUTE, 30, 5, 120);

const canSendFocusXGateRequest = () => {
    pruneFocusRateWindow();
    return focusSyncRequestTimestamps.length < resolveFocusRateLimitPerMinute();
};

const registerFocusXGateRequest = () => {
    focusSyncRequestTimestamps.push(Date.now());
};

const transactionAmountMatches = (transaction, expectedAmount) => {
    const expected = Number(expectedAmount);
    if (!Number.isFinite(expected)) {
        return false;
    }

    const amount = Number(transaction?.amount);
    if (!Number.isFinite(amount)) {
        return false;
    }

    return Math.abs(amount - expected) < 1;
};

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

const buildTransactionMatchCandidates = (transaction) => {
    const candidates = [
        transaction?.content,
        transaction?.referenceCode,
        transaction?.id,
        transaction?.raw?.content,
        transaction?.raw?.description,
        transaction?.raw?.transferContent,
        transaction?.raw?.transfer_content,
        transaction?.raw?.remark,
        transaction?.raw?.note,
        transaction?.raw?.referenceCode,
        transaction?.raw?.reference_code,
        transaction?.raw?.reference,
        transaction?.raw?.ref,
        transaction?.raw?.code,
        transaction?.raw?.transactionRef,
    ];

    const uniqueCandidates = [];
    const seen = new Set();

    for (const candidate of candidates) {
        if (typeof candidate !== "string" || candidate.trim().length === 0) {
            continue;
        }

        const normalized = sanitizeTextForMatch(candidate);
        if (!normalized || seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        uniqueCandidates.push({
            raw: candidate,
            normalized,
        });
    }

    return uniqueCandidates;
};

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

const runPaymentSyncForInvoice = async ({
    invoiceNumber,
    source = "user_reconcile",
} = {}) => {
    const startedAt = new Date();
    const normalizedInvoice = normalizeTrimmedString(invoiceNumber);

    await expireOverduePendingPayments();

    if (!normalizedInvoice) {
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
            status: "skipped",
            message: "invoiceNumber is required",
        };
    }

    const payment = await getPaymentByInvoice(normalizedInvoice);
    if (!payment || payment.status !== "pending") {
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
            message: "No pending payment for this invoice",
        };
    }

    if (!canSendFocusXGateRequest()) {
        return {
            source,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            pendingChecked: 1,
            matchedPayments: 0,
            updatedPayments: 0,
            xgateRequests: 0,
            xgateTransactions: 0,
            skippedByRateLimit: true,
            status: "completed",
            message: "Skipped invoice sync due to XGate focus rate limit window",
        };
    }

    const token = sanitizeInvoiceToken(payment.invoiceNumber);
    if (!token || token.length < 3) {
        return {
            source,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            pendingChecked: 1,
            matchedPayments: 0,
            updatedPayments: 0,
            xgateRequests: 0,
            xgateTransactions: 0,
            skippedByRateLimit: false,
            status: "completed",
            message: "Invoice number could not be normalized for matching",
        };
    }

    const account = normalizeTrimmedString(process.env.XGATE_ACCOUNT);
    const bank = normalizeTrimmedString(process.env.XGATE_BANK);
    const pageLimit = sanitizePositiveInt(process.env.XGATE_PAGE_LIMIT, 50, 1, 50);
    const createdAt = payment.createdAt ? new Date(payment.createdAt) : new Date();
    const dateFromBase = new Date(createdAt);
    dateFromBase.setDate(dateFromBase.getDate() - 1);
    const dateFrom = toYmd(dateFromBase);
    const dateTo = toYmd(new Date());

    const baseFilters = {
        page: 1,
        limit: pageLimit,
        type: resolveFetchType(),
        account,
        bank,
        amountMin: payment.amount,
        amountMax: payment.amount,
        dateFrom,
        dateTo,
        sort: "date_desc",
    };

    const tryMatchTransaction = (transaction) => {
        if (!transactionAmountMatches(transaction, payment.amount)) {
            return null;
        }

        const matchCandidates = buildTransactionMatchCandidates(transaction);
        const matchedCandidate = matchCandidates.find((candidate) =>
            candidate.normalized.includes(token)
        );

        if (!matchedCandidate) {
            return null;
        }

        return {
            transaction,
            matchedValue: matchedCandidate.raw,
        };
    };

    let xgateRequests = 0;
    let transactions = [];

    try {
        registerFocusXGateRequest();
        xgateRequests += 1;

        const first = await fetchXGateTransactions({
            ...baseFilters,
            content: payment.invoiceNumber,
        });

        transactions = [...first.transactions];

        if (transactions.length === 0 && canSendFocusXGateRequest()) {
            registerFocusXGateRequest();
            xgateRequests += 1;

            const second = await fetchXGateTransactions(baseFilters);
            transactions = [...second.transactions];
        }
    } catch (error) {
        return {
            source,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            pendingChecked: 1,
            matchedPayments: 0,
            updatedPayments: 0,
            xgateRequests,
            xgateTransactions: 0,
            skippedByRateLimit: false,
            status: "error",
            message: error.message || "XGate invoice sync failed",
        };
    }

    let match = null;
    for (const transaction of transactions) {
        match = tryMatchTransaction(transaction);
        if (match) {
            break;
        }
    }

    let updatedPayments = 0;
    if (match) {
        updatedPayments = await markPaymentPaidByInvoice({
            invoiceNumber: payment.invoiceNumber,
            xgateReference: match.transaction.referenceCode || match.transaction.id,
            matchedContent: match.matchedValue,
            transactionDate: match.transaction.transactionDate,
        });
    }

    const message =
        updatedPayments > 0
            ? "Payment matched and marked as paid"
            : "No matching XGate transaction for this invoice yet";

    return {
        source,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        pendingChecked: 1,
        matchedPayments: updatedPayments > 0 ? 1 : 0,
        updatedPayments,
        xgateRequests,
        xgateTransactions: transactions.length,
        skippedByRateLimit: false,
        status: "completed",
        message,
    };
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
        const matchCandidates = buildTransactionMatchCandidates(transaction);
        if (matchCandidates.length === 0) {
            continue;
        }

        for (const [token, payment] of pendingByToken.entries()) {
            if (matchedByInvoice.has(payment.invoiceNumber)) {
                continue;
            }

            const matchedCandidate = matchCandidates.find((candidate) =>
                candidate.normalized.includes(token)
            );

            if (matchedCandidate) {
                matchedByInvoice.set(payment.invoiceNumber, {
                    payment,
                    transaction,
                    matchedValue: matchedCandidate.raw,
                });
            }
        }
    }

    let updatedPayments = 0;
    for (const [invoiceNumber, match] of matchedByInvoice.entries()) {
        const affected = await markPaymentPaidByInvoice({
            invoiceNumber,
            xgateReference: match.transaction.referenceCode || match.transaction.id,
            matchedContent: match.matchedValue,
            transactionDate: match.transaction.transactionDate,
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
    runPaymentSyncForInvoice,
    sanitizeInvoiceToken,
    sanitizeTextForMatch,
};
