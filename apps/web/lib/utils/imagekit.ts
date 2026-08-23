import { authenticatedFetch } from "@/lib/utils/api";
import { getPublicImageKitEndpoint, getPublicImageKitKey } from "@/lib/config/public";

function isTrustedImageKitUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        const host = parsed.hostname.toLowerCase();

        if (parsed.protocol !== "https:") {
            return false;
        }

        return host === "ik.imagekit.io";
    } catch {
        return false;
    }
}

function appendImageKitTransform(url: string, size: number): string {
    if (!isTrustedImageKitUrl(url)) {
        return url;
    }

    const parsed = new URL(url);
    const existing = parsed.searchParams.get("tr");
    const transform = "w-" + size + ",h-" + size + ",c-maintain_ratio";
    parsed.searchParams.set("tr", existing ? existing + "," + transform : transform);
    return parsed.toString();
}

type ImageKitUploadAuthResponse = {
    signature?: string;
    expire?: number;
    token?: string;
    publicKey?: string;
    error?: string;
};

export type ImageKitUploadAuth = {
    signature: string;
    expire: number;
    token: string;
    publicKey: string;
};

export async function getImageKitUploadAuth(): Promise<ImageKitUploadAuth> {
    const authRes = await authenticatedFetch("/api/auth/imagekit-auth", { cache: "no-store" });
    const auth = (await authRes.json()) as ImageKitUploadAuthResponse;

    if (!authRes.ok) {
        throw new Error(auth.error || "Unable to authenticate image upload.");
    }

    const publicKey = auth.publicKey || getPublicImageKitKey();

    if (!publicKey || !auth.signature || typeof auth.expire !== "number" || !auth.token) {
        throw new Error("Image upload authentication response is incomplete.");
    }

    return {
        signature: auth.signature,
        expire: auth.expire,
        token: auth.token,
        publicKey,
    };
}

export function getAvatarUrl(source?: string, size = 128): string {
    if (!source) return "";

    if (source.startsWith("http://") || source.startsWith("https://")) {
        return appendImageKitTransform(source, size);
    }

    const endpoint = getPublicImageKitEndpoint();
    const normalized = source.replace(/^\/+/, "");

    if (!endpoint) {
        return source;
    }

    return appendImageKitTransform(`${endpoint}/${normalized}`, size);
}
