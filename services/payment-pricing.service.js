import PaymentPricing from "../models/payment-pricing.model.js";

const normalizeTrimmedString = (value) => String(value ?? "").trim();

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

const mapPricingDoc = (doc) => {
    if (!doc) {
        return null;
    }

    return {
        id: String(doc._id),
        pricingKey: doc.pricingKey,
        unitPrice: Number(doc.unitPrice ?? 0),
        isActive: Boolean(doc.isActive),
        updatedAt: toIsoDate(doc.updatedAt),
    };
};

const getPaymentPricingRules = async () => {
    const rules = await PaymentPricing.find({})
        .sort({ pricingKey: 1 })
        .lean();

    return rules.map(mapPricingDoc);
};

const updatePaymentPricingRules = async (rules = []) => {
    if (!Array.isArray(rules) || rules.length === 0) {
        throw new Error("rules must be a non-empty array");
    }

    const operations = [];
    for (const rule of rules) {
        const pricingKey = normalizeTrimmedString(rule?.pricingKey);
        const unitPrice = Number(rule?.unitPrice);

        if (!pricingKey) {
            throw new Error("pricingKey cannot be empty");
        }

        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            throw new Error(`Invalid unitPrice for pricingKey=${pricingKey}`);
        }

        operations.push({
            updateOne: {
                filter: { pricingKey },
                update: {
                    $set: {
                        unitPrice,
                        isActive: rule?.isActive === false ? false : true,
                        updatedAt: new Date(),
                    },
                    $setOnInsert: {
                        pricingKey,
                    },
                },
                upsert: true,
            },
        });
    }

    await PaymentPricing.bulkWrite(operations, { ordered: true });
    return getPaymentPricingRules();
};

const getActivePaymentPricingRule = async (preferredPricingKey) => {
    const preferred = normalizeTrimmedString(preferredPricingKey);

    if (preferred) {
        const selected = await PaymentPricing.findOne({
            pricingKey: preferred,
            isActive: true,
        }).lean();

        if (selected) {
            return mapPricingDoc(selected);
        }
    }

    const fallback = await PaymentPricing.findOne({ isActive: true })
        .sort({ pricingKey: 1 })
        .lean();

    return mapPricingDoc(fallback);
};

export {
    getActivePaymentPricingRule,
    getPaymentPricingRules,
    updatePaymentPricingRules,
};
