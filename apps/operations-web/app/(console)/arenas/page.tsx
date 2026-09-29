import { Building2 } from "lucide-react";
import { GovernanceRoutePage } from "@/components/governance/GovernanceRoutePage";

export default function Page() {
  return <GovernanceRoutePage config={{href:"/arenas",collection:"arenas",eyebrow:"Marketplace",title:"Arenas",description:"Organizer-submitted venues: ownership proof, safety documents, capacity evidence and inspection status.",metricLabel:"Arenas",primaryAction:"Manage",entityType:"arena",intake:"arena",intakeLabel:"Record submission",icon:<Building2 className="h-6 w-6" />}} />;
}
