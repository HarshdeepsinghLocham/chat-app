/**
 * Lightweight user identity for product UI (name + avatar).
 * Keep full ClientUser for chat/profile; use UserRef on work/org surfaces.
 */
export interface UserRef {
    id: string;
    username: string;
    email?: string;
    profilePicture?: string | null;
}

export interface ClientUser {
    _id: string;
    username: string;
    email: string;
    isOnline: boolean;
    profilePicture?: string;
    role: 'user' | 'moderator' | 'admin';
    status: 'active' | 'banned';
    lastSeen: string;
    isVerified: boolean;
    verifiedAt?: string;
    conversations: string[]; // Only store conversation IDs for FE
    createdAt: string;
    updatedAt: string;
}