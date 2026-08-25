import { Suspense } from "react";
import { WorkInboxView } from "@/components/work-suggestions/work-inbox";

export const dynamic = "force-dynamic";

export default function WorkInboxPage() {
    return (
        <Suspense fallback={null}>
            <WorkInboxView />
        </Suspense>
    );
}
