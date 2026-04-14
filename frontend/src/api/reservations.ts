import { apiFetch } from "./client";

export type CreateVisitorPassRequest = {
	name: string;
	email: string;
	phone: string;
	vehicle_info: string;
	num_days: number;
	payment_amount: number;
	payment_method: string;
	payment_source_id: string;
	idempotency_key: string;
};

export type VisitorPassResponse = {
	id: string;
	portal_token: string;
	portal_url: string;
	name: string;
	email: string;
	phone?: string;
	access_start: string;
	access_end: string;
	payment_status: string;
};

export type GuestLookupRequest = {
	reservation_id: string;
	email: string;
};

export type GuestPassResponse = {
	id: string;
	reservation_id: string;
	portal_token: string;
	portal_url: string;
	name: string;
	email: string;
	phone?: string;
	access_start: string;
	access_end: string;
};

export type PortalResponse = {
	pass_id: string;
	portal_token: string;
	user_type: "visitor" | "guest";
	holder_name: string;
	access_start: string;
	access_end: string;
	status: string;
	qr_refresh_seconds: number;
};

export type PortalQrResponse = {
	qr_payload: string;
	generated_at: string;
	valid_until: string;
	refresh_seconds: number;
};

export async function createVisitorPass(payload: CreateVisitorPassRequest): Promise<VisitorPassResponse> {
	return apiFetch<VisitorPassResponse>("/api/v1/visitors/", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export async function getVisitorPass(passId: string): Promise<VisitorPassResponse> {
	return apiFetch<VisitorPassResponse>(`/api/v1/visitors/${encodeURIComponent(passId)}`);
}

export async function findGuestPortal(payload: GuestLookupRequest): Promise<GuestPassResponse> {
	return apiFetch<GuestPassResponse>("/api/v1/guests/find", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export async function getGuestPass(passId: string): Promise<GuestPassResponse> {
	return apiFetch<GuestPassResponse>(`/api/v1/guests/${encodeURIComponent(passId)}`);
}

export async function getPortal(portalToken: string): Promise<PortalResponse> {
	return apiFetch<PortalResponse>(`/api/v1/access/portal/${encodeURIComponent(portalToken)}`);
}

export async function getPortalQr(portalToken: string): Promise<PortalQrResponse> {
	return apiFetch<PortalQrResponse>(`/api/v1/access/portal/${encodeURIComponent(portalToken)}/qr`);
}
