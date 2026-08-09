import { notFound } from "next/navigation";
import { isWorkInboxUiEnabled } from "@semantask/services/organization-policy.service";
import { WorkInboxView } from "@/components/work-suggestions/work-inbox";

export default function WorkInboxPage() {
    if (!isWorkInboxUiEnabled()) {
        notFound();
    }

    return <WorkInboxView />;
}
