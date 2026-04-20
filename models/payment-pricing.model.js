import mongoose from "mongoose";

const paymentPricingSchema = new mongoose.Schema(
    {
        pricingKey: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        unitPrice: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        collection: "payment_pricing",
        timestamps: true,
    }
);

paymentPricingSchema.index({ pricingKey: 1 }, { unique: true });

export default mongoose.models.PaymentPricing ||
    mongoose.model("PaymentPricing", paymentPricingSchema);
