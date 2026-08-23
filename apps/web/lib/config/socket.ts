import { firstNonEmpty } from "./parse";

export function getInternalSocketServerUrl(): string {
    return firstNonEmpty(
        process.env.SOCKET_SERVER_URL,
        process.env.NEXT_PUBLIC_SOCKET_URL,
    ) ?? "http://localhost:3001";
}
