import type { AvailableSlot } from '@/lib/booking/slots';

export interface DedupedSlot {
  start: Date;
  end: Date;
  employeeIds: string[];
}

export function dedupeSlotsByStart(slots: AvailableSlot[]): DedupedSlot[] {
  const byStart = new Map<number, DedupedSlot>();

  for (const slot of slots) {
    const key = slot.start.getTime();
    const existing = byStart.get(key);
    if (existing) {
      existing.employeeIds.push(slot.employeeId);
    } else {
      byStart.set(key, { start: slot.start, end: slot.end, employeeIds: [slot.employeeId] });
    }
  }

  return Array.from(byStart.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
}
