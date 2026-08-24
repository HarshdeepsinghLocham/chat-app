import { getUploadAuthParams } from "@imagekit/next/server";
import { getImageKitPrivateKey, getImageKitPublicKey } from "@/lib/config/imagekit";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";

export async function GET() {
    const guard = await requireAuthUser();
    if (guard.response) {
        return guard.response;
    }

    const privateKey = getImageKitPrivateKey();
    const publicKey = getImageKitPublicKey();

    if (!privateKey || !publicKey) {
        return Response.json(
            { error: "Image upload is not configured on the server." },
            { status: 500 }
        );
    }

    try {
        const { token, expire, signature } = getUploadAuthParams({
            privateKey,
            publicKey,
        });

        return Response.json({
            token,
            expire,
            signature,
            publicKey,
        });
    } catch {
        return Response.json(
            { error: "ImageKit authentication failed." },
            { status: 500 }
        );
    }
}