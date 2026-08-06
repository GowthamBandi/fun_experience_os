"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip, Badge } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Stagger, Item, Tide } from "@/components/motion/Motion";
import { canPerformSafetyAction } from "@/lib/safety/access";
import {
  incidentRows,
  incidentDetail,
  incidentTriageQueue,
  criticalActiveIncidents,
  overdueFollowUps,
  safetyCommandMetrics
} from "@/lib/prototype/selectors/safety";
import { disputeRows, disputeDetail } from "@/lib/prototype/selectors/disputes";
import { refundExceptionQueue } from "@/lib/prototype/selectors/moderation";
import {
  AlertTriangle,
  FileText,
  UserCheck,
  DollarSign,
  Plus,
  Scale,
  ShieldAlert,
  Clock,
  CheckCircle,
  HelpCircle,
  Eye
} from "lucide-react";

export default function SafetyHubPage() {
  const {
    state,
    territory,
    canAccess,
    hydrated,
    role,
    operator,
    // Safety
    acknowledgeIncident,
    triageIncident,
    assignInvestigator,
    escalateIncident,
    resolveIncident,
    closeIncident,
    addEvidencePlaceholder,
    createFollowUp,
    // Disputes
    assignDisputeReviewer,
    decideDispute,
    closeDispute,
    // Moderation
    proposeModerationAction,
    approveModerationAction,
    rejectModerationAction,
    revokeModerationAction,
    // Refund Exceptions
    approveRefundException,
    rejectRefundException,
    recommendRefundException
  } = useStore();

  const [activeTab, setActiveTab] = useState<"incidents" | "disputes" | "moderation" | "refunds">("incidents");

  // Selected details
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Form toggles & states
  const [showTriageForm, setShowTriageForm] = useState(false);
  const [severityReview, setSeverityReview] = useState("medium");
  const [riskAssessment, setRiskAssessment] = useState("");
  const [recommendation, setRecommendation] = useState("");

  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [evidenceType, setEvidenceType] = useState<any>("image-placeholder");
  const [evidenceSensitivity, setEvidenceSensitivity] = useState<any>("medium");

  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [followUpOwner, setFollowUpOwner] = useState("");
  const [followUpDue, setFollowUpDue] = useState("Tomorrow");

  const [showDisputeDecisionForm, setShowDisputeDecisionForm] = useState(false);
  const [disputeDecisionText, setDisputeDecisionText] = useState("");
  const [disputeDecisionReason, setDisputeDecisionReason] = useState("");
  const [disputeUpheld, setDisputeUpheld] = useState(true);

  const [showModProposalForm, setShowModProposalForm] = useState(false);
  const [modActionType, setModActionType] = useState<any>("formal-warning");
  const [modActionReason, setModActionReason] = useState("");
  const [modActionScope, setModActionScope] = useState<any>("tournament");
  const [modActionExpiry, setModActionExpiry] = useState("Next week");

  const [showRexProposalForm, setShowRexProposalForm] = useState(false);
  const [rexAmount, setRexAmount] = useState("299");
  const [rexReason, setRexReason] = useState<any>("safety-incident");
  const [rexNotes, setRexNotes] = useState("");

  // Lists & derived values
  const iRows = useMemo(() => incidentRows(state, territory.id), [state, territory.id]);
  const triageQueue = useMemo(() => incidentTriageQueue(state, territory.id), [state, territory.id]);
  const criticalActive = useMemo(() => criticalActiveIncidents(state, territory.id), [state, territory.id]);
  const overdueLogs = useMemo(() => overdueFollowUps(state, territory.id), [state, territory.id]);
  const metrics = useMemo(() => safetyCommandMetrics(state, territory.id), [state, territory.id]);

  const dRows = useMemo(() => disputeRows(state, territory.id), [state, territory.id]);
  const rexQueue = useMemo(() => refundExceptionQueue(state, territory.id), [state, territory.id]);

  const detailI = useMemo(() => selectedIncidentId ? incidentDetail(state, selectedIncidentId) : null, [state, selectedIncidentId]);
  const detailD = useMemo(() => selectedDisputeId ? disputeDetail(state, selectedDisputeId) : null, [state, selectedDisputeId]);

  if (!hydrated) return <div className="p-8 text-center"><Tide /></div>;
  if (!canAccess("/safety")) return <div className="p-8 text-center"><PermissionDenied module="Safety & Moderation" /></div>;

  const crew = state.crew ?? [];

  // Helper checks for authority with visual warning banner
  const hasSafetyAccess = (action: any) => canPerformSafetyAction(role.id, action);

  const handleAcknowledge = (id: string) => {
    if (!hasSafetyAccess("triage-incident")) return;
    acknowledgeIncident(id);
  };

  const handleTriageSubmit = () => {
    if (!selectedIncidentId || !hasSafetyAccess("triage-incident")) return;
    triageIncident({
      incidentId: selectedIncidentId,
      triageSeverityReview: severityReview,
      triageImmediateRisk: riskAssessment,
      triageVenueImpact: "Standard",
      triageSessionImpact: "Standard",
      triageProtectionActions: "Monitored",
      triageRecommendation: recommendation
    });
    setShowTriageForm(false);
  };

  const handleAssignInvestigatorSubmit = (id: string, invId: string) => {
    if (!hasSafetyAccess("assign-investigator")) return;
    assignInvestigator(id, invId);
  };

  const handleEscalateIncidentSubmit = (id: string) => {
    if (!hasSafetyAccess("escalate-incident")) return;
    escalateIncident(id, "Escalated to HQ Operations and venue safety coordinator.");
  };

  const handleResolveIncidentSubmit = (id: string) => {
    if (!hasSafetyAccess("close-incident")) return;
    resolveIncident(id, "Investigation completed. Immediate hazards mitigated and review conducted.");
  };

  const handleCloseIncidentSubmit = (id: string) => {
    if (!hasSafetyAccess("close-incident")) return;
    closeIncident(id, "Incident closed officially. All follow-ups satisfied.");
    setSelectedIncidentId(null);
  };

  const handleEvidenceSubmit = () => {
    if (!selectedIncidentId || !evidenceLabel) return;
    addEvidencePlaceholder({
      incidentId: selectedIncidentId,
      type: evidenceType,
      label: evidenceLabel,
      sensitivity: evidenceSensitivity
    });
    setShowEvidenceForm(false);
    setEvidenceLabel("");
  };

  const handleFollowUpSubmit = () => {
    if (!selectedIncidentId || !followUpOwner) return;
    createFollowUp(selectedIncidentId, followUpOwner, followUpDue);
    setShowFollowUpForm(false);
  };

  const handleAssignDisputeReviewerSubmit = (id: string) => {
    assignDisputeReviewer(id, operator?.id || "op-master");
  };

  const handleDecideDisputeSubmit = () => {
    if (!selectedDisputeId || !disputeDecisionText || !disputeDecisionReason) return;
    decideDispute({
      disputeId: selectedDisputeId,
      decision: disputeDecisionText,
      decisionReason: disputeDecisionReason,
      upheld: disputeUpheld
    });
    setShowDisputeDecisionForm(false);
    setDisputeDecisionText("");
    setDisputeDecisionReason("");
  };

  const handleCloseDisputeSubmit = (id: string) => {
    closeDispute(id);
    setSelectedDisputeId(null);
  };

  const handleProposeModSubmit = (caseId: string, subjectId: string) => {
    if (!modActionReason) return;
    proposeModerationAction({
      caseId,
      type: modActionType,
      subjectTemporaryId: subjectId,
      reason: modActionReason,
      scope: modActionScope,
      scopeEntityId: territory.id,
      effectiveDate: "Today",
      expiryDate: modActionExpiry
    });
    setShowModProposalForm(false);
    setModActionReason("");
  };

  const handleApproveActionSubmit = (actId: string, type: string) => {
    const actionKey = type === "permanent-ban" ? "approve-moderation-ban" : "approve-moderation-suspension";
    if (!hasSafetyAccess(actionKey as any)) {
      alert("Validation Error: You do not have the required operational clearance role for this action.");
      return;
    }
    approveModerationAction(actId);
  };

  const handleRejectActionSubmit = (actId: string) => {
    rejectModerationAction(actId, "Rejected during operational triage review.");
  };

  const handleRecommendRexSubmit = () => {
    if (!selectedIncidentId) return;
    recommendRefundException({
      incidentId: selectedIncidentId,
      reason: rexReason,
      amount: parseInt(rexAmount, 10) || 0,
      notes: rexNotes
    });
    setShowRexProposalForm(false);
    setRexNotes("");
  };

  const handleApproveRexSubmit = (id: string) => {
    if (!hasSafetyAccess("approve-refund-exception")) {
      alert("Finance clearance role required to approve exceptions.");
      return;
    }
    approveRefundException(id);
  };

  const handleRejectRexSubmit = (id: string) => {
    rejectRefundException(id, "Rejected - standard cancellation policy applies.");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      {/* Title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          overline={`Operations Control · ${territory.name}`}
          title="Safety & Disputes Hub"
          sub="Triage safety incidents, review player disputes, and authorize exceptions."
        />
        {/* Alerts mini bar */}
        <div className="flex gap-2">
          {criticalActive.length > 0 && (
            <Badge className="bg-danger/10 border border-danger/30 text-danger animate-pulse gap-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              {criticalActive.length} Critical
            </Badge>
          )}
          {triageQueue.length > 0 && (
            <Badge className="bg-warning/10 border border-warning/30 text-[#ffd28a] gap-1">
              <Clock className="h-3.5 w-3.5" />
              {triageQueue.length} Pending Triage
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 overflow-x-auto gap-4">
        {[
          { id: "incidents", label: "Safety Incidents", icon: ShieldAlert },
          { id: "disputes", label: "Disputes Log", icon: Scale },
          { id: "moderation", label: "Moderation Cases", icon: UserCheck },
          { id: "refunds", label: "Refund Exceptions", icon: DollarSign }
        ].map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-3 py-2 border-b-2 text-xs font-semibold transition-all ${
                active ? "border-brand text-brand" : "border-transparent text-ink-mut hover:text-ink-sec"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="mt-4">
        {activeTab === "incidents" && (
          <div className="grid md:grid-cols-[1fr_350px] gap-6 items-start">
            {/* List */}
            <div className="space-y-4">
              <PanelHeader title="Safety Log" sub="Recent incident reports in the active territory." />
              {iRows.length === 0 ? (
                <p className="text-xs text-ink-mut">No safety records logged.</p>
              ) : (
                <div className="space-y-3">
                  {iRows.map((i) => (
                    <div
                      key={i.id}
                      onClick={() => {
                        setSelectedIncidentId(i.id);
                        setSelectedDisputeId(null);
                      }}
                      className={`rounded-panel glass p-4 border transition-all cursor-pointer text-left ${
                        selectedIncidentId === i.id ? "border-brand bg-brand/5" : "border-white/5 bg-white/2 hover:bg-white/4"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink-lum">{i.incidentCode}</span>
                          <Badge className={i.severity === "critical" ? "bg-danger/20 text-danger border-danger/30" : "bg-white/8 text-ink-sec"}>
                            {i.severity}
                          </Badge>
                        </div>
                        <StatusChip value={i.status} />
                      </div>
                      <p className="text-[10px] text-ink-mut mt-1">{i.venueName} · {i.sessionTitle} · {i.reportedAt}</p>
                      <p className="text-xs text-ink-sec mt-2 font-semibold">Immediate: {i.immediateAction}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detail Drawer Side */}
            <div className="space-y-4">
              <PanelHeader title="Incident Workspace" sub="Mitigate risk and record resolutions." />
              {detailI ? (
                <Card className="p-4 space-y-4 border border-white/5">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-sm font-bold text-ink-lum">{detailI.incidentCode}</h4>
                      <span className="text-[10px] text-ink-mut">{detailI.reportedAt} by {detailI.reportedBy}</span>
                    </div>
                    <StatusChip value={detailI.status} />
                  </div>

                  <div className="solid rounded-xl p-3 space-y-2 text-xs">
                    <p><strong>Category:</strong> {detailI.category}</p>
                    <p><strong>Severity:</strong> {detailI.severity}</p>
                    <p><strong>Involved:</strong> {detailI.participantTemporaryIds?.join(", ") || "None"}</p>
                    <p><strong>Immediate Action:</strong> {detailI.immediateAction}</p>
                    <p><strong>Notes:</strong> {detailI.notes}</p>
                  </div>

                  {/* Actions Drawer */}
                  <div className="space-y-2">
                    {detailI.status === "reported" && (
                      <Button onClick={() => handleAcknowledge(detailI.id)} className="w-full">
                        Acknowledge Incident
                      </Button>
                    )}

                    {detailI.status === "acknowledged" && (
                      <Button onClick={() => {
                        setShowTriageForm(true);
                        setSeverityReview(detailI.severity || "medium");
                      }} className="w-full">
                        Perform Risk Triage
                      </Button>
                    )}

                    {detailI.status === "triaged" && (
                      <div className="space-y-2 border-t border-white/5 pt-2">
                        <Field label="Assign Lead Investigator">
                          <Select value={detailI.investigatorId || ""} onChange={(e) => handleAssignInvestigatorSubmit(detailI.id, e.target.value)}>
                            <option value="">Choose investigator...</option>
                            {crew.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    )}

                    {detailI.status === "investigating" && (
                      <div className="space-y-2">
                        <Button onClick={() => handleEscalateIncidentSubmit(detailI.id)} variant="secondary" className="w-full border-danger/30 text-danger bg-danger/5">
                          Escalate to Venue Management
                        </Button>
                        <Button onClick={() => handleResolveIncidentSubmit(detailI.id)} className="w-full">
                          Resolve Incident
                        </Button>
                      </div>
                    )}

                    {detailI.status === "resolved" && (
                      <Button onClick={() => handleCloseIncidentSubmit(detailI.id)} className="w-full bg-[#12b76a] hover:bg-[#10a35e] text-white">
                        Verify & Close Case
                      </Button>
                    )}

                    {/* Exception Refund Recommendation Option */}
                    {(detailI.status !== "closed") && (
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setShowEvidenceForm(true)} className="flex-1 text-xs h-8">
                          Add Evidence
                        </Button>
                        <Button variant="secondary" onClick={() => setShowFollowUpForm(true)} className="flex-1 text-xs h-8">
                          Create Follow Up
                        </Button>
                        <Button variant="secondary" onClick={() => setShowRexProposalForm(true)} className="flex-1 text-xs h-8">
                          Recommend Refund
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Evidence Attachments Placeholder Log */}
                  {detailI.evidence && detailI.evidence.length > 0 && (
                    <div className="border-t border-white/5 pt-3 space-y-2">
                      <span className="block text-[10px] text-ink-mut overline">Evidence Files (No uploads)</span>
                      <div className="space-y-1">
                        {detailI.evidence.map((ev: any) => (
                          <div key={ev.id} className="flex justify-between items-center text-[10px] bg-white/4 p-1.5 rounded border border-white/5">
                            <span className="truncate text-ink-sec">{ev.label} ({ev.type})</span>
                            <span className="text-brand font-mono">{ev.placeholderFileName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow ups */}
                  {detailI.followUpOwnerId && (
                    <div className="border-t border-white/5 pt-3 text-[10px] text-ink-mut">
                      <p><strong>Follow up owner:</strong> {detailI.followUpOwnerId} · <strong>Due:</strong> {detailI.followUpDueAt}</p>
                    </div>
                  )}
                </Card>
              ) : (
                <Card className="p-8 text-center text-xs text-ink-mut">
                  Select an incident from the log to mitigation triage.
                </Card>
              )}
            </div>

            {/* Incident triage dialog */}
            {showTriageForm && (
              <Card className="p-4 border border-brand bg-brand/5 max-w-md mx-auto space-y-4">
                <PanelHeader title="Triage Incident Case" sub="Assess risk levels and protective recommendations." />
                <Field label="Triage Severity Rating">
                  <Select value={severityReview} onChange={(e) => setSeverityReview(e.target.value)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </Select>
                </Field>
                <Field label="Immediate Risk Assessment">
                  <Input placeholder="Describe risk of recurrence..." value={riskAssessment} onChange={(e) => setRiskAssessment(e.target.value)} />
                </Field>
                <Field label="Triage Recommendation">
                  <Input placeholder="Describe required follow-up actions..." value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />
                </Field>
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => setShowTriageForm(false)}>Cancel</Button>
                  <Button onClick={handleTriageSubmit} disabled={!riskAssessment || !recommendation}>Complete Triage</Button>
                </div>
              </Card>
            )}

            {/* Evidence attachment placeholder dialog */}
            {showEvidenceForm && (
              <Card className="p-4 border border-brand bg-brand/5 max-w-md mx-auto space-y-4">
                <PanelHeader title="Add Evidence Record" sub="Create descriptive placeholder metadata for incident files." />
                <Field label="Evidence Label / Title">
                  <Input placeholder="e.g. Broken bat close-up photo" value={evidenceLabel} onChange={(e) => setEvidenceLabel(e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Type">
                    <Select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value as any)}>
                      <option value="image-placeholder">Photo Image</option>
                      <option value="video-placeholder">Video File</option>
                      <option value="witness-statement">Witness Statement text</option>
                      <option value="staff-note">Staff Note log</option>
                    </Select>
                  </Field>
                  <Field label="Sensitivity">
                    <Select value={evidenceSensitivity} onChange={(e) => setEvidenceSensitivity(e.target.value as any)}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="restricted">Restricted</option>
                    </Select>
                  </Field>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => setShowEvidenceForm(false)}>Cancel</Button>
                  <Button onClick={handleEvidenceSubmit} disabled={!evidenceLabel}>Add Entry</Button>
                </div>
              </Card>
            )}

            {/* Follow up creation dialog */}
            {showFollowUpForm && (
              <Card className="p-4 border border-brand bg-brand/5 max-w-md mx-auto space-y-4">
                <PanelHeader title="Create Operational Follow Up" sub="Assign ownership and due dates." />
                <Field label="Assign Actionee (Crew ID)">
                  <Select value={followUpOwner} onChange={(e) => setFollowUpOwner(e.target.value)}>
                    <option value="">Select crew...</option>
                    {crew.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Due Date Description">
                  <Input placeholder="e.g. Tomorrow, 18:00 or Next Friday" value={followUpDue} onChange={(e) => setFollowUpDue(e.target.value)} />
                </Field>
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => setShowFollowUpForm(false)}>Cancel</Button>
                  <Button onClick={handleFollowUpSubmit} disabled={!followUpOwner}>Assign Follow-up</Button>
                </div>
              </Card>
            )}

            {/* Propose Refund Exception Dialog */}
            {showRexProposalForm && (
              <Card className="p-4 border border-brand bg-brand/5 max-w-md mx-auto space-y-4">
                <PanelHeader title="Propose Exception Refund" sub="Finance review required." />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Refund Amount (₹)">
                    <Input type="number" value={rexAmount} onChange={(e) => setRexAmount(e.target.value)} />
                  </Field>
                  <Field label="Refund Reason">
                    <Select value={rexReason} onChange={(e) => setRexReason(e.target.value as any)}>
                      <option value="safety-incident">Safety Incident</option>
                      <option value="medical-incident">Medical Event</option>
                      <option value="match-abandonment">Match Abandonment</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Operational Justification Notes">
                  <Input placeholder="Describe why this exception is justified..." value={rexNotes} onChange={(e) => setRexNotes(e.target.value)} />
                </Field>
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => setShowRexProposalForm(false)}>Cancel</Button>
                  <Button onClick={handleRecommendRexSubmit}>Recommend Refund</Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {activeTab === "disputes" && (
          <div className="grid md:grid-cols-[1fr_350px] gap-6 items-start">
            <div className="space-y-4">
              <PanelHeader title="Participant Dispute Log" sub="Review submissions contesting outcomes or decisions." />
              {dRows.length === 0 ? (
                <p className="text-xs text-ink-mut">No dispute logs found.</p>
              ) : (
                <div className="space-y-3">
                  {dRows.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => {
                        setSelectedDisputeId(d.id);
                        setSelectedIncidentId(null);
                      }}
                      className={`rounded-panel glass p-4 border transition-all cursor-pointer text-left ${
                        selectedDisputeId === d.id ? "border-brand bg-brand/5" : "border-white/5 bg-white/2 hover:bg-white/4"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink-lum">{d.id}</span>
                          <Badge className="bg-white/8 text-ink-sec">{d.type}</Badge>
                        </div>
                        <StatusChip value={d.status} />
                      </div>
                      <p className="text-[10px] text-ink-mut mt-1">Submitted by: {d.submittedBy} · {d.submittedAt}</p>
                      <p className="text-xs text-ink-sec mt-2 truncate font-semibold">Reason: {d.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Disputes detail side panel */}
            <div className="space-y-4">
              <PanelHeader title="Dispute Review" sub="Assign ownership and record decisions." />
              {detailD ? (
                <Card className="p-4 space-y-4 border border-white/5">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-sm font-bold text-ink-lum">{detailD.id}</h4>
                      <span className="text-[10px] text-ink-mut">Submitted: {detailD.submittedAt}</span>
                    </div>
                    <StatusChip value={detailD.status} />
                  </div>

                  <div className="solid rounded-xl p-3 space-y-2 text-xs">
                    <p><strong>Type:</strong> {detailD.type}</p>
                    <p><strong>By:</strong> {detailD.submittedBy}</p>
                    <p><strong>Reason:</strong> {detailD.reason}</p>
                    {detailD.tournamentName && <p><strong>Tournament:</strong> {detailD.tournamentName}</p>}
                    {detailD.matchLabel && <p><strong>Match:</strong> {detailD.matchLabel}</p>}
                    {detailD.reviewerId && <p><strong>Assigned Reviewer:</strong> {detailD.reviewerId}</p>}
                  </div>

                  <div className="space-y-2">
                    {!detailD.reviewerId && (
                      <Button onClick={() => handleAssignDisputeReviewerSubmit(detailD.id)} className="w-full">
                        Assign Self as Reviewer
                      </Button>
                    )}

                    {detailD.reviewerId && (detailD.status === "under-review" || detailD.status === "submitted" || detailD.status === "evidence-requested") && (
                      <div className="space-y-2">
                        <Button onClick={() => setShowDisputeDecisionForm(true)} className="w-full">
                          Record Decision Outcome
                        </Button>
                      </div>
                    )}

                    {(detailD.status === "upheld" || detailD.status === "rejected") && (
                      <Button onClick={() => handleCloseDisputeSubmit(detailD.id)} className="w-full bg-[#12b76a] hover:bg-[#10a35e] text-white">
                        Verify & Close Case
                      </Button>
                    )}
                  </div>
                </Card>
              ) : (
                <Card className="p-8 text-center text-xs text-ink-mut">
                  Select a dispute log to start resolving outcomes.
                </Card>
              )}
            </div>

            {/* Dispute decision formulation dialog */}
            {showDisputeDecisionForm && (
              <Card className="p-4 border border-brand bg-brand/5 max-w-md mx-auto space-y-4">
                <PanelHeader title="Record Dispute Decision" sub="Justify dispute outcome." />
                <Field label="Dispute Verdict">
                  <Select value={disputeUpheld ? "upheld" : "rejected"} onChange={(e) => setDisputeUpheld(e.target.value === "upheld")}>
                    <option value="upheld">Upheld (Dispute Justified)</option>
                    <option value="rejected">Rejected (Dispute Dismissed)</option>
                  </Select>
                </Field>
                <Field label="Verdict Summary Notes">
                  <Input placeholder="Verdict description..." value={disputeDecisionText} onChange={(e) => setDisputeDecisionText(e.target.value)} />
                </Field>
                <Field label="Actionable Resolution Justification">
                  <Input placeholder="Downstream or adjustment explanation..." value={disputeDecisionReason} onChange={(e) => setDisputeDecisionReason(e.target.value)} />
                </Field>
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => setShowDisputeDecisionForm(false)}>Cancel</Button>
                  <Button onClick={handleDecideDisputeSubmit} disabled={!disputeDecisionText || !disputeDecisionReason}>Save Decision</Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {activeTab === "moderation" && (
          <div className="space-y-6">
            <PanelHeader title="Active Moderation Cases & Restrictions" sub="Review player behavior, warnings, and suspension approvals." />

            <div className="grid md:grid-cols-2 gap-6">
              {/* Cases List */}
              <Card className="p-4 space-y-4">
                <h3 className="text-sm font-semibold text-ink-lum">Cases Open ({state.moderationCases.length})</h3>
                <div className="space-y-3">
                  {state.moderationCases.map((c) => (
                    <div key={c.id} className="solid rounded-xl p-3 border border-white/5 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-ink-lum">{c.id}</span>
                        <StatusChip value={c.status} />
                      </div>
                      <div className="text-xs text-ink-sec space-y-1">
                        <p><strong>Subject:</strong> {c.subjectTemporaryId || "No temporary ID assigned"}</p>
                        <p><strong>Category:</strong> {c.category} · <strong>Severity:</strong> {c.severity}</p>
                        <p className="text-ink-mut">Notes: {c.notes}</p>
                      </div>

                      {/* Case level actions */}
                      {c.status === "open" && (
                        <Button onClick={() => {
                          setSelectedCaseId(c.id);
                          setShowModProposalForm(true);
                        }} className="h-8 text-xs rounded-lg px-3">
                          Propose Restriction Action
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {/* Proposed Actions Queue */}
              <Card className="p-4 space-y-4">
                <h3 className="text-sm font-semibold text-ink-lum">Proposed Actions Queue</h3>
                {state.moderationActions.filter((a) => a.status === "proposed").length === 0 ? (
                  <p className="text-xs text-ink-mut">No actions proposed.</p>
                ) : (
                  <div className="space-y-3">
                    {state.moderationActions.filter((a) => a.status === "proposed").map((a) => (
                      <div key={a.id} className="solid rounded-xl p-3 border border-[#f7b955]/30 bg-[#f7b955]/5 space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-[#ffd28a]">{a.type}</span>
                          <StatusChip value={a.status} />
                        </div>
                        <div className="text-xs text-ink-sec space-y-1">
                          <p><strong>Subject ID:</strong> {a.subjectTemporaryId}</p>
                          <p><strong>Reason:</strong> {a.reason}</p>
                          <p><strong>Scope:</strong> {a.scope} ({a.scopeEntityId || "all"})</p>
                          <p className="text-ink-mut">Expires: {a.expiryDate || "Never (Permanent)"}</p>
                        </div>

                        {/* Authority Gated buttons */}
                        <div className="flex gap-2">
                          <Button onClick={() => handleApproveActionSubmit(a.id, a.type)} className="h-8 text-xs rounded-lg px-3 bg-[#12b76a] hover:bg-[#10a35e] text-white">
                            Approve Action
                          </Button>
                          <Button onClick={() => handleRejectActionSubmit(a.id)} className="h-8 text-xs rounded-lg px-3" variant="danger">
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Warnings lists and bans */}
                <div className="border-t border-white/5 pt-4 space-y-2">
                  <h4 className="text-xs font-semibold text-ink-mut overline">Active Suspensions & Bans</h4>
                  {state.moderationActions.filter((a) => a.status === "active").length === 0 ? (
                    <p className="text-[10px] text-ink-mut">No active bans or restrictions.</p>
                  ) : (
                    <div className="space-y-1">
                      {state.moderationActions.filter((a) => a.status === "active").map((a) => (
                        <div key={a.id} className="flex justify-between items-center text-[10px] bg-white/4 p-2 rounded border border-white/5">
                          <div>
                            <span className="font-semibold text-ink-sec">{a.subjectTemporaryId || a.subjectPersonId}</span>
                            <span className="text-ink-mut"> · {a.type} ({a.scope})</span>
                          </div>
                          <span className="text-warning">Active</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Moderation Proposal dialog */}
            {selectedCaseId && showModProposalForm && (
              <Card className="p-4 border border-brand bg-brand/5 max-w-md mx-auto space-y-4">
                <PanelHeader title="Propose Moderation Action" sub="Create formal restriction proposal." />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Action Type">
                    <Select value={modActionType} onChange={(e) => setModActionType(e.target.value as any)}>
                      <option value="formal-warning">Formal Warning</option>
                      <option value="venue-restriction">Venue Restriction</option>
                      <option value="temporary-suspension">Temporary Suspension</option>
                      <option value="permanent-ban">Permanent Account Ban</option>
                    </Select>
                  </Field>
                  <Field label="Scope">
                    <Select value={modActionScope} onChange={(e) => setModActionScope(e.target.value as any)}>
                      <option value="tournament">Tournament Scope</option>
                      <option value="venue">Venue Scope</option>
                      <option value="territory">Territory Scope</option>
                      <option value="platform">Platform Scope</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Expirations Duration">
                  <Input placeholder="e.g. Next week, 14 days, or permanent" value={modActionExpiry} onChange={(e) => setModActionExpiry(e.target.value)} />
                </Field>
                <Field label="Justification Reason">
                  <Input placeholder="Describe violation reasoning..." value={modActionReason} onChange={(e) => setModActionReason(e.target.value)} />
                </Field>

                {/* Show role warnings */}
                {modActionType === "permanent-ban" && role.id !== "platform-owner" && (
                  <div className="text-[10px] p-2 bg-danger/10 border border-danger/20 text-danger rounded">
                    ⚠️ <strong>Operational Gate:</strong> Permanent bans can only be approved by the **Platform Owner**. Proposing is allowed, but HQ approval is gated.
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => {
                    setShowModProposalForm(false);
                    setSelectedCaseId(null);
                  }}>Cancel</Button>
                  <Button onClick={() => {
                    const c = state.moderationCases.find((x) => x.id === selectedCaseId);
                    if (c) handleProposeModSubmit(c.id, c.subjectTemporaryId || "");
                  }} disabled={!modActionReason}>Propose Action</Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {activeTab === "refunds" && (
          <div className="space-y-6">
            <PanelHeader title="Refund Exceptions Control Desk" sub="Review exception claims arising from weather cancellations or injury events." />

            <div className="max-w-2xl mx-auto space-y-4">
              {rexQueue.length === 0 ? (
                <div className="solid rounded-panel p-8 text-center text-xs text-ink-mut">
                  No pending refund exception approvals in the active queue.
                </div>
              ) : (
                <div className="space-y-3">
                  {rexQueue.map((re) => (
                    <div key={re.id} className="rounded-panel glass p-4 border border-white/5 bg-white/2 space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink-lum">{re.id}</span>
                          <Badge className="bg-[#12b76a]/10 border border-[#12b76a]/30 text-[#5fd7a3]">
                            Amount: ₹{re.amount}
                          </Badge>
                        </div>
                        <StatusChip value={re.status} />
                      </div>
                      <div className="text-xs text-ink-sec space-y-1">
                        <p><strong>Reason:</strong> {re.reason}</p>
                        <p><strong>Recommended By:</strong> {re.recommendedBy} · {re.recommendedAt}</p>
                        {re.notes && <p className="text-ink-mut">Justification: {re.notes}</p>}
                      </div>

                      {/* Approve / Reject buttons with authority check */}
                      <div className="flex gap-2 justify-end border-t border-white/5 pt-2">
                        <Button onClick={() => handleApproveRexSubmit(re.id)} className="h-8 text-xs px-3 bg-[#12b76a] hover:bg-[#10a35e] text-white">
                          Approve Refund Exception
                        </Button>
                        <Button onClick={() => handleRejectRexSubmit(re.id)} className="h-8 text-xs px-3" variant="danger">
                          Reject Claim
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}

function IconButton({
  label,
  children,
  ...rest
}: {
  label: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl glass hover:bg-white/5 border border-white/5 text-ink-sec hover:text-ink-lum transition-all duration-200"
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}
