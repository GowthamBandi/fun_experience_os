import { ReceiptIndianRupee } from "lucide-react";
import { GovernanceRoutePage } from "@/components/governance/GovernanceRoutePage";

export default function Page() {
  return <GovernanceRoutePage config={{href:"/refunds",collection:"refundCases",eyebrow:"Finance",title:"Refund cases",description:"Bulk cancellation refunds and policy exceptions. Approve refund exceptions from the Approvals queue.",metricLabel:"Refund cases",primaryAction:"View",readOnly:true,icon:<ReceiptIndianRupee className="h-6 w-6" />}} />;
}
