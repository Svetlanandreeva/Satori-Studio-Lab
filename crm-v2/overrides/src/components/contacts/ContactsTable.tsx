"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { QualificationBadge } from "@/components/shared/QualificationBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Search, Users, Download } from "lucide-react";
import { formatDate, SOURCE_LABELS } from "@/lib/constants";
import { LEAD_QUALIFICATION_OPTIONS, type LeadQualification } from "@/lib/lead-qualification";
import type { Contact, Temperature, LeadSource } from "@/types";

interface ContactsTableProps {
  contacts: Contact[];
}

export function ContactsTable({ contacts }: ContactsTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterTemp, setFilterTemp] = useState<Temperature | "">("");
  const [filterQualification, setFilterQualification] = useState<LeadQualification | "">("");

  const filtered = contacts.filter((contact) => {
    const needle = search.toLowerCase();
    const matchesSearch =
      !search ||
      contact.name.toLowerCase().includes(needle) ||
      contact.email?.toLowerCase().includes(needle) ||
      contact.phone?.toLowerCase().includes(needle) ||
      contact.company?.toLowerCase().includes(needle);
    const matchesTemp = !filterTemp || contact.temperature === filterTemp;
    const matchesQualification =
      !filterQualification || contact.qualification === filterQualification;
    return Boolean(matchesSearch && matchesTemp && matchesQualification);
  });

  if (contacts.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Клиентов пока нет"
        description="Добавьте первого клиента, чтобы начать работу с воронкой продаж."
        actionLabel="Добавить клиента"
        onAction={() => router.push("/contacts?new=true")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени, телефону, email или компании..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => window.open("/api/export?type=contacts") }>
            <Download className="h-4 w-4 mr-1" /> Экспорт
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={filterQualification}
            onChange={(event) => setFilterQualification(event.target.value as LeadQualification | "")}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Все квалификации</option>
            {LEAD_QUALIFICATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          {(["", "hot", "warm", "cold"] as const).map((temperature) => (
            <Button
              key={temperature || "all"}
              variant={filterTemp === temperature ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterTemp(temperature)}
            >
              {temperature === "" ? "Все" : temperature === "hot" ? "Горячие" : temperature === "warm" ? "Тёплые" : "Холодные"}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Клиент</TableHead>
              <TableHead className="hidden sm:table-cell">Компания</TableHead>
              <TableHead>Квалификация</TableHead>
              <TableHead className="hidden md:table-cell">Источник</TableHead>
              <TableHead className="hidden md:table-cell">Температура</TableHead>
              <TableHead className="hidden lg:table-cell">Оценка</TableHead>
              <TableHead className="hidden xl:table-cell">Дата</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((contact) => (
              <TableRow
                key={contact.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/contacts/${contact.id}`)}
              >
                <TableCell>
                  <div>
                    <p className="font-medium">{contact.name}</p>
                    <p className="text-xs text-muted-foreground">{contact.phone || contact.email || "Нет контакта"}</p>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{contact.company || "—"}</TableCell>
                <TableCell><QualificationBadge qualification={contact.qualification} /></TableCell>
                <TableCell className="hidden md:table-cell text-sm">
                  {SOURCE_LABELS[contact.source as LeadSource] || contact.source}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <StatusBadge temperature={contact.temperature as Temperature} size="sm" />
                </TableCell>
                <TableCell className="hidden lg:table-cell">{contact.score}</TableCell>
                <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">{formatDate(contact.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Показано {filtered.length} из {contacts.length}
      </p>
    </div>
  );
}
