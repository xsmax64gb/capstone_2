import Payment from "../models/payment.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MIN_RANGE_DAYS = 1;
const MAX_RANGE_DAYS = 365;
const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

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

const parseDate = (value) => {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
};

const startOfDay = (date) => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
};

const endOfDay = (date) => {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
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
    const fromInput = parseDate(filters.from ?? filters.startDate);
    const toInput = parseDate(filters.to ?? filters.endDate);

    if (fromInput && toInput && fromInput.getTime() <= toInput.getTime()) {
        const from = startOfDay(fromInput);
        const to = endOfDay(toInput);

        return {
            from,
            to,
            label: "custom",
            rangeDays: Math.max(1, Math.ceil((to.getTime() - from.getTime() + 1) / DAY_MS)),
        };
    }

    const rangeToken = String(filters.range ?? "").trim();
    const matchedRange = /^(\d{1,3})d$/i.exec(rangeToken);
    const rangeDays = matchedRange
        ? sanitizeRangeDays(Number(matchedRange[1]))
        : sanitizeRangeDays(filters.rangeDays);

    const now = new Date();
    const to = endOfDay(now);
    const from = startOfDay(new Date(to.getTime() - (rangeDays - 1) * DAY_MS));

    return {
        from,
        to,
        label: `${rangeDays}d`,
        rangeDays,
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
    const timezone = process.env.REVENUE_TIMEZONE || DEFAULT_TIMEZONE;

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

    const keyFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });

    const labelFormatter = new Intl.DateTimeFormat("vi-VN", {
        timeZone: timezone,
        month: "2-digit",
        day: "2-digit",
    });

    const points = [];
    let totalRevenue = 0;
    let totalPaidTransactions = 0;

    for (
        let cursor = new Date(range.from);
        cursor.getTime() <= range.to.getTime();
        cursor = new Date(cursor.getTime() + DAY_MS)
    ) {
        const dateKey = keyFormatter.format(cursor);
        const groupedPoint = groupedMap.get(dateKey);

        const revenue = groupedPoint?.revenue ?? 0;
        const paidTransactions = groupedPoint?.paidTransactions ?? 0;

        totalRevenue += revenue;
        totalPaidTransactions += paidTransactions;

        points.push({
            date: dateKey,
            label: labelFormatter.format(cursor),
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
