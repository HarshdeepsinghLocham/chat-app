import { firstNonEmpty } from "./parse";

export function getImageKitPrivateKey(): string | undefined {
    return firstNonEmpty(process.env.IMAGEKIT_PRIVATE_KEY);
}

export function getImageKitPublicKey(): string | undefined {
    return firstNonEmpty(
        process.env.IMAGEKIT_PUBLIC_KEY,
        process.env.NEXT_PUBLIC_PUBLIC_KEY,
    );
}
