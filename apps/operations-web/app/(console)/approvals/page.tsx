import { ClipboardCheck } from "lucide-react";
import { GovernanceRoutePage } from "@/components/governance/GovernanceRoutePage";

export default function Page() {
  return <GovernanceRoutePage config={{href:"/approvals",collection:"governanceCases",eyebrow:"Marketplace",title:"Approvals",description:"One governed queue for organizer access, arena verification, event policy, commissions and financial exceptions. Every decision is versioned and audited.",metricLabel:"Cases",primaryAction:"Review",icon:<ClipboardCheck className="h-6 w-6" />}} />;
}
