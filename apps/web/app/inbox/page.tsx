import { notFound } from "next/navigation";
import { isWorkInboxUiEnabled } from "@semantask/services/organization-policy.service";
import { WorkInboxView } from "@/components/work-suggestions/work-inbox";

/** Deploy-time WORK_INBOX_UI must be read per request, not baked at build. */
export const dynamic = "force-dynamic";

export default function WorkInboxPage() {
    if (!isWorkInboxUiEnabled()) {
        notFound();
    }

    return <WorkInboxView />;
}
