import { HandCoins } from "lucide-react";
import { GovernanceRoutePage } from "@/components/governance/GovernanceRoutePage";

export default function Page() {
  return <GovernanceRoutePage config={{href:"/settlements",collection:"settlementControls",eyebrow:"Finance",title:"Settlements",description:"Organizer payouts: reconciliation, holds, reserves and releases. Releases are approved through the Approvals queue.",metricLabel:"Settlements",primaryAction:"View",readOnly:true,icon:<HandCoins className="h-6 w-6" />}} />;
}
