import { firstNonEmpty } from "./parse";

export function getAppUrl(): string | undefined {
    return firstNonEmpty(process.env.APP_URL);
}

export function getGoogleClientId(): string {
    return firstNonEmpty(process.env.GOOGLE_CLIENT_ID) ?? "";
}
