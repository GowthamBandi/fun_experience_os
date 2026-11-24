"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet, useToast } from "@/components/pulse";
import { RequestIdBook, decisionKey } from "@/lib/console/actions";
import { rethrowForSheet } from "@/lib/console/errors";
import { saveTemplate } from "@/lib/notifications-api";
import { LIMITS, templateProblems, type TemplateKind } from "@/lib/notifications";
import { Field, TextInput } from "./FormBits";

/** Saves the current composer / send form as a reusable template (notificationTemplates via saveTemplate). */
export function SaveTemplateSheet({ open, kind, defaultName, payload, onClose }: { open: boolean; kind: TemplateKind; defaultName: string; payload: () => Record<string, unknown>; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(defaultName);
  const book = useRef(new RequestIdBook("tpl"));
  useEffect(() => {
    if (open) setName(defaultName.slice(0, LIMITS.templateName[1]));
  }, [open, defaultName]);

  const confirm = async () => {
    const body = payload();
    const problems = templateProblems({ name, payload: body });
    if (problems.length) throw new Error(problems.map((p) => p.message).join(" "));
    try {
      const r = await saveTemplate({ requestId: book.current.idFor(decisionKey(kind, name, JSON.stringify(body))), name: name.trim(), kind, payload: body });
      book.current.reset();
      toast.show({ tone: "ok", title: "Template saved", body: `“${name.trim()}” is in Templates (${r.id}).` });
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };

  return (
    <Sheet
      open={open}
      title="Save as a template"
      description={kind === "announcement" ? "Content, format, buttons, behaviour and audience are saved; the schedule isn't." : "Title, message, image, link, style and audience are saved; the schedule and reason aren't."}
      confirmLabel="Save template"
      tone="volt"
      extra={
        <Field label="Template name" count={name.trim().length} max={LIMITS.templateName[1]}>
          {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend promo popup" autoFocus />}
        </Field>
      }
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
