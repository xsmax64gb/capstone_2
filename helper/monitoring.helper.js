const normalizeTrimmedString = (value) => String(value ?? "").trim();

const toSerializableObject = (value) => {
    if (!value || typeof value !== "object") {
        return {};
    }

    if (Array.isArray(value)) {
        return { values: value };
    }

    return value;
};

const logMonitoringEvent = ({
    event,
    level = "warn",
    source = "backend",
    data = {},
} = {}) => {
    const normalizedEvent = normalizeTrimmedString(event) || "unknown_event";
    const normalizedSource = normalizeTrimmedString(source) || "backend";
    const serializedData = toSerializableObject(data);

    const payload = {
        ts: new Date().toISOString(),
        event: normalizedEvent,
        source: normalizedSource,
        ...serializedData,
    };

    const line = `[MONITOR] ${JSON.stringify(payload)}`;

    if (level === "error") {
        console.error(line);
        return;
    }

    if (level === "info") {
        console.info(line);
        return;
    }

    console.warn(line);
};

export { logMonitoringEvent };