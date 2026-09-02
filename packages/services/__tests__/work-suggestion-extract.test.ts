import { describe, expect, it } from "@jest/globals";
import {
    buildConfidenceSignals,
    distillWorkSuggestion,
    distillWorkTitle,
    inferSuggestedTool,
    normalizeWorkTitleKey,
    resolveSuggestionExecutionPolicy,
} from "../work-suggestion-extract";

describe("work-suggestion-extract", () => {
    describe("distillWorkTitle", () => {
        it("distills the welcome-email request into a work title", () => {
            expect(
                distillWorkTitle(
                    "Send a professional welcome email to the new hire by Friday.",
                    "send"
                )
            ).toBe("Send welcome email to new hire");
        });

        it("strips create-a-task meta phrasing", () => {
            expect(
                distillWorkTitle("Please create a task to send the welcome email", "send")
            ).toBe("Send welcome email");
        });

        it("does not emit create-a-task titles", () => {
            const title = distillWorkTitle(
                "Please create a task to send the welcome email by Friday.",
                "send"
            );
            expect(title.toLowerCase()).not.toMatch(/create a task to/);
        });
    });

    describe("distillWorkSuggestion", () => {
        it("builds outcome, tool, signals, and summary for the welcome-email request", () => {
            const distilled = distillWorkSuggestion({
                content: "Send a professional welcome email to the new hire by Friday.",
                actionVerb: "send",
                objectText: "a professional welcome email to the new hire",
                dueAtCandidate: new Date("2026-08-28T00:00:00.000Z"),
            });

            expect(distilled.title).toBe("Send welcome email to new hire");
            expect(distilled.requestedOutcome.toLowerCase()).toContain("welcome email");
            expect(distilled.requestedOutcome.toLowerCase()).toContain("new hire");
            expect(distilled.requestedOutcome.toLowerCase()).toContain("friday");
            expect(distilled.summary).toMatch(/^Requested outcome:/);
            expect(distilled.suggestedTool).toBe("send_email");
            expect(distilled.confidenceSignals).toEqual([
                "explicit_action",
                "recipient_or_object",
                "deadline",
            ]);
            expect(distilled.titleKey).toBe(normalizeWorkTitleKey(distilled.title));
        });
    });

    describe("inferSuggestedTool", () => {
        it("maps send+email to send_email", () => {
            expect(inferSuggestedTool("Send a welcome email to the new hire", "send"))
                .toBe("send_email");
        });

        it("maps github issue language", () => {
            expect(inferSuggestedTool("Create a GitHub issue for the auth bug", "create"))
                .toBe("create_github_issue");
        });

        it("maps schedule meeting language", () => {
            expect(inferSuggestedTool("Schedule a meeting with Alice tomorrow", "schedule"))
                .toBe("schedule_meeting");
        });

        it("returns null when no tool is identifiable", () => {
            expect(inferSuggestedTool("Follow up with the team about launch", "follow"))
                .toBeNull();
        });
    });

    describe("buildConfidenceSignals", () => {
        it("omits chain-of-thought and only uses extracted facts", () => {
            expect(buildConfidenceSignals({
                actionVerb: "send",
                objectText: "welcome email",
                dueAtCandidate: null,
                suggestedTool: "send_email",
            })).toEqual(["explicit_action", "recipient_or_object"]);
        });
    });

    describe("resolveSuggestionExecutionPolicy", () => {
        it("requires approval for send_email", () => {
            expect(resolveSuggestionExecutionPolicy({
                tool: "send_email",
                executionMode: "auto_execute",
            })).toBe("approval_required");
        });

        it("allows auto-execute for github issues when mode is auto_execute", () => {
            expect(resolveSuggestionExecutionPolicy({
                tool: "create_github_issue",
                executionMode: "auto_execute",
            })).toBe("auto_execute_allowed");
        });

        it("marks denied tools prohibited", () => {
            expect(resolveSuggestionExecutionPolicy({
                tool: "send_email",
                toolDenyList: ["send_email"],
                executionMode: "require_approval",
            })).toBe("prohibited");
        });

        it("stamps approval_required under suggest_only", () => {
            expect(resolveSuggestionExecutionPolicy({
                tool: "create_github_issue",
                executionMode: "suggest_only",
            })).toBe("approval_required");
        });
    });
});
