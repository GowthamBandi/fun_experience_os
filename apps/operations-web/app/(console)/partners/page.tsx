import { Users } from "lucide-react";
import { GovernanceRoutePage } from "@/components/governance/GovernanceRoutePage";

export default function Page() {
  return <GovernanceRoutePage config={{href:"/partners",collection:"organizers",eyebrow:"Marketplace",title:"Organizers",description:"Verified event managers and organizers: access state, commercial terms and performance. Pausing or blocking takes effect immediately.",metricLabel:"Organizers",primaryAction:"Manage",entityType:"organizer",intake:"organizer",intakeLabel:"Record application",icon:<Users className="h-6 w-6" />}} />;
}
