import { apiFetch } from "./client";

export const ADMIN_AUTH_SESSION_KEY = "admin_auth_session";

export type AdminLoginRequest = {
  email: string;
  password: string;
};

export type AdminLoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  admin_id: string;
  role: string;
  name: string;
};

export type AdminSession = {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  adminId: string;
  role: string;
  name: string;
};

export type AdminAccessLog = {
  event_id?: string;
  pass_id?: string;
  reservation_id?: string;
  guest_name?: string;
  location?: string;
  result?: string;
  reason?: string;
  scanner_id?: string;
  timestamp?: string;
};

export type AdminPass = {
  pass_id: string;
  reservation_id?: string;
  portal_token?: string;
  guest_name: string;
  email: string;
  phone?: string;
  pass_type: string;
  status: string;
  start_at: string;
  end_at: string;
  adults: number;
  children: number;
  num_days?: number;
  vehicle_info?: string;
  payment_amount?: number;
  payment_tax?: number;
  payment_reference?: string;
  payment_status?: string;
  created_at: string;
  updated_at?: string;
};

export type AdminPassQrResponse = {
  qr_payload: string;
  generated_at: string;
  valid_until: string;
  refresh_seconds: number;
};

type AdminPassListApiResponse = {
  items: AdminPass[];
  total: number;
  page: number;
  page_size: number;
};

export type AdminPassListResponse = AdminPassListApiResponse;

type AdminAccessLogListApiResponse = {
  items?: AdminAccessLog[];
  access_logs?: AdminAccessLog[];
  total: number;
  page?: number;
  page_size?: number;
  limit?: number;
  offset?: number;
};

export type AdminAccessLogListResponse = {
  items: AdminAccessLog[];
  total: number;
  page: number;
  page_size: number;
};

export async function adminLogin(payload: AdminLoginRequest): Promise<AdminLoginResponse> {
  return apiFetch<AdminLoginResponse>("/api/v1/admin/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function saveAdminSession(login: AdminLoginResponse): AdminSession {
  const expiresAt = new Date(Date.now() + login.expires_in * 1000).toISOString();
  const session: AdminSession = {
    accessToken: login.access_token,
    tokenType: login.token_type,
    expiresAt,
    adminId: login.admin_id,
    role: login.role,
    name: login.name,
  };
  sessionStorage.setItem(ADMIN_AUTH_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getAdminSession(): AdminSession | null {
  const raw = sessionStorage.getItem(ADMIN_AUTH_SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as AdminSession;
    if (!session?.accessToken || !session?.expiresAt) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearAdminSession(): void {
  sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
}

export function isAdminSessionValid(session: AdminSession | null): boolean {
  if (!session) return false;
  return new Date(session.expiresAt).getTime() > Date.now();
}

export async function getAdminAccessLogs(limit = 100, offset = 0): Promise<AdminAccessLogListResponse> {
  const data = await apiFetch<AdminAccessLogListApiResponse>(`/api/v1/admin/access-logs?limit=${limit}&offset=${offset}`);
  const items = data.items ?? data.access_logs ?? [];
  return {
    items,
    total: data.total,
    page: data.page ?? Math.floor((data.offset ?? offset) / Math.max(1, data.limit ?? limit)) + 1,
    page_size: data.page_size ?? data.limit ?? limit,
  };
}

export async function getAdminPasses(params?: {
  search?: string;
  status?: string;
  pass_type?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}): Promise<AdminPassListResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.status && params.status !== "All") query.set("status", params.status.toLowerCase());
  if (params?.pass_type && params.pass_type !== "All") query.set("pass_type", params.pass_type.toLowerCase());
  if (params?.start_date) query.set("start_date", params.start_date);
  if (params?.end_date) query.set("end_date", params.end_date);
  query.set("page", String(params?.page ?? 1));
  query.set("page_size", String(params?.page_size ?? 100));

  return apiFetch<AdminPassListApiResponse>(`/api/v1/admin/passes?${query.toString()}`);
}

export async function getAdminPass(passId: string): Promise<AdminPass> {
  return apiFetch<AdminPass>(`/api/v1/admin/passes/${encodeURIComponent(passId)}`);
}

export async function patchAdminPass(passId: string, payload: {
  status?: string;
  access_start?: string;
  access_end?: string;
  email?: string;
  phone?: string;
  vehicle_info?: string;
  num_adults?: number;
  num_children?: number;
}): Promise<AdminPass> {
  return apiFetch<AdminPass>(`/api/v1/admin/passes/${encodeURIComponent(passId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getAdminPassQr(passId: string): Promise<AdminPassQrResponse> {
  return apiFetch<AdminPassQrResponse>(`/api/v1/admin/passes/${encodeURIComponent(passId)}/qr`);
}

export async function regenerateAdminPassQr(passId: string): Promise<AdminPassQrResponse> {
  return apiFetch<AdminPassQrResponse>(`/api/v1/admin/passes/${encodeURIComponent(passId)}/qr/regenerate`, {
    method: "POST",
  });
}

export async function deleteAdminPass(passId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/admin/passes/${encodeURIComponent(passId)}`, {
    method: "DELETE",
  });
}