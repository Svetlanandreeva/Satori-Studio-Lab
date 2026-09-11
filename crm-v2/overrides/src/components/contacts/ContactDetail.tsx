"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { QualificationBadge } from "@/components/shared/QualificationBadge";
import { ContactForm } from "./ContactForm";
import { ActivityForm } from "@/components/activities/ActivityForm";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Calendar,
  FileText,
  Clock,
  Users,
  Pencil,
  Trash2,
  Plus,
  MessageCircle,
  Copy,
  Check,
  ShieldCheck,
} from "lucide-react";
import {
  formatCurrency,
  formatDate,
  formatRelativeDate,
  cleanPhoneForWhatsApp,
  ACTIVITY_TYPE_CONFIG,
  SOURCE_LABELS,
} from "@/lib/constants";
import {
  LEAD_QUALIFICATION_OPTIONS,
  type LeadQualification,
} from "@/lib/lead-qualification";
import { toast } from "sonner";
import type { Temperature, ActivityType, LeadSource } from "@/types";

const activityIcons: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  note: FileText,
  follow_up: Clock,
};

interface ContactDetailClientProps {
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    source: string;
    temperature: string;
    qualification: string;
    score: number;
    notes: string | null;
    createdAt: number | Date;
  };
  deals: Array<{
    id: string;
    title: string;
    value: number;
    probability: number;
    stageName: string | null;
    stageColor: string | null;
    createdAt: number | Date;
  }>;
  activities: Array<{
    id: string;
    type: string;
    description: string;
    scheduledAt: number | Date | null;
    completedAt: number | Date | null;
    createdAt: number | Date;
  }>;
}

export function ContactDetailClient({ contact, deals, activities }: ContactDetailClientProps) {
  const router = useRouter();
  const [showEditForm, setShowEditForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [qualification, setQualification] = useState<LeadQualification>(
    (contact.qualification || "new") as LeadQualification
  );
  const [qualificationBusy, setQualificationBusy] = useState(false);

  const handleCopy = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      toast.success("Скопировано");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  const handleQualification = async (next: LeadQualification) => {
    const previous = qualification;
    setQualification(next);
    setQualificationBusy(true);
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualification: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось изменить квалификацию");
      const label = LEAD_QUALIFICATION_OPTIONS.find((item) => item.value === next)?.label || next;
      toast.success(`Лид: ${label}`);
      router.refresh();
    } catch (error) {
      setQualification(previous);
      toast.error(error instanceof Error ? error.message : "Ошибка квалификации");
    } finally {
      setQualificationBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Удалить этого клиента вместе с его сделками и активностью? Это действие нельзя отменить.")) return;
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Не удалось удалить клиента");
      toast.success("Клиент удалён");
      router.push("/contacts");
    } catch {
      toast.error("Не удалось удалить клиента");
    }
  };

  const handleCompleteActivity = async (activityId: string) => {
    try {
      const response = await fetch(`/api/activities/${activityId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedAt: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error("Ошибка");
      toast.success("Активность завершена");
      router.refresh();
    } catch {
      toast.error("Не удалось завершить активность");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/contacts")} aria-label="Назад к клиентам">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{contact.name}</h1>
            <StatusBadge temperature={contact.temperature as Temperature} />
            <QualificationBadge qualification={qualification} />
          </div>
          <p className="text-muted-foreground">
            Оценка: {contact.score}/100 &middot; {SOURCE_LABELS[contact.source as LeadSource] || contact.source}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEditForm(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Изменить
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1" /> Удалить
          </Button>
        </div>
      </div>

      <Card className="border-primary/20">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex items-start gap-3 lg:w-72">
              <div className="rounded-full bg-primary/10 p-2 mt-0.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Квалификация лида</p>
                <p className="text-xs text-muted-foreground">Спам, неквал и нецелевые лиды автоматически уйдут в «Отказ».</p>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
              {LEAD_QUALIFICATION_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={qualification === option.value ? "default" : "outline"}
                  disabled={qualificationBusy}
                  onClick={() => handleQualification(option.value)}
                  title={option.description}
                  className="h-auto min-h-9 whitespace-normal"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Информация</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {contact.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${contact.email}`} className="text-primary hover:underline flex-1 truncate">{contact.email}</a>
                <button onClick={() => handleCopy(contact.email!, "email")} className="p-1 rounded hover:bg-muted" title="Скопировать email">
                  {copiedField === "email" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1">{contact.phone}</span>
                <div className="flex items-center gap-1">
                  <a href={`https://wa.me/${cleanPhoneForWhatsApp(contact.phone)}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-green-50" title="Открыть WhatsApp">
                    <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                  </a>
                  <a href={`tel:${contact.phone}`} className="p-1 rounded hover:bg-blue-50" title="Позвонить">
                    <Phone className="h-3.5 w-3.5 text-blue-600" />
                  </a>
                  <button onClick={() => handleCopy(contact.phone!, "phone")} className="p-1 rounded hover:bg-muted" title="Скопировать телефон">
                    {copiedField === "phone" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{contact.company}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Создан {formatDate(contact.createdAt)}</span>
            </div>
            {contact.notes && <div className="pt-2 border-t"><p className="text-sm text-muted-foreground whitespace-pre-line">{contact.notes}</p></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Сделки ({deals.length})</CardTitle></CardHeader>
          <CardContent>
            {deals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Сделок пока нет</p>
            ) : (
              <div className="space-y-3">
                {deals.map((deal) => (
                  <div key={deal.id} className="p-3 rounded-lg border cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/deals/${deal.id}`)}>
                    <p className="text-sm font-medium">{deal.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-semibold text-primary">{formatCurrency(deal.value)}</span>
                      <Badge variant="outline" style={{ borderColor: deal.stageColor || undefined, color: deal.stageColor || undefined }}>
                        {deal.stageName}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Активность ({activities.length})</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowActivityForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Добавить
            </Button>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Активности пока нет. Добавьте звонок, письмо или заметку.</p>
            ) : (
              <div className="space-y-4">
                {activities.map((activity) => {
                  const Icon = activityIcons[activity.type] || FileText;
                  const config = ACTIVITY_TYPE_CONFIG[activity.type as ActivityType];
                  const isPending = !activity.completedAt && activity.scheduledAt;
                  return (
                    <div key={activity.id} className="flex gap-3">
                      <div className="rounded-full bg-muted p-2 h-fit shrink-0"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{config?.label || activity.type}</Badge>
                          {isPending && (
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-600 cursor-pointer" onClick={() => handleCompleteActivity(activity.id)}>
                              Завершить
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm mt-1">{activity.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeDate(activity.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ContactForm
        open={showEditForm}
        onClose={() => { setShowEditForm(false); router.refresh(); }}
        initialData={{
          id: contact.id,
          name: contact.name,
          email: contact.email || "",
          phone: contact.phone || "",
          company: contact.company || "",
          source: contact.source,
          temperature: contact.temperature as "cold" | "warm" | "hot",
          notes: contact.notes || "",
        }}
      />

      <ActivityForm
        open={showActivityForm}
        onClose={() => { setShowActivityForm(false); router.refresh(); }}
        preselectedContactId={contact.id}
      />
    </div>
  );
}
