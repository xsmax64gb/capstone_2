import Payment from "../models/payment.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MIN_RANGE_DAYS = 1;
const MAX_RANGE_DAYS = 365;
const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toIsoDate = (value) => {
    if (!value) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString();
};

const getFormatterParts = (date, timezone) => {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    });

    return formatter.formatToParts(date).reduce((accumulator, part) => {
        if (part.type !== "literal") {
            accumulator[part.type] = part.value;
        }

        return accumulator;
    }, {});
};

const formatDateKeyInTimezone = (date, timezone) => {
    const parts = getFormatterParts(date, timezone);
    return `${parts.year}-${parts.month}-${parts.day}`;
};

const toUtcDateFromDateKey = (dateKey) => {
    const [year, month, day] = dateKey.split("-").map((value) => Number(value));
    return new Date(Date.UTC(year, month - 1, day));
};

const addDaysToDateKey = (dateKey, days) => {
    const nextDate = toUtcDateFromDateKey(dateKey);
    nextDate.setUTCDate(nextDate.getUTCDate() + days);
    return nextDate.toISOString().slice(0, 10);
};

const getTimezoneOffsetMs = (date, timezone) => {
    const parts = getFormatterParts(date, timezone);
    const utcTimestamp = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second)
    );

    return utcTimestamp - date.getTime();
};

const getUtcStartOfDateKey = (dateKey, timezone) => {
    const [year, month, day] = dateKey.split("-").map((value) => Number(value));
    const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    return new Date(utcGuess.getTime() - getTimezoneOffsetMs(utcGuess, timezone));
};

const getUtcEndOfDateKey = (dateKey, timezone) =>
    new Date(getUtcStartOfDateKey(addDaysToDateKey(dateKey, 1), timezone).getTime() - 1);

const normalizeDateInputToKey = (value, timezone) => {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        return null;
    }

    if (DATE_KEY_PATTERN.test(normalized)) {
        return normalized;
    }

    const parsedDate = new Date(normalized);
    if (Number.isNaN(parsedDate.getTime())) {
        return null;
    }

    return formatDateKeyInTimezone(parsedDate, timezone);
};

const formatChartLabelFromDateKey = (dateKey) => {
    const [, month, day] = dateKey.split("-");
    return `${day}-${month}`;
};

const sanitizeRangeDays = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_RANGE_DAYS;
    }

    const rounded = Math.floor(parsed);
    return Math.max(MIN_RANGE_DAYS, Math.min(MAX_RANGE_DAYS, rounded));
};

const resolveDateRange = (filters = {}) => {
    const timezone = process.env.REVENUE_TIMEZONE || DEFAULT_TIMEZONE;
    const fromDateKey = normalizeDateInputToKey(filters.from ?? filters.startDate, timezone);
    const toDateKey = normalizeDateInputToKey(filters.to ?? filters.endDate, timezone);

    if (fromDateKey && toDateKey && fromDateKey <= toDateKey) {
        const from = getUtcStartOfDateKey(fromDateKey, timezone);
        const to = getUtcEndOfDateKey(toDateKey, timezone);

        return {
            from,
            to,
            fromDateKey,
            toDateKey,
            label: "custom",
            rangeDays: Math.max(1, Math.ceil((to.getTime() - from.getTime() + 1) / DAY_MS)),
            timezone,
        };
    }

    const rangeToken = String(filters.range ?? "").trim();
    const matchedRange = /^(\d{1,3})d$/i.exec(rangeToken);
    const rangeDays = matchedRange
        ? sanitizeRangeDays(Number(matchedRange[1]))
        : sanitizeRangeDays(filters.rangeDays);

    const toDateKeyResolved = formatDateKeyInTimezone(new Date(), timezone);
    const fromDateKeyResolved = addDaysToDateKey(toDateKeyResolved, -(rangeDays - 1));
    const from = getUtcStartOfDateKey(fromDateKeyResolved, timezone);
    const to = getUtcEndOfDateKey(toDateKeyResolved, timezone);

    return {
        from,
        to,
        fromDateKey: fromDateKeyResolved,
        toDateKey: toDateKeyResolved,
        label: `${rangeDays}d`,
        rangeDays,
        timezone,
    };
};

const getRevenueOverview = async (filters = {}) => {
    const range = resolveDateRange(filters);

    const [systemResult, rangeResult, pendingTransactions, failedTransactions] =
        await Promise.all([
            Payment.aggregate([
                { $match: { status: "paid" } },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$amount" },
                        paidTransactions: { $sum: 1 },
                        latestPaidAt: { $max: "$paidAt" },
                    },
                },
            ]),
            Payment.aggregate([
                {
                    $match: {
                        status: "paid",
                        paidAt: {
                            $gte: range.from,
                            $lte: range.to,
                        },
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$amount" },
                        paidTransactions: { $sum: 1 },
                        latestPaidAt: { $max: "$paidAt" },
                    },
                },
            ]),
            Payment.countDocuments({
                status: "pending",
                createdAt: {
                    $gte: range.from,
                    $lte: range.to,
                },
            }),
            Payment.countDocuments({
                status: "failed",
                createdAt: {
                    $gte: range.from,
                    $lte: range.to,
                },
            }),
        ]);

    const systemSummary = systemResult[0] ?? {};
    const rangeSummary = rangeResult[0] ?? {};

    const systemRevenue = Number(systemSummary.totalRevenue ?? 0);
    const systemPaidTransactions = Number(systemSummary.paidTransactions ?? 0);

    const revenueInRange = Number(rangeSummary.totalRevenue ?? 0);
    const paidTransactions = Number(rangeSummary.paidTransactions ?? 0);

    const considered = paidTransactions + pendingTransactions + failedTransactions;
    const successRate = considered > 0 ? (paidTransactions / considered) * 100 : 0;
    const averageTicket = paidTransactions > 0 ? revenueInRange / paidTransactions : 0;

    return {
        range: {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            label: range.label,
            rangeDays: range.rangeDays,
        },
        summary: {
            systemRevenue,
            systemPaidTransactions,
            revenueInRange,
            paidTransactions,
            pendingTransactions,
            failedTransactions,
            successRate,
            averageTicket,
            latestPaidAt: toIsoDate(rangeSummary.latestPaidAt ?? systemSummary.latestPaidAt),
            currency: "VND",
        },
    };
};

const getRevenueChartData = async (filters = {}) => {
    const range = resolveDateRange(filters);
    const timezone = range.timezone;

    const grouped = await Payment.aggregate([
        {
            $match: {
                status: "paid",
                paidAt: {
                    $gte: range.from,
                    $lte: range.to,
                },
            },
        },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$paidAt",
                        timezone,
                    },
                },
                revenue: { $sum: "$amount" },
                paidTransactions: { $sum: 1 },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    const groupedMap = new Map(
        grouped.map((item) => [
            item._id,
            {
                revenue: Number(item.revenue ?? 0),
                paidTransactions: Number(item.paidTransactions ?? 0),
            },
        ])
    );

    const points = [];
    let totalRevenue = 0;
    let totalPaidTransactions = 0;

    for (
        let dateKey = range.fromDateKey;
        dateKey <= range.toDateKey;
        dateKey = addDaysToDateKey(dateKey, 1)
    ) {
        const groupedPoint = groupedMap.get(dateKey);

        const revenue = groupedPoint?.revenue ?? 0;
        const paidTransactions = groupedPoint?.paidTransactions ?? 0;

        totalRevenue += revenue;
        totalPaidTransactions += paidTransactions;

        points.push({
            date: dateKey,
            label: formatChartLabelFromDateKey(dateKey),
            revenue,
            paidTransactions,
        });
    }

    return {
        range: {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            label: range.label,
            rangeDays: range.rangeDays,
        },
        timezone,
        points,
        totals: {
            revenue: totalRevenue,
            paidTransactions: totalPaidTransactions,
            currency: "VND",
        },
    };
};

const mapBreakdownRow = (row, fallbackKey = "unknown") => ({
    key: String(row?._id ?? fallbackKey),
    count: Number(row?.count ?? 0),
    amount: Number(row?.amount ?? 0),
});

const getRevenueStatistics = async (filters = {}) => {
    const range = resolveDateRange(filters);
    const matchByCreatedAt = {
        createdAt: {
            $gte: range.from,
            $lte: range.to,
        },
    };

    const [statusRows, methodRows, pricingRows, recentPaid] = await Promise.all([
        Payment.aggregate([
            { $match: matchByCreatedAt },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    amount: { $sum: "$amount" },
                },
            },
            { $sort: { count: -1 } },
        ]),
        Payment.aggregate([
            { $match: matchByCreatedAt },
            {
                $group: {
                    _id: "$paymentMethod",
                    count: { $sum: 1 },
                    amount: { $sum: "$amount" },
                },
            },
            { $sort: { count: -1 } },
        ]),
        Payment.aggregate([
            { $match: matchByCreatedAt },
            {
                $group: {
                    _id: { $ifNull: ["$pricingKey", "default"] },
                    count: { $sum: 1 },
                    amount: { $sum: "$amount" },
                },
            },
            { $sort: { count: -1 } },
        ]),
        Payment.find({
            status: "paid",
            paidAt: {
                $gte: range.from,
                $lte: range.to,
            },
        })
            .sort({ paidAt: -1 })
            .limit(10)
            .select(
                "invoiceNumber amount currency paymentMethod pricingKey externalRef paidAt xgateReference"
            )
            .lean(),
    ]);

    const statusBreakdown = statusRows.map((row) => mapBreakdownRow(row, "unknown"));
    const methodBreakdown = methodRows.map((row) => mapBreakdownRow(row, "unknown"));
    const pricingBreakdown = pricingRows.map((row) => mapBreakdownRow(row, "default"));

    const totalTransactions = statusBreakdown.reduce(
        (sum, item) => sum + item.count,
        0
    );

    return {
        range: {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            label: range.label,
            rangeDays: range.rangeDays,
        },
        totals: {
            transactions: totalTransactions,
            currency: "VND",
        },
        breakdowns: {
            status: statusBreakdown,
            paymentMethod: methodBreakdown,
            pricing: pricingBreakdown,
        },
        recentPaid: recentPaid.map((item) => ({
            invoiceNumber: item.invoiceNumber,
            amount: Number(item.amount ?? 0),
            currency: item.currency,
            paymentMethod: item.paymentMethod,
            pricingKey: item.pricingKey,
            externalRef: item.externalRef,
            xgateReference: item.xgateReference,
            paidAt: toIsoDate(item.paidAt),
        })),
    };
};

export {
    getRevenueChartData,
    getRevenueOverview,
    getRevenueStatistics,
    resolveDateRange,
};
