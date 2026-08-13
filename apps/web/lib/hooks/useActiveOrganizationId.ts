"use client";

import { useEffect, useState } from "react";

export const ACTIVE_ORGANIZATION_STORAGE_KEY = "semantask.activeOrganizationId";

/** SSR-safe: null until mount, then reads `ACTIVE_ORGANIZATION_STORAGE_KEY`. */
export function useActiveOrganizationId() {
    const [organizationId, setOrganizationId] = useState<string | null>(null);

    useEffect(() => {
        setOrganizationId(window.localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY));
    }, []);

    return organizationId;
}
