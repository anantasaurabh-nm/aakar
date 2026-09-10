export interface ProviderField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'select';
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface ConnectorRequest {
  url: URL;
  headers: Record<string, string>;
  method: string;
}

export interface ConnectorTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  statusCode?: number;
}

export interface ConnectorProvider {
  id: string;
  name: string;
  description: string;
  icon?: string;
  defaultBaseUrl?: string;
  fields: ProviderField[];

  /**
   * Injects authentication credentials into an outgoing HTTP request (via headers, query params, etc.).
   */
  decorateRequest: (credentials: Record<string, unknown>, req: ConnectorRequest) => void;

  /**
   * Verifies that the credentials are valid and can communicate with the remote service.
   */
  test: (credentials: Record<string, unknown>, baseUrl: string) => Promise<ConnectorTestResult>;

  /**
   * Generates a safe masked preview string for UI tables (e.g. "Key: 94a1•••• | Token: atta••••").
   */
  maskPreview?: (credentials: Record<string, unknown>) => string;
}
