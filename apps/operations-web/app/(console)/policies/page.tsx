import { Scale } from "lucide-react";
import { GovernanceRoutePage } from "@/components/governance/GovernanceRoutePage";

export default function Page() {
  return <GovernanceRoutePage config={{href:"/policies",collection:"policyVersions",eyebrow:"Control",title:"Policies",description:"Versioned marketplace rules. Every automated and human decision records the policy version it used.",metricLabel:"Policies",primaryAction:"View",readOnly:true,intake:"policy",intakeLabel:"Publish version",icon:<Scale className="h-6 w-6" />}} />;
}
