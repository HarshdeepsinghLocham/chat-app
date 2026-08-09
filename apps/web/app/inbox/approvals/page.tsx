import { notFound } from "next/navigation";
import { isWorkInboxUiEnabled } from "@semantask/services/organization-policy.service";
import { InboxApprovalsView } from "@/components/work-suggestions/inbox-approvals";

export default function InboxApprovalsPage() {
    if (!isWorkInboxUiEnabled()) {
        notFound();
    }

    return <InboxApprovalsView />;
}
