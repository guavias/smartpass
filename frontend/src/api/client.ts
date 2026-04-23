const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
	status: number;
	payload?: unknown;

	constructor(message: string, status: number, payload?: unknown) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.payload = payload;
	}
}

function buildUrl(path: string): string {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(buildUrl(path), {
		...init,
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});

	const contentType = response.headers.get("content-type") ?? "";
	const isJson = contentType.includes("application/json");
	const payload = isJson ? await response.json() : await response.text();

	if (!response.ok) {
		let message = `Request failed with status ${response.status}`;
		if (typeof payload === "object" && payload && "detail" in payload) {
			const detail = (payload as { detail?: unknown }).detail;
			if (Array.isArray(detail)) {
				message = detail
					.map((e: unknown) =>
						typeof e === "object" && e !== null && "msg" in e
							? String((e as { msg: unknown }).msg)
							: String(e)
					)
					.join("; ") || "Request failed";
			} else {
				message = String(detail ?? "Request failed");
			}
		}
		throw new ApiError(message, response.status, payload);
	}

	return payload as T;
}
