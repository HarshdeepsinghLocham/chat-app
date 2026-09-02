import { describe, expect, it } from "@jest/globals";
import {
    boardTaskHref,
    conversationFocusHref,
    conversationMessageHref,
    inboxSuggestionHref,
    taskHref,
} from "@/lib/work-links";

describe("work-links href helpers", () => {
    it("builds conversation hrefs with optional msg and task params", () => {
        expect(conversationMessageHref("conv-1")).toBe("/c/conv-1");
        expect(conversationMessageHref("conv-1", "msg-1")).toBe("/c/conv-1?msg=msg-1");
        expect(conversationFocusHref("conv-1", { task: "task-1" })).toBe("/c/conv-1?task=task-1");
        expect(conversationFocusHref("conv-1", { msg: "msg-1", task: "task-1" })).toBe(
            "/c/conv-1?msg=msg-1&task=task-1"
        );
    });

    it("builds task, inbox, and board hrefs", () => {
        expect(taskHref("task-1")).toBe("/work/task-1");
        expect(inboxSuggestionHref("sug-1")).toBe("/inbox?suggestion=sug-1");
        expect(inboxSuggestionHref("sug-1", "conv-1")).toBe(
            "/inbox?suggestion=sug-1&conversationId=conv-1"
        );
        expect(boardTaskHref("task-1")).toBe("/inbox/board?task=task-1");
        expect(boardTaskHref("task-1", "conv-1")).toBe(
            "/inbox/board?task=task-1&conversationId=conv-1"
        );
    });
});
