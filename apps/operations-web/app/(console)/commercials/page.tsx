import { BadgeIndianRupee } from "lucide-react";
import { GovernanceRoutePage } from "@/components/governance/GovernanceRoutePage";

export default function Page() {
  return <GovernanceRoutePage config={{href:"/commercials",collection:"commercialAgreements",eyebrow:"Finance",title:"Commercials",description:"Commission terms and contract versions with effective dates. Exceptional rates go through Approvals.",metricLabel:"Agreements",primaryAction:"View",readOnly:true,intake:"commission",intakeLabel:"Propose terms",icon:<BadgeIndianRupee className="h-6 w-6" />}} />;
}
