const normalizeEnv = (value) => {
    if (!value) {
        return null;
    }

    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
};

const resolvePaymentQrConfig = () => ({
    bankCode: normalizeEnv(process.env.PAYMENT_QR_BANK_CODE)?.toLowerCase() ?? null,
    accountNumber: normalizeEnv(process.env.PAYMENT_QR_ACCOUNT_NUMBER),
    accountName: normalizeEnv(process.env.PAYMENT_QR_ACCOUNT_NAME),
    template: normalizeEnv(process.env.PAYMENT_QR_TEMPLATE) ?? "compact2",
});

const getPaymentQrSetupError = (paymentMethod) => {
    if (paymentMethod !== "bank_transfer") {
        return null;
    }

    const config = resolvePaymentQrConfig();
    if (!config.bankCode || !config.accountNumber) {
        return "Missing QR configuration: PAYMENT_QR_BANK_CODE and PAYMENT_QR_ACCOUNT_NUMBER are required";
    }

    return null;
};

const buildPaymentQrData = (payment) => {
    if (!payment || payment.paymentMethod !== "bank_transfer") {
        return null;
    }

    const config = resolvePaymentQrConfig();
    if (!config.bankCode || !config.accountNumber) {
        return null;
    }

    const amount = Math.max(0, Math.round(Number(payment.amount) || 0));
    const transferContent = payment.invoiceNumber;

    const imageUrl = new URL(
        `https://img.vietqr.io/image/${config.bankCode}-${config.accountNumber}-${config.template}.png`
    );
    imageUrl.searchParams.set("addInfo", transferContent);

    if (amount > 0) {
        imageUrl.searchParams.set("amount", `${amount}`);
    }

    if (config.accountName) {
        imageUrl.searchParams.set("accountName", config.accountName);
    }

    return {
        provider: "vietqr",
        qrImageUrl: imageUrl.toString(),
        bankCode: config.bankCode,
        accountNumber: config.accountNumber,
        accountName: config.accountName,
        transferContent,
        amount,
        currency: payment.currency,
    };
};

export {
    buildPaymentQrData,
    getPaymentQrSetupError,
    resolvePaymentQrConfig,
};
