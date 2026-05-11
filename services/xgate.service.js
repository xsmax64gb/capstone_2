const DEFAULT_XGATE_TRANSACTIONS_URL = "https://xgate.vn/api/v1/transactions";

const normalizeString = (value) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : "";
};

const sanitizePositiveInt = (value, fallback, min = 1, max = 500) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const resolveTransactionsUrl = () => {
    const configuredApiUrl = normalizeString(process.env.XGATE_API_URL);
    const configuredEndpoint = normalizeString(process.env.XGATE_TRANSACTIONS_ENDPOINT);

    if (configuredApiUrl) {
        if (/\/transactions\/?$/i.test(configuredApiUrl)) {
            return configuredApiUrl;
        }

        if (configuredEndpoint) {
            const endpoint = configuredEndpoint.startsWith("/")
                ? configuredEndpoint
                : `/${configuredEndpoint}`;
            return `${configuredApiUrl.replace(/\/$/, "")}${endpoint}`;
        }

        if (/\/api\/v1\/?$/i.test(configuredApiUrl)) {
            return `${configuredApiUrl.replace(/\/$/, "")}/transactions`;
        }

        return configuredApiUrl;
    }

    if (configuredEndpoint) {
        const endpoint = configuredEndpoint.startsWith("/")
            ? configuredEndpoint
            : `/${configuredEndpoint}`;
        const host = DEFAULT_XGATE_TRANSACTIONS_URL.replace(/\/transactions\/?$/i, "");
        return `${host}${endpoint}`;
    }

    return DEFAULT_XGATE_TRANSACTIONS_URL;
};

const pickString = (object, candidates, fallback = "") => {
    if (!object || typeof object !== "object") {
        return fallback;
    }

    for (const key of candidates) {
        const current = object[key];
        if (typeof current === "string" && current.trim().length > 0) {
            return current.trim();
        }
    }

    return fallback;
};

const toNumber = (value, fallback = 0) => {
    const normalized = (() => {
        if (typeof value !== "string") {
            return value;
        }

        const numericText = value.trim().replace(/[^\d,.-]/g, "");
        const lastDot = numericText.lastIndexOf(".");
        const lastComma = numericText.lastIndexOf(",");
        const separatorIndex = Math.max(lastDot, lastComma);

        if (separatorIndex < 0) {
            return numericText;
        }

        const decimalLength = numericText.length - separatorIndex - 1;
        if (decimalLength > 0 && decimalLength < 3) {
            const whole = numericText.slice(0, separatorIndex).replace(/[.,]/g, "");
            const decimal = numericText.slice(separatorIndex + 1).replace(/[.,]/g, "");
            return `${whole}.${decimal}`;
        }

        return numericText.replace(/[.,]/g, "");
    })();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const looksLikeTransaction = (payload) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return false;
    }

    return [
        "amount",
        "transactionId",
        "transaction_id",
        "transferContent",
        "transfer_content",
        "content",
        "description",
        "referenceCode",
        "reference_code",
        "transactionDate",
        "transaction_date",
    ].some((key) => payload[key] !== undefined && payload[key] !== null);
};

const extractTransactions = (payload) => {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (!payload || typeof payload !== "object") {
        return [];
    }

    const candidates = [
        payload.data,
        payload.transactions,
        payload.items,
        payload.results,
        payload.result,
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            return candidate;
        }

        if (candidate && typeof candidate === "object") {
            const nested =
                candidate.transactions ||
                candidate.items ||
                candidate.results ||
                candidate.data;

            if (Array.isArray(nested)) {
                return nested;
            }

            if (looksLikeTransaction(candidate)) {
                return [candidate];
            }
        }
    }

    if (looksLikeTransaction(payload)) {
        return [payload];
    }

    return [];
};

const pickNumber = (object, candidates, fallback = 0) => {
    if (!object || typeof object !== "object") {
        return fallback;
    }

    for (const key of candidates) {
        const current = object[key];
        const parsed = toNumber(current, Number.NaN);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return fallback;
};

const normalizeTransaction = (transaction, index = 0) => {
    const id =
        pickString(transaction, [
            "id",
            "transactionId",
            "transaction_id",
            "txId",
            "tx_id",
            "reference",
            "reference_code",
        ])
        || `xgate-${index}`;

    const content = pickString(transaction, [
        "content",
        "description",
        "transferContent",
        "transfer_content",
        "remark",
        "note",
    ]);

    const referenceCode = pickString(transaction, [
        "referenceCode",
        "reference_code",
        "reference",
        "ref",
        "code",
        "transactionRef",
    ]);

    const transactionDate = pickString(transaction, [
        "transactionDate",
        "transaction_date",
        "date",
        "createdAt",
        "created_at",
        "createdDate",
        "created_date",
        "datetime",
        "time",
    ]);

    return {
        id,
        content,
        amount: pickNumber(transaction, [
            "amount",
            "transferAmount",
            "transfer_amount",
            "transactionAmount",
            "transaction_amount",
            "creditAmount",
            "credit_amount",
            "value",
            "money",
        ]),
        referenceCode,
        transactionDate,
        raw: transaction,
    };
};

const fetchXGateTransactions = async (filters = {}) => {
    const apiKey = normalizeString(process.env.XGATE_API_KEY);
    if (!apiKey) {
        throw new Error("XGATE_API_KEY is not configured");
    }

    const limit = sanitizePositiveInt(filters.limit, 50, 1, 50);
    const page = sanitizePositiveInt(filters.page, 1, 1, 1000);

    let url;
    try {
        url = new URL(resolveTransactionsUrl());
    } catch (_error) {
        throw new Error("Invalid XGATE_API_URL configuration");
    }

    const queryEntries = {
        page,
        limit,
        account: normalizeString(filters.account),
        sender_account: normalizeString(filters.senderAccount || filters.sender_account),
        receiver_account: normalizeString(filters.receiverAccount || filters.receiver_account),
        type: normalizeString(filters.type),
        bank: normalizeString(filters.bank),
        reference_code: normalizeString(filters.referenceCode || filters.reference_code),
        name: normalizeString(filters.name),
        date_from: normalizeString(filters.dateFrom || filters.date_from),
        date_to: normalizeString(filters.dateTo || filters.date_to),
        amount_min: normalizeString(filters.amountMin ?? filters.amount_min),
        amount_max: normalizeString(filters.amountMax ?? filters.amount_max),
        content: normalizeString(filters.content),
        sort: normalizeString(filters.sort),
    };

    Object.entries(queryEntries).forEach(([key, value]) => {
        if (value !== "" && value !== undefined && value !== null) {
            url.searchParams.set(key, `${value}`);
        }
    });

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "X-API-Key": apiKey,
            Accept: "application/json",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        let errorMessage = "";
        try {
            const errorPayload = await response.json();
            errorMessage =
                pickString(errorPayload, ["message", "error"]) ||
                pickString(errorPayload?.data, ["message", "error"]);
        } catch (_error) {
            errorMessage = "";
        }

        throw new Error(
            `XGate request failed with status ${response.status}${errorMessage ? `: ${errorMessage}` : ""
            }`
        );
    }

    const payload = await response.json();
    const transactions = extractTransactions(payload).map(normalizeTransaction);

    return {
        transactions,
        raw: payload,
    };
};

export { extractTransactions, fetchXGateTransactions, normalizeTransaction };
