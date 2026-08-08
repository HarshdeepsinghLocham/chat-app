import {
    WORK_SUGGESTION_STATUSES,
    isWorkSuggestionStatus,
} from "../../types/work/suggestion";

describe("WorkSuggestion types", () => {
    it("accepts only Phase 1 suggestion statuses", () => {
        for (const status of WORK_SUGGESTION_STATUSES) {
            expect(isWorkSuggestionStatus(status)).toBe(true);
        }

        expect(isWorkSuggestionStatus("pending")).toBe(false);
        expect(isWorkSuggestionStatus("proposed ")).toBe(false);
        expect(isWorkSuggestionStatus(null)).toBe(false);
        expect(isWorkSuggestionStatus(undefined)).toBe(false);
        expect(isWorkSuggestionStatus(1)).toBe(false);
    });
});
