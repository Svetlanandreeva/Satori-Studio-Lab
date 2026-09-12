import { AssistantDashboard } from "@/components/assistant/AssistantDashboard";
import { DailyBriefPanel } from "@/components/assistant/DailyBriefPanel";

export const dynamic = "force-dynamic";

export default function AssistantPage() {
  return (
    <div className="space-y-6">
      <DailyBriefPanel />
      <AssistantDashboard />
    </div>
  );
}
