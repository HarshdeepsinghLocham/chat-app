/**
 * @jest-environment jsdom
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const listOrganizations = jest.fn();
const createOrganization = jest.fn();
const getOrganizationMembers = jest.fn();
const listOrganizationInvitations = jest.fn();
const createOrganizationInvitation = jest.fn();
const revokeOrganizationInvitation = jest.fn();
const updateOrganizationPolicy = jest.fn();
const updateOrganizationQuota = jest.fn();

jest.mock("@/lib/utils/api", () => ({
    listOrganizations: (...args: unknown[]) => listOrganizations(...args),
    createOrganization: (...args: unknown[]) => createOrganization(...args),
    getOrganizationMembers: (...args: unknown[]) => getOrganizationMembers(...args),
    listOrganizationInvitations: (...args: unknown[]) => listOrganizationInvitations(...args),
    createOrganizationInvitation: (...args: unknown[]) => createOrganizationInvitation(...args),
    revokeOrganizationInvitation: (...args: unknown[]) => revokeOrganizationInvitation(...args),
    updateOrganizationPolicy: (...args: unknown[]) => updateOrganizationPolicy(...args),
    updateOrganizationQuota: (...args: unknown[]) => updateOrganizationQuota(...args),
}));

import OrganizationsPage from "@/app/organizations/page";

function renderWithQuery(ui: React.ReactElement) {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("OrganizationsPage", () => {
    beforeEach(() => {
        listOrganizations.mockReset();
        createOrganization.mockReset();
        getOrganizationMembers.mockReset();
        listOrganizationInvitations.mockReset();
        createOrganizationInvitation.mockReset();
        revokeOrganizationInvitation.mockReset();
        updateOrganizationPolicy.mockReset();
        updateOrganizationQuota.mockReset();
        window.localStorage.clear();
        getOrganizationMembers.mockResolvedValue([]);
        listOrganizationInvitations.mockResolvedValue([]);
    });

    it("loads organizations and creates a new one", async () => {
        listOrganizations
            .mockResolvedValueOnce([])
            .mockResolvedValue([
                {
                    id: "org-1",
                    name: "Acme",
                    slug: "acme",
                    status: "active",
                    createdBy: "u1",
                    createdAt: "2026-08-08T10:00:00.000Z",
                    updatedAt: "2026-08-08T10:00:00.000Z",
                    role: "owner",
                },
            ]);
        createOrganization.mockResolvedValue({
            id: "org-1",
            name: "Acme",
            slug: "acme",
            status: "active",
            createdBy: "u1",
            createdAt: "2026-08-08T10:00:00.000Z",
            updatedAt: "2026-08-08T10:00:00.000Z",
            role: "owner",
        });

        renderWithQuery(<OrganizationsPage />);

        await waitFor(() => {
            expect(listOrganizations).toHaveBeenCalled();
        });

        fireEvent.change(screen.getByTestId("organization-name"), {
            target: { value: "Acme" },
        });
        fireEvent.click(screen.getByTestId("organization-create"));

        await waitFor(() => {
            expect(createOrganization).toHaveBeenCalledWith({
                name: "Acme",
                slug: undefined,
            });
        });
        expect(await screen.findByTestId("organization-option")).toHaveTextContent("Acme");
    });

    it("invites a teammate by email for the active organization", async () => {
        listOrganizations.mockResolvedValue([
            {
                id: "org-1",
                name: "Acme",
                slug: "acme",
                status: "active",
                createdBy: "u1",
                createdAt: "2026-08-08T10:00:00.000Z",
                updatedAt: "2026-08-08T10:00:00.000Z",
                role: "owner",
            },
        ]);
        createOrganizationInvitation.mockResolvedValue({
            id: "inv-1",
            organizationId: "org-1",
            organizationName: "Acme",
            email: "alex@acme.com",
            role: "member",
            status: "pending",
            expiresAt: "2026-09-01T00:00:00.000Z",
            createdAt: "2026-08-25T00:00:00.000Z",
            acceptedAt: null,
            emailSent: true,
        });
        listOrganizationInvitations
            .mockResolvedValueOnce([])
            .mockResolvedValue([
                {
                    id: "inv-1",
                    organizationId: "org-1",
                    organizationName: "Acme",
                    email: "alex@acme.com",
                    role: "member",
                    status: "pending",
                    expiresAt: "2026-09-01T00:00:00.000Z",
                    createdAt: "2026-08-25T00:00:00.000Z",
                    acceptedAt: null,
                },
            ]);

        window.localStorage.setItem("semantask.activeOrganizationId", "org-1");
        renderWithQuery(<OrganizationsPage />);

        await waitFor(() => {
            expect(screen.getByTestId("organization-invite-email")).toBeInTheDocument();
        });

        fireEvent.change(screen.getByTestId("organization-invite-email"), {
            target: { value: "alex@acme.com" },
        });
        fireEvent.click(screen.getByTestId("organization-invite"));

        await waitFor(() => {
            expect(createOrganizationInvitation).toHaveBeenCalledWith("org-1", {
                email: "alex@acme.com",
            });
        });
        expect(await screen.findByText(/Invite sent to alex@acme.com/)).toBeInTheDocument();
    });

    it("does not load members for an invalid stored organization", async () => {
        window.localStorage.setItem("semantask.activeOrganizationId", "missing-org");
        listOrganizations.mockResolvedValue([
            {
                id: "org-1",
                name: "Acme",
                slug: "acme",
                status: "active",
                createdBy: "u1",
                createdAt: "2026-08-08T10:00:00.000Z",
                updatedAt: "2026-08-08T10:00:00.000Z",
                role: "owner",
            },
        ]);

        renderWithQuery(<OrganizationsPage />);

        expect(await screen.findByTestId("organization-option")).toHaveTextContent("Acme");
        await waitFor(() => {
            expect(window.localStorage.getItem("semantask.activeOrganizationId")).toBeNull();
        });
        expect(getOrganizationMembers).not.toHaveBeenCalled();
        expect(screen.queryByTestId("organization-members")).not.toBeInTheDocument();
    });
});
