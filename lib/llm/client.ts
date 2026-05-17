import type { GenerateRequest, GenerateResponse } from "./types";

export interface LLMClient {
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}
