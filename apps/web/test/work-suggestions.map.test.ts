import { describe, expect, it } from "@jest/globals";
import {
    buildSuggestionIdByMessageId,
    reviewSuggestionHref,
} from "@/lib/work-suggestions/map";

describe("work-suggestions map helpers", () => {
    it("maps messageId to first suggestion id", () => {
        const map = buildSuggestionIdByMessageId([
            { _id: "s1", messageId: "m1" },
            { _id: "s2", messageId: "m2" },
            { _id: "s3", messageId: "m1" },
        ]);
        expect(map).toEqual({ m1: "s1", m2: "s2" });
    });

    it("returns empty map for empty input", () => {
        expect(buildSuggestionIdByMessageId([])).toEqual({});
    });

    it("builds review deep-link href only when id present", () => {
        expect(reviewSuggestionHref("abc123")).toBe("/work-suggestions/abc123");
        expect(reviewSuggestionHref(null)).toBeNull();
        expect(reviewSuggestionHref(undefined)).toBeNull();
        expect(reviewSuggestionHref("")).toBeNull();
    });
});
