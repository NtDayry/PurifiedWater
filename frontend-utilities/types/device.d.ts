export interface DeviceToken {
  id: number;
  device_name: string;
  device_code: string;
  token_prefix: string | null;
  device_type: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  last_used_at: string | null;
}

export interface DeviceTokenListResponse {
  devices: DeviceToken[];
  total: number;
  total_pages: number;
}

export interface DeviceTokenCreateResponse {
  device: DeviceToken;
  raw_token: string;
  auth_header_example: string;
}

export interface DeviceTokenRotateResponse {
  device: DeviceToken;
  raw_token: string;
  auth_header_example: string;
}

export interface DeviceTokenUpdateResponse {
  message: string;
  device: DeviceToken;
}

export interface DeviceTokenRevokeResponse {
  message: string;
  device_code: string;
}
