import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, pipelineStages } from "@/db/schema";
import { DealsTable, type DealRow } from "@/components/deals/DealsTable";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const rows = db.select({
    id: deals.id, title: deals.title, value: deals.value, createdAt: deals.createdAt, updatedAt: deals.updatedAt, notes: deals.notes,
    contactId: contacts.id, contactName: contacts.name, contactPhone: contacts.phone, contactSource: contacts.source, qualification: contacts.qualification,
    stageId: pipelineStages.id, stageName: pipelineStages.name, stageColor: pipelineStages.color, isLost: pipelineStages.isLost, isWon: pipelineStages.isWon,
  })
    .from(deals).leftJoin(contacts, eq(deals.contactId, contacts.id)).leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .orderBy(desc(deals.updatedAt)).all()
    .filter((d) => {
      // Спам, парсер и служебные письма в список сделок не попадают.
      if (d.stageName === SPAM_STAGE_NAME) return false;
      if (d.contactSource === "need_number" || ["spam", "unqualified", "ignore"].includes(String(d.qualification || "").toLowerCase())) return false;
      const hay = `${d.title || ""} ${d.contactName || ""} ${d.notes || ""}`.toLowerCase();
      return !/elama|e-lama|ai-маркетолог|ticket#|mailer-daemon|no-reply|noreply/.test(hay);
    });

  const stages = db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)).all()
    .filter((s) => s.name !== SPAM_STAGE_NAME)
    .map((s) => ({ id: s.id, name: s.name, color: s.color, isWon: Boolean(s.isWon), isLost: Boolean(s.isLost) }));

  const data: DealRow[] = rows.map((r) => ({
    id: r.id, title: r.title, value: r.value,
    createdAt: new Date(r.createdAt).toISOString(), updatedAt: new Date(r.updatedAt).toISOString(),
    contactId: r.contactId, contactName: r.contactName, contactPhone: r.contactPhone,
    stageId: r.stageId, stageName: r.stageName, stageColor: r.stageColor, isWon: Boolean(r.isWon), isLost: Boolean(r.isLost),
  }));

  return <div className="mx-auto max-w-[1400px] pb-10"><DealsTable rows={data} stages={stages} /></div>;
}
