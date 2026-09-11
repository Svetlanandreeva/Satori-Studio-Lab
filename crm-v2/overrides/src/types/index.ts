export type Temperature = "cold" | "warm" | "hot";

export type LeadQualification =
  | "new"
  | "working"
  | "qualified"
  | "unqualified"
  | "not_target"
  | "spam"
  | "duplicate";

export type ActivityType = "call" | "email" | "meeting" | "note" | "follow_up";

export type LeadSource =
  | "website"
  | "whatsapp"
  | "referido"
  | "redes_sociales"
  | "llamada_fria"
  | "email"
  | "formulario"
  | "evento"
  | "import"
  | "webhook"
  | "need_number"
  | "otro";

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: LeadSource;
  temperature: Temperature;
  qualification: LeadQualification;
  score: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Deal {
  id: string;
  title: string;
  value: number;
  stageId: string;
  contactId: string;
  expectedClose: Date | null;
  probability: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string;
  isWon: boolean;
  isLost: boolean;
}

export interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  contactId: string;
  dealId: string | null;
  scheduledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface CrmConfig {
  business: {
    type: string;
    industry: string;
    teamSize: string;
  };
  pipeline: {
    stages: Array<{
      name: string;
      order: number;
      color: string;
      isWon: boolean;
      isLost: boolean;
    }>;
  };
  leadSources: string[];
  preferences: {
    language: "ru" | "es" | "en";
    theme: "light" | "dark" | "auto";
  };
}

export interface DealWithContact extends Deal {
  contact?: Contact;
  stage?: PipelineStage;
  contactName?: string | null;
  contactTemperature?: string | null;
  contactQualification?: string | null;
}

export interface ContactWithDeals extends Contact {
  deals?: Deal[];
  activities?: Activity[];
}

export interface PipelineColumn extends PipelineStage {
  deals: DealWithContact[];
}

export interface DashboardStats {
  totalContacts: number;
  activeDeals: number;
  totalPipelineValue: number;
  wonDealsValue: number;
  conversionRate: number;
  hotLeads: number;
}
