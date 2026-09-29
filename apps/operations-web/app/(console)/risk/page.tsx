import { TriangleAlert } from "lucide-react";
import { GovernanceRoutePage } from "@/components/governance/GovernanceRoutePage";

export default function Page() {
  return <GovernanceRoutePage config={{href:"/risk",collection:"riskAlerts",eyebrow:"Trust & Safety",title:"Risk",description:"Fraud signals, chargeback spikes and linked-entity investigations. Resolve an alert only with evidence.",metricLabel:"Alerts",primaryAction:"Investigate",entityType:"risk-alert",icon:<TriangleAlert className="h-6 w-6" />}} />;
}
