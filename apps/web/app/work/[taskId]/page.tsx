"use client";

import { useParams } from "next/navigation";
import { WorkTaskDetailView } from "@/components/work/work-task-detail";

export default function WorkTaskPage() {
    const params = useParams<{ taskId: string }>();
    const taskId = typeof params?.taskId === "string" ? params.taskId : "";
    return <WorkTaskDetailView taskId={taskId} />;
}
