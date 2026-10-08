export type ErrorDetails = {
  message: string;
  status?: number;
  data?: unknown;
};

export type ErrorResponse = {
  success: false;
  error: ErrorDetails;
};
