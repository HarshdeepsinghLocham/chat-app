/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { DEEP_LINK_HIGHLIGHT_CLASS, scrollDeepLinkTarget } from "@/lib/deep-link-highlight";

describe("deep-link highlight", () => {
    it("targets an existing message bubble id with scrollIntoView", () => {
        document.body.innerHTML = `<div id="msg-1" class="${DEEP_LINK_HIGHLIGHT_CLASS}"></div>`;
        const element = document.getElementById("msg-1");
        if (!element) {
            throw new Error("expected fixture node");
        }
        element.scrollIntoView = jest.fn();

        expect(scrollDeepLinkTarget("msg-1")).toBe(true);
        expect(element.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
        expect(scrollDeepLinkTarget("missing-msg")).toBe(false);
    });

    it("does not throw when scrollIntoView is missing (jsdom custom elements)", () => {
        document.body.innerHTML = `<div id="msg-2"></div>`;
        const element = document.getElementById("msg-2");
        if (!element) {
            throw new Error("expected fixture node");
        }
        Object.defineProperty(element, "scrollIntoView", { value: undefined });
        expect(scrollDeepLinkTarget("msg-2")).toBe(true);
    });
});
