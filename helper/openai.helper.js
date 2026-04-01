const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

const isUnsupportedTemperatureError = (status, errorText) => {
  if (status !== 400) {
    return false;
  }

  const normalizedError = String(errorText || "");

  return (
    /Unsupported value:\s*'temperature'/i.test(normalizedError) ||
    (/temperature/i.test(normalizedError) &&
      /Only the default \(1\) value is supported/i.test(normalizedError))
  );
};

export async function postOpenAiChatCompletion({
  apiKey,
  body,
  url = OPENAI_CHAT_COMPLETIONS_URL,
  errorMessagePrefix = "OpenAI error",
  maxErrorLength = 200,
  timeoutMs = 0,
}) {
  const request = async (payload) => {
    let timeoutId;
    const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
    const controller = hasTimeout ? new AbortController() : null;

    if (controller) {
      timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
    }

    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError" && hasTimeout) {
        throw new Error(`${errorMessagePrefix} timeout after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  let response = await request(body);

  if (response.ok) {
    return response;
  }

  let errorText = await response.text();

  // Some newer models accept only the default temperature, so retry once without it.
  if (
    hasOwn(body, "temperature") &&
    isUnsupportedTemperatureError(response.status, errorText)
  ) {
    const { temperature, ...retryBody } = body;

    response = await request(retryBody);

    if (response.ok) {
      return response;
    }

    errorText = await response.text();
  }

  throw new Error(
    `${errorMessagePrefix} ${response.status}: ${errorText.slice(
      0,
      maxErrorLength
    )}`
  );
}
