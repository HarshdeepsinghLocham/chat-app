import {
    isCoordinationBoardEnabled,
    isOrgDashboardEnabled,
} from "@semantask/services/organization-policy.service";
import { InboxSubnav } from "@/components/inbox/inbox-subnav";

export default function InboxLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <InboxSubnav
                boardEnabled={isCoordinationBoardEnabled()}
                dashboardEnabled={isOrgDashboardEnabled()}
            />
            {children}
        </div>
    );
}
