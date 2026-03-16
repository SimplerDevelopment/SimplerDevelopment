// API response types

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface ContactFormResponse {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
}

export interface BuilderApiParams {
  apiKey: string;
  model: string;
  userAttributes?: {
    urlPath?: string;
  };
  query?: Record<string, any>;
  options?: {
    sort?: Record<string, 1 | -1>;
    limit?: number;
    offset?: number;
  };
}
