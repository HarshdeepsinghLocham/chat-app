import { Types } from "mongoose";
import {
    assertConversationAccess,
    assertTaskAccess,
    assertWorkSuggestionAccess,
    assertWorkSuggestionMutationAccess,
    AuthorizationError,
    canAccessConversation,
    canAccessWorkSuggestion,
    canMutateWorkSuggestion,
} from "../authorization.service";

jest.mock("@semantask/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@semantask/db/models/Conversation", () => ({
    Conversation: {
        findById: jest.fn(),
    },
}));

jest.mock("@semantask/db/models/Task", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
    },
}));

jest.mock("../organization.service", () => {
    const actualCanManageMembers = (role: string) => role === "owner" || role === "admin";
    return {
        assertMembership: jest.fn(),
        assertOrganizationActive: jest.fn(),
        getMembership: jest.fn(),
        canManageMembers: actualCanManageMembers,
    };
});

import { Conversation } from "@semantask/db/models/Conversation";
import TaskModel from "@semantask/db/models/Task";
import {
    assertMembership,
    assertOrganizationActive,
    getMembership,
} from "../organization.service";

const userId = new Types.ObjectId().toString();
const otherUserId = new Types.ObjectId().toString();
const conversationId = new Types.ObjectId().toString();
const taskId = new Types.ObjectId().toString();
const organizationId = new Types.ObjectId().toString();

describe("authorization.service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("allows participants to access a conversation", async () => {
        (Conversation.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    _id: new Types.ObjectId(conversationId),
                    participants: [new Types.ObjectId(userId), new Types.ObjectId(otherUserId)],
                    organizationId: null,
                }),
            }),
        });

        await expect(
            assertConversationAccess(userId, conversationId)
        ).resolves.toMatchObject({
            conversationId,
            participantIds: expect.arrayContaining([userId, otherUserId]),
            organizationId: null,
        });
    });

    it("denies non-participants without leaking existence", async () => {
        (Conversation.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    _id: new Types.ObjectId(conversationId),
                    participants: [new Types.ObjectId(otherUserId)],
                    organizationId: null,
                }),
            }),
        });

        await expect(
            assertConversationAccess(userId, conversationId)
        ).rejects.toMatchObject({
            code: "FORBIDDEN",
            message: "Forbidden",
        });
    });

    it("denies unknown conversations with the same forbidden response", async () => {
        (Conversation.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            }),
        });

        await expect(
            canAccessConversation(userId, conversationId)
        ).resolves.toBe(false);
    });

    it("requires org membership for org-scoped conversations", async () => {
        (Conversation.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    _id: new Types.ObjectId(conversationId),
                    participants: [new Types.ObjectId(userId)],
                    organizationId: new Types.ObjectId(organizationId),
                }),
            }),
        });
        (assertOrganizationActive as jest.Mock).mockResolvedValue({ status: "active" });
        (getMembership as jest.Mock).mockResolvedValue({
            role: "member",
            organizationId: new Types.ObjectId(organizationId),
            userId: new Types.ObjectId(userId),
        });

        await expect(
            assertConversationAccess(userId, conversationId)
        ).resolves.toMatchObject({
            conversationId,
            organizationId,
        });
    });

    it("denies org conversation when user is not a member", async () => {
        (Conversation.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    _id: new Types.ObjectId(conversationId),
                    participants: [new Types.ObjectId(userId)],
                    organizationId: new Types.ObjectId(organizationId),
                }),
            }),
        });
        (assertOrganizationActive as jest.Mock).mockResolvedValue({ status: "active" });
        (getMembership as jest.Mock).mockResolvedValue(null);

        await expect(
            assertConversationAccess(userId, conversationId)
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("assertTaskAccess requires conversation membership", async () => {
        (TaskModel.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    _id: new Types.ObjectId(taskId),
                    conversationId: new Types.ObjectId(conversationId),
                    organizationId: null,
                }),
            }),
        });

        (Conversation.findById as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    _id: new Types.ObjectId(conversationId),
                    participants: [new Types.ObjectId(otherUserId)],
                    organizationId: null,
                }),
            }),
        });

        await expect(assertTaskAccess(userId, taskId)).rejects.toBeInstanceOf(AuthorizationError);
    });

    describe("work suggestion access", () => {
        it("allows conversation participants", async () => {
            (Conversation.findById as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({
                        _id: new Types.ObjectId(conversationId),
                        participants: [new Types.ObjectId(userId)],
                        organizationId: null,
                    }),
                }),
            });

            await expect(
                canAccessWorkSuggestion(userId, {
                    conversationId,
                    organizationId: null,
                })
            ).resolves.toBe(true);
        });

        it("allows org members for org-scoped suggestions without conversation participation", async () => {
            (Conversation.findById as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({
                        _id: new Types.ObjectId(conversationId),
                        participants: [new Types.ObjectId(otherUserId)],
                        organizationId: new Types.ObjectId(organizationId),
                    }),
                }),
            });
            (assertOrganizationActive as jest.Mock).mockResolvedValue({ status: "active" });
            (assertMembership as jest.Mock).mockResolvedValue({
                role: "member",
                organizationId: new Types.ObjectId(organizationId),
                userId: new Types.ObjectId(userId),
            });

            await expect(
                canAccessWorkSuggestion(userId, {
                    conversationId,
                    organizationId,
                })
            ).resolves.toBe(true);
            expect(assertMembership).toHaveBeenCalledWith(organizationId, userId);
        });

        it("denies org members when organization is inactive", async () => {
            (Conversation.findById as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({
                        _id: new Types.ObjectId(conversationId),
                        participants: [new Types.ObjectId(otherUserId)],
                        organizationId: new Types.ObjectId(organizationId),
                    }),
                }),
            });
            (assertOrganizationActive as jest.Mock).mockRejectedValue(
                new AuthorizationError("FORBIDDEN", "Organization is suspended")
            );
            (assertMembership as jest.Mock).mockResolvedValue({
                role: "member",
                organizationId: new Types.ObjectId(organizationId),
                userId: new Types.ObjectId(userId),
            });

            await expect(
                canAccessWorkSuggestion(userId, {
                    conversationId,
                    organizationId,
                })
            ).resolves.toBe(false);
            expect(assertMembership).not.toHaveBeenCalled();
        });

        it("denies unrelated users without leaking existence", async () => {
            (Conversation.findById as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({
                        _id: new Types.ObjectId(conversationId),
                        participants: [new Types.ObjectId(otherUserId)],
                        organizationId: null,
                    }),
                }),
            });

            await expect(
                assertWorkSuggestionAccess(userId, {
                    conversationId,
                    organizationId: null,
                })
            ).rejects.toMatchObject({
                code: "FORBIDDEN",
                message: "Forbidden",
            });
        });
    });

    describe("work suggestion mutation access", () => {
        it("allows conversation participants to mutate", async () => {
            (Conversation.findById as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({
                        _id: new Types.ObjectId(conversationId),
                        participants: [new Types.ObjectId(userId)],
                        organizationId: null,
                    }),
                }),
            });

            await expect(
                canMutateWorkSuggestion(userId, {
                    conversationId,
                    organizationId: null,
                })
            ).resolves.toBe(true);
        });

        it("denies plain org members without conversation participation", async () => {
            (Conversation.findById as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({
                        _id: new Types.ObjectId(conversationId),
                        participants: [new Types.ObjectId(otherUserId)],
                        organizationId: new Types.ObjectId(organizationId),
                    }),
                }),
            });
            (assertOrganizationActive as jest.Mock).mockResolvedValue({ status: "active" });
            (getMembership as jest.Mock).mockResolvedValue({
                role: "member",
                organizationId: new Types.ObjectId(organizationId),
                userId: new Types.ObjectId(userId),
            });

            await expect(
                canMutateWorkSuggestion(userId, {
                    conversationId,
                    organizationId,
                })
            ).resolves.toBe(false);
        });

        it("allows org admins for org-scoped suggestions without conversation participation", async () => {
            (Conversation.findById as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({
                        _id: new Types.ObjectId(conversationId),
                        participants: [new Types.ObjectId(otherUserId)],
                        organizationId: new Types.ObjectId(organizationId),
                    }),
                }),
            });
            (assertOrganizationActive as jest.Mock).mockResolvedValue({ status: "active" });
            (getMembership as jest.Mock).mockResolvedValue({
                role: "admin",
                organizationId: new Types.ObjectId(organizationId),
                userId: new Types.ObjectId(userId),
            });

            await expect(
                canMutateWorkSuggestion(userId, {
                    conversationId,
                    organizationId,
                })
            ).resolves.toBe(true);
        });

        it("denies unrelated users without leaking existence", async () => {
            (Conversation.findById as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue({
                        _id: new Types.ObjectId(conversationId),
                        participants: [new Types.ObjectId(otherUserId)],
                        organizationId: null,
                    }),
                }),
            });

            await expect(
                assertWorkSuggestionMutationAccess(userId, {
                    conversationId,
                    organizationId: null,
                })
            ).rejects.toMatchObject({
                code: "FORBIDDEN",
                message: "Forbidden",
            });
        });
    });
});
