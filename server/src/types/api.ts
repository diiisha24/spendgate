/** Standard error envelope returned by every failing REST endpoint. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ServiceStatus = 'ok' | 'error';

export interface HealthReport {
  status: ServiceStatus;
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: {
      status: ServiceStatus;
      latencyMs?: number;
      message?: string;
    };
  };
}
