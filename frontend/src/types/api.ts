// Type definitions for API responses
// Using `any` is intentionally allowed (configured in eslint.config.mjs)
// to handle dynamic API response shapes without breaking functionality.

export interface RiverDevice {
  serial: string;
  name: string;
  status?: string;
  description?: string;
  owner_email?: string;
  owner_id?: string;
  install_latitude?: string | number;
  install_longitude?: string | number;
  organization_name?: string;
  cctv_path_0?: string;
  cctv_path_1?: string;
  cctv_path_2?: string;
  last_seen?: string;
  net_water_level_cm?: number;
  water_level_pct?: number;
  warning_status?: string;
  offline_threshold_min?: number;
  official_page_id?: string;
}

export interface AlertThreshold {
  id: number;
  alert_level: string;
  threshold_cm?: number | null;
  threshold_pct?: number | null;
  freq_duration_sec?: number | null;
  is_active: boolean;
  serial?: string;
}

export interface TelemetryStats {
  time: string;
  serial?: string;
  net_water_level_cm?: number;
  water_level_pct?: number;
  raw_distance_cm?: number;
  snapshot_url0?: string;
  snapshot_url1?: string;
  snapshot_url2?: string;
  warning_status?: string;
}

export interface CalcConfig {
  bottom_to_bank_cm: number;
  bank_to_sensor_cm: number;
  default_duration_sec: number;
  extra_config?: Record<string, unknown>;
}

export interface ThresholdFormEntry {
  id: number | null;
  threshold_cm: string;
  threshold_pct: string;
  freq_duration_sec: string;
  is_active: boolean;
}

export interface AnomalyRecord {
  id?: string;
  serial?: string;
  anomaly_type?: string;
  severity?: string;
  time?: string;
  value?: number;
  description?: string;
}

export interface Registration {
  id?: string;
  serial?: string;
  imei?: string;
  station?: string;
  province?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Specification {
  id?: string;
  serial?: string;
  specification?: string;
  created_at?: string;
  updated_at?: string;
}

export type UserRole = 'SuperAdmin' | 'Admin' | 'user';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  created_at: string;
}