export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface HealthResponse {
  status: "ok";
  service: "finsight-api";
}
