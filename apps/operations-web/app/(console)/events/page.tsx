import { Ticket } from "lucide-react";
import { GovernanceRoutePage } from "@/components/governance/GovernanceRoutePage";

export default function Page() {
  return <GovernanceRoutePage config={{href:"/events",collection:"events",eyebrow:"Marketplace",title:"Events",description:"Event proposals and published events. Review pricing, refund terms and arena readiness; pause ticket sales when customers need protection.",metricLabel:"Events",primaryAction:"Manage",entityType:"event",intake:"event",intakeLabel:"Record proposal",icon:<Ticket className="h-6 w-6" />}} />;
}
