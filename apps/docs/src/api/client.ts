import { createApiClient, resolveApiBaseUrl } from "@whitepoint/utils/api-client";

export const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, location.hostname);
const client = createApiClient({ baseUrl: apiBaseUrl });

export const { requestJson } = client;
