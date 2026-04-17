import mongoose from "mongoose";

const PAYMENT_PACKAGE_BILLING_CYCLES = ["month", "quarter", "year", "one_time"];
const FEATURE_SCOPE_PERIODS = ["day", "week", "month", "billing_cycle", "lifetime"];

const featureScopeSchema = new mongoose.Schema(
    {
        featureKey: {
            type: String,
            required: true,
            trim: true,
        },
        accessLevel: {
            type: String,
            trim: true,
            default: "basic",
        },
        quota: {
            type: Number,
            min: 0,
            default: null,
        },
        quotaPeriod: {
            type: String,
            enum: FEATURE_SCOPE_PERIODS,
            default: "month",
        },
        note: {
            type: String,
            trim: true,
            default: "",
        },
    },
    {
        _id: false,
    }
);

const paymentPackageSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        price: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        currency: {
            type: String,
            trim: true,
            uppercase: true,
            default: "VND",
        },
        billingCycle: {
            type: String,
            enum: PAYMENT_PACKAGE_BILLING_CYCLES,
            default: "month",
        },
        featureKeys: {
            type: [String],
            default: [],
        },
        featureScopes: {
            type: [featureScopeSchema],
            default: [],
        },
        isDefault: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: false,
        },
        displayOrder: {
            type: Number,
            default: 0,
        },
    },
    {
        collection: "payment_packages",
        timestamps: true,
    }
);

paymentPackageSchema.index({ slug: 1 }, { unique: true });
paymentPackageSchema.index(
    { isDefault: 1 },
    {
        unique: true,
        partialFilterExpression: { isDefault: true },
    }
);
paymentPackageSchema.index({ isActive: 1, displayOrder: 1, price: 1 });

export { FEATURE_SCOPE_PERIODS, PAYMENT_PACKAGE_BILLING_CYCLES };

export default mongoose.models.PaymentPackage ||
    mongoose.model("PaymentPackage", paymentPackageSchema);
