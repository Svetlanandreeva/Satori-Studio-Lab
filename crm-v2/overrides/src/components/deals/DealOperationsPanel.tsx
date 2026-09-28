"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

type Member = { id: string; name: string; role: string; active: boolean };

export function DealOperationsPanel({ dealId, ownerId, lossReason, members }: {
  dealId: string;
  ownerId: string | null;
  lossReason: string | null;
  members: Member[];
}) {
  const router = useRouter();
  const [owner, setOwner] = useState(ownerId || "");
  const [reason, setReason] = useState(lossReason || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/deals/${dealId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerId: owner || null, lossReason: reason || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить");
      toast.success("Сделка обновлена");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Ответственный</Label>
        <select value={owner} onChange={(event) => setOwner(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200">
          <option value="">Не назначен</option>
          {members.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role === "owner" ? "владелец" : item.role === "viewer" ? "просмотр" : "менеджер"}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label>Причина отказа</Label>
        <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Заполняется для отказанных сделок" className="h-11 rounded-xl" />
      </div>
      <div className="md:col-span-2 flex justify-end">
        <Button onClick={save} disabled={saving} className="rounded-xl">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Сохранить</Button>
      </div>
    </div>
  );
}
