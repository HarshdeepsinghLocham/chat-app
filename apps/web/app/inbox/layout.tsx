import {
    isCoordinationBoardEnabled,
    isOrgDashboardEnabled,
} from "@semantask/services/organization-policy.service";
import { InboxSubnav } from "@/components/inbox/inbox-subnav";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { WorkSearchBox } from "@/components/work/work-search-box";

export default function InboxLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <InboxSubnav
                    boardEnabled={isCoordinationBoardEnabled()}
                    dashboardEnabled={isOrgDashboardEnabled()}
                />
                <OrganizationSwitcher />
                <WorkSearchBox />
            </div>
            {children}
        </div>
    );
}
