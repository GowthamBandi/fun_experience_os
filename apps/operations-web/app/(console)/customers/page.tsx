import { SearchCheck } from "lucide-react";
import { GovernanceRoutePage } from "@/components/governance/GovernanceRoutePage";

export default function Page() {
  return <GovernanceRoutePage config={{href:"/customers",collection:"customers",eyebrow:"Marketplace",title:"Customers",description:"Aggregated customer cohorts, complaint rates and protection outcomes. No individual identity data is shown here.",metricLabel:"Cohorts",primaryAction:"View",readOnly:true,icon:<SearchCheck className="h-6 w-6" />}} />;
}
