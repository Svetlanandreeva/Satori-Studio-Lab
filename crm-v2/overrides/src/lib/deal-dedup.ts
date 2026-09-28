import { buildEmailConversationIndex, sameEmailConversationForDeals, type EmailConversationIndex } from "@/lib/email-conversation";

const DAY = 24 * 60 * 60 * 1000;
const EXACT_DUPLICATE_WINDOW = 30 * DAY;
const SIMILAR_DUPLICATE_WINDOW = 3 * DAY;
const SIMILARITY_THRESHOLD = 0.6;
const TITLE_STOP_WORDS = new Set([
  "и", "в", "во", "на", "по", "под", "для", "из", "с", "со", "к", "до", "от", "за", "шт", "штук",
  "заказ", "заявка", "проект", "изготовление",
]);

export type DedupDeal = {
  id?: string;
  contactId: string;
  contactSource?: unknown;
  title: string;
  value: number;
  createdAt: unknown;
  updatedAt?: unknown;
  notes?: unknown;
  stageIsWon?: boolean | null;
  stageIsLost?: boolean | null;
};

function normalizeTitle(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&amp;|&quot;|&#39;/gi, " ")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleTokens(value: unknown): Set<string> {
  return new Set(
    normalizeTitle(value)
      .split(" ")
      .filter((token) => token.length > 2 && !TITLE_STOP_WORDS.has(token))
  );
}

function titleSimilarity(a: unknown, b: unknown): number {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function dateMs(value: unknown): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function isDuplicateDealPair(a: DedupDeal, b: DedupDeal, emailIndex: EmailConversationIndex): boolean {
  if (sameEmailConversationForDeals(a, b, emailIndex)) return true;
  if (!a.contactId || a.contactId !== b.contactId) return false;

  const source = String(a.contactSource || b.contactSource || "").toLowerCase();
  const contactConversations = emailIndex.conversationsByContactId.get(a.contactId);
  if (source === "email" && contactConversations?.size === 1) return true;

  const age = Math.abs(dateMs(a.createdAt) - dateMs(b.createdAt));
  const aTitle = normalizeTitle(a.title);
  const bTitle = normalizeTitle(b.title);
  const sameValue = Number(a.value || 0) === Number(b.value || 0);

  if (sameValue && aTitle && aTitle === bTitle && age <= EXACT_DUPLICATE_WINDOW) return true;
  return sameValue && age <= SIMILAR_DUPLICATE_WINDOW && titleSimilarity(a.title, b.title) >= SIMILARITY_THRESHOLD;
}

function stageRank(deal: DedupDeal): number {
  if (deal.stageIsWon) return 3;
  if (deal.stageIsLost) return 1;
  return 2;
}

function preferCandidate(candidate: DedupDeal, saved: DedupDeal): boolean {
  const candidateStage = stageRank(candidate);
  const savedStage = stageRank(saved);
  if (candidateStage !== savedStage) return candidateStage > savedStage;

  const candidateValue = Number(candidate.value || 0);
  const savedValue = Number(saved.value || 0);
  if (candidateValue !== savedValue) return candidateValue > savedValue;

  return dateMs(candidate.updatedAt) > dateMs(saved.updatedAt);
}

export function deduplicateDeals<T extends DedupDeal>(rows: T[]): T[] {
  const emailIndex = buildEmailConversationIndex();
  const result: T[] = [];
  for (const row of rows) {
    const duplicateIndex = result.findIndex((saved) => isDuplicateDealPair(row, saved, emailIndex));
    if (duplicateIndex < 0) {
      result.push(row);
      continue;
    }
    if (preferCandidate(row, result[duplicateIndex])) result[duplicateIndex] = row;
  }
  result.sort((a, b) => dateMs(b.createdAt) - dateMs(a.createdAt));
  return result;
}
