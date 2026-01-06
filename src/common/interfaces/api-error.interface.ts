/* eslint-disable prettier/prettier */
export interface ApiErrorResponse {
    statusCode: number;
    message: string;
    errors?: string[]; // Array para múltiplas validações
    timestamp: string;
    path: string;
}