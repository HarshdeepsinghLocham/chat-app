"use client";

import type { UserRef } from "@semantask/types";
import UserAvatar from "@/components/home/UserAvatar";
import { cn } from "@/lib/utils/utils";

type UserChipProps = {
    user: UserRef;
    size?: number;
    className?: string;
    showEmail?: boolean;
};

export function UserChip({ user, size = 24, className, showEmail = false }: UserChipProps) {
    return (
        <span
            className={cn("inline-flex max-w-full items-center gap-2 text-sm", className)}
            data-testid="user-chip"
            data-user-id={user.id}
            title={user.email ? `${user.username} <${user.email}>` : user.username}
        >
            <UserAvatar
                username={user.username}
                profilePicture={user.profilePicture ?? undefined}
                size={size}
            />
            <span className="min-w-0 truncate font-medium">{user.username}</span>
            {showEmail && user.email ? (
                <span className="min-w-0 truncate text-xs text-muted-foreground">{user.email}</span>
            ) : null}
        </span>
    );
}

export function userDisplayName(user: Pick<UserRef, "username"> | null | undefined): string {
    return user?.username?.trim() || "Unknown user";
}
