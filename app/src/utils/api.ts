export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ApiFetchOptions extends RequestInit {
  token?: string;
}

export const apiFetch = async (
  url: string,
  { headers, token, ...init }: ApiFetchOptions = {},
): Promise<Response> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, `API request failed with ${response.status}`);
  }

  return response;
};
