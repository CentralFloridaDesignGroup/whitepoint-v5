import { createApiClient, resolveApiBaseUrl } from "@whitepoint/utils";

const client = createApiClient({
  baseUrl: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, location.hostname),
});

export const { requestJson, requestBlob } = client;
