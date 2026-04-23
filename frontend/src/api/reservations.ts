import { apiFetch } from "./client";

export type CreateVisitorPassRequest = {
	name: string;
	email: string;
	phone: string;
	vehicle_info: string;
	access_start?: string;
	num_days: number;
	num_adults: number;
	num_children: number;
	payment_amount: number;
	payment_tax?: number;
	payment_method: string;
	payment_source_id: string;
	idempotency_key: string;
};

export type VisitorPassResponse = {
	id: string;
	portal_token: string;
	portal_url: string;
	pass_type: "visitor";
	name: string;
	email: string;
	phone?: string;
	access_start: string;
	access_end: string;
	payment_status: string;
	payment_amount: number;
	num_days: number;
	num_adults: number;
	num_children: number;
	status: string;
};

export type GuestLookupRequest = {
	reservation_id: string;
	email: string;
};

export type CreateGuestPassRequest = {
	name: string;
	email: string;
	phone: string;
	reservation_id: string;
	check_in: string;
	check_out: string;
	num_adults?: number;
	num_children?: number;
	pets?: number;
	payment_amount?: number;
	payment_tax?: number;
	payment_method?: string;
	payment_source_id?: string;
	idempotency_key?: string;
};

export type GuestPassResponse = {
	id: string;
	reservation_id: string;
	portal_token: string;
	portal_url: string;
	pass_type: "guest";
	name: string;
	email: string;
	phone?: string;
	access_start: string;
	access_end: string;
	num_adults: number;
	num_children: number;
	pets: number;
	status: string;
	payment_status?: string;
	payment_reference?: string;
	payment_amount?: number;
};

export type PortalResponse = {
	pass_id: string;
	portal_token: string;
	user_type: "visitor" | "guest";
	holder_name: string;
	access_start: string;
	access_end: string;
	status: string;
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

export async function createGuestPass(payload: CreateGuestPassRequest): Promise<GuestPassResponse> {
	return apiFetch<GuestPassResponse>("/api/v1/guests/", {
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
