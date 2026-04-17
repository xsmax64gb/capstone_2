import mongoose from "mongoose";

import { PAYMENT_METHODS, PAYMENT_STATUSES } from "./constants.js";

const paymentFeatureScopeSnapshotSchema = new mongoose.Schema(
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
            trim: true,
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

const paymentSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        userEmail: {
            type: String,
            trim: true,
            default: null,
        },
        userName: {
            type: String,
            trim: true,
            default: null,
        },
        invoiceNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        externalRef: {
            type: String,
            trim: true,
            default: null,
        },
        pricingKey: {
            type: String,
            trim: true,
            default: null,
        },
        packageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PaymentPackage",
            default: null,
        },
        packageSlug: {
            type: String,
            trim: true,
            default: null,
        },
        packageName: {
            type: String,
            trim: true,
            default: null,
        },
        packageFeatureKeys: {
            type: [String],
            default: [],
        },
        packageFeatureScopes: {
            type: [paymentFeatureScopeSnapshotSchema],
            default: [],
        },
        amount: {
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
        paymentMethod: {
            type: String,
            enum: PAYMENT_METHODS,
            default: "bank_transfer",
        },
        status: {
            type: String,
            enum: PAYMENT_STATUSES,
            default: "pending",
        },
        xgateReference: {
            type: String,
            trim: true,
            default: null,
        },
        matchedContent: {
            type: String,
            default: null,
        },
        paidAt: {
            type: Date,
            default: null,
        },
        syncedAt: {
            type: Date,
            default: null,
        },
        expiresAt: {
            type: Date,
            default: null,
        },
        failureReason: {
            type: String,
            trim: true,
            default: null,
        },
    },
    {
        collection: "payments",
        timestamps: true,
    }
);

paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ paidAt: -1 });
paymentSchema.index({ syncedAt: -1 });
paymentSchema.index({ expiresAt: 1, status: 1 });
paymentSchema.index({ invoiceNumber: 1 }, { unique: true });
paymentSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.models.Payment ||
    mongoose.model("Payment", paymentSchema);
