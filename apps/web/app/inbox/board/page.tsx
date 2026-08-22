import { notFound } from "next/navigation";
import { isCoordinationBoardEnabled } from "@semantask/services/organization-policy.service";
import { WorkBoardView } from "@/components/work-board/work-board";

/** Deploy-time COORDINATION_BOARD must be read per request, not baked at build. */
export const dynamic = "force-dynamic";

export default function WorkBoardPage() {
    if (!isCoordinationBoardEnabled()) {
        notFound();
    }

    return <WorkBoardView />;
}
