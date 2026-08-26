"use client";

import { useEffect, useState } from "react";

export const ACTIVE_ORGANIZATION_STORAGE_KEY = "semantask.activeOrganizationId";
export const ACTIVE_ORGANIZATION_CHANGED_EVENT = "semantask:active-organization";

export function readActiveOrganizationId(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
}

export function writeActiveOrganizationId(id: string | null): void {
    if (typeof window === "undefined") return;
    if (id) {
        window.localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, id);
    } else {
        window.localStorage.removeItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(ACTIVE_ORGANIZATION_CHANGED_EVENT));
}

/** SSR-safe: null until mount, then reads `ACTIVE_ORGANIZATION_STORAGE_KEY`. */
export function useActiveOrganizationId() {
    const [organizationId, setOrganizationId] = useState<string | null>(null);

    useEffect(() => {
        const sync = () => setOrganizationId(readActiveOrganizationId());
        sync();
        window.addEventListener(ACTIVE_ORGANIZATION_CHANGED_EVENT, sync);
        window.addEventListener("storage", sync);
        return () => {
            window.removeEventListener(ACTIVE_ORGANIZATION_CHANGED_EVENT, sync);
            window.removeEventListener("storage", sync);
        };
    }, []);

    return organizationId;
}
