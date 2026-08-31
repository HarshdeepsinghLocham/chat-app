"use client";

import { useEffect } from "react";
import { scrollDeepLinkTarget } from "@/lib/deep-link-highlight";

/**
 * After `ready`, scroll the target into view once. Skips quietly when the node
 * is not on the current page (no extra pagination / lookup).
 */
export function useDeepLinkScroll(elementId: string | null | undefined, ready: boolean) {
    useEffect(() => {
        if (!elementId || !ready) return;
        const frame = window.requestAnimationFrame(() => {
            scrollDeepLinkTarget(elementId);
        });
        return () => window.cancelAnimationFrame(frame);
    }, [elementId, ready]);
}
