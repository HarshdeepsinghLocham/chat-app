import { notFound } from "next/navigation";
import { isWorkInboxUiEnabled } from "@semantask/services/organization-policy.service";
import { InboxApprovalsView } from "@/components/work-suggestions/inbox-approvals";

/** Deploy-time WORK_INBOX_UI must be read per request, not baked at build. */
export const dynamic = "force-dynamic";

export default function InboxApprovalsPage() {
    if (!isWorkInboxUiEnabled()) {
        notFound();
    }

    return <InboxApprovalsView />;
}
