import { notFound } from "next/navigation";
import { isCoordinationBoardEnabled, isOrgDashboardEnabled } from "@semantask/services/organization-policy.service";
import { WorkDashboardView } from "@/components/work-summary/work-dashboard";

/** Deploy-time ORG_DASHBOARD must be read per request, not baked at build. */
export const dynamic = "force-dynamic";

export default function WorkDashboardPage() {
    if (!isOrgDashboardEnabled()) {
        notFound();
    }

    return <WorkDashboardView boardEnabled={isCoordinationBoardEnabled()} />;
}
