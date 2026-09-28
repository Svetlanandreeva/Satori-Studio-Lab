"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const contactSchema = z.object({
  name: z.string().min(1, "Укажите имя"),
  email: z.string().email("Некорректный email").or(z.literal("")),
  phone: z.string(),
  company: z.string(),
  source: z.string(),
  temperature: z.enum(["cold", "warm", "hot"]),
  notes: z.string(),
});

type ContactFormData = z.infer<typeof contactSchema>;

interface ContactFormProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (contact: { id: string; name: string }) => void;
  initialData?: Partial<ContactFormData> & { id?: string };
}

export function ContactForm({ open, onClose, onSaved, initialData }: ContactFormProps) {
  const router = useRouter();
  const isEditing = !!initialData?.id;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: initialData?.name || "",
      email: initialData?.email || "",
      phone: initialData?.phone || "",
      company: initialData?.company || "",
      source: initialData?.source && initialData.source !== "otro" ? initialData.source : "other",
      temperature: initialData?.temperature || "warm",
      notes: initialData?.notes || "",
    },
  });

  const onSubmit = async (data: ContactFormData) => {
    try {
      const url = isEditing
        ? `/api/contacts/${initialData!.id}`
        : "/api/contacts";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const saved = await res.json().catch(() => null);
      if (!res.ok) throw new Error(saved?.error || "Ошибка сохранения");

      if (saved?.duplicate) {
        toast.info(`Такой клиент уже есть: ${saved.name}`, {
          action: { label: "Открыть", onClick: () => router.push(`/contacts/${saved.id}`) },
        });
      } else {
        toast.success(isEditing ? "Клиент обновлён" : "Клиент создан");
      }
      if (saved?.id) onSaved?.({ id: saved.id, name: saved.name });
      reset();
      onClose();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить клиента");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Редактировать клиента" : "Новый клиент"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Имя *</Label>
            <Input id="name" {...register("name")} placeholder="Как зовут клиента" autoFocus />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} placeholder="client@mail.ru" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input id="phone" {...register("phone")} placeholder="+7 999 123-45-67" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">Компания</Label>
            <Input id="company" {...register("company")} placeholder="Необязательно" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="source">Откуда пришёл</Label>
              <select id="source" {...register("source")} className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <option value="website">Сайт</option>
                <option value="telegram_account">Telegram</option>
                <option value="email">Почта</option>
                <option value="instagram">Instagram</option>
                <option value="referral">Рекомендация</option>
                <option value="ads">Реклама</option>
                <option value="other">Другое</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="temperature">Интерес</Label>
              <select id="temperature" {...register("temperature")} className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <option value="hot">Горячий</option>
                <option value="warm">Тёплый</option>
                <option value="cold">Холодный</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Заметки</Label>
            <Textarea id="notes" {...register("notes")} placeholder="Что хочет, бюджет, сроки…" rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Отмена
            </Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? "Сохранение..." : isEditing ? "Сохранить" : "Создать"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
