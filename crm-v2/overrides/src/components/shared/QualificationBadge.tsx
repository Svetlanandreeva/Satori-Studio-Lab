import { Badge } from "@/components/ui/badge";
import {
  LEAD_QUALIFICATION_LABELS,
  type LeadQualification,
} from "@/lib/lead-qualification";

const classes: Record<LeadQualification, string> = {
  new: "border-slate-300 text-slate-600 bg-slate-50",
  working: "border-blue-300 text-blue-700 bg-blue-50",
  qualified: "border-emerald-300 text-emerald-700 bg-emerald-50",
  unqualified: "border-orange-300 text-orange-700 bg-orange-50",
  not_target: "border-amber-300 text-amber-700 bg-amber-50",
  ignore: "border-zinc-300 text-zinc-700 bg-zinc-50",
  spam: "border-red-300 text-red-700 bg-red-50",
  duplicate: "border-violet-300 text-violet-700 bg-violet-50",
};

export function QualificationBadge({
  qualification,
  className = "",
}: {
  qualification: string | null | undefined;
  className?: string;
}) {
  const value = (qualification || "new") as LeadQualification;
  const label = LEAD_QUALIFICATION_LABELS[value] || LEAD_QUALIFICATION_LABELS.new;
  return (
    <Badge variant="outline" className={`${classes[value] || classes.new} ${className}`}>
      {label}
    </Badge>
  );
}
