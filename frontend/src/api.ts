const API_BASE_URL = "http://127.0.0.1:8000";

function authHeaders(extra: HeadersInit = {}) {
  const token = localStorage.getItem("access_token");

  return {
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
    ...extra,
  };
}

export async function apiRequest(
  path: string,
  options: RequestInit = {}
) {
  const url = `${API_BASE_URL}${path}`;

  console.log("API REQUEST:", {
    method: options.method || "GET",
    url,
    body: options.body,
  });

  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    console.error("FETCH CONNECTION ERROR:", error);

    throw new Error(
      `Cannot connect to backend server at ${API_BASE_URL}. ` +
        `Make sure backend is running on port 8000.`
    );
  }

  return parseResponse(response);
}

export async function apiUpload(
  path: string,
  formData: FormData
) {
  const url = `${API_BASE_URL}${path}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });
  } catch (error) {
    console.error("UPLOAD CONNECTION ERROR:", error);

    throw new Error(
      `Cannot connect to backend server at ${API_BASE_URL}.`
    );
  }

  return parseResponse(response);
}

export async function apiDelete(path: string) {
  const url = `${API_BASE_URL}${path}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "DELETE",
      headers: authHeaders(),
    });
  } catch (error) {
    console.error("DELETE CONNECTION ERROR:", error);

    throw new Error(
      `Cannot connect to backend server at ${API_BASE_URL}.`
    );
  }

  return parseResponse(response);
}

async function parseResponse(response: Response) {
  const text = await response.text();

  let data: any = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {
      detail: text,
    };
  }

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.message ||
      `Request failed (${response.status})`;

    throw new Error(
      typeof message === "string"
        ? message
        : JSON.stringify(message)
    );
  }

  return data;
}

export { API_BASE_URL };