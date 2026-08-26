"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_LINKS = [
    { href: "/inbox", label: "Suggestions", testId: "inbox-nav-suggestions" },
    { href: "/inbox/approvals", label: "Approvals", testId: "inbox-nav-approvals" },
] as const;

function isActive(pathname: string, href: string) {
    if (href === "/inbox") {
        return pathname === "/inbox";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function InboxSubnav({ boardEnabled = false }: { boardEnabled?: boolean }) {
    const pathname = usePathname() ?? "";
    const links = boardEnabled
        ? [...BASE_LINKS, { href: "/inbox/board", label: "Board", testId: "inbox-nav-board" }]
        : [...BASE_LINKS];

    return (
        <nav
            className="flex flex-wrap gap-4 border-b border-border pb-3 text-sm"
            aria-label="Work inbox sections"
            data-testid="inbox-subnav"
        >
            {links.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        data-testid={link.testId}
                        aria-current={active ? "page" : undefined}
                        className={
                            active
                                ? "font-semibold text-foreground underline"
                                : "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        }
                    >
                        {link.label}
                    </Link>
                );
            })}
        </nav>
    );
}
