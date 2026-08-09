import { notFound } from "next/navigation";
import { isWorkInboxUiEnabled } from "@semantask/services/organization-policy.service";
import { InboxSubnav } from "@/components/inbox/inbox-subnav";

export default function InboxLayout({ children }: { children: React.ReactNode }) {
    if (!isWorkInboxUiEnabled()) {
        notFound();
    }

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-6">
            <InboxSubnav />
            {children}
        </div>
    );
}
