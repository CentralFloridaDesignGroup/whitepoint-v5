import { createApiClient, resolveApiBaseUrl } from "@whitepoint/utils";

export const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, location.hostname);
const client = createApiClient({ baseUrl: apiBaseUrl });

export const { requestJson, requestBlob } = client;
