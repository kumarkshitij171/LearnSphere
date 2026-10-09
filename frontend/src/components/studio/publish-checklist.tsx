'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import type { CourseDetail } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ChecklistItem {
  label: string;
  done: boolean;
  hint: string;
  /** required items block publishing (the backend enforces them too); the rest are advice */
  required: boolean;
}

export function publishChecklist(course: CourseDetail): ChecklistItem[] {
  const ready = course.videos.filter((v) => v.status === 'READY').length;
  return [
    {
      label: 'At least one ready lesson',
      done: ready > 0,
      hint: course.videos.length ? 'Your lessons are still processing.' : 'Add a lesson to get started.',
      required: true,
    },
    {
      label: 'A description students can decide on',
      done: course.description.trim().length >= 40,
      hint: 'Two or three sentences on what students will learn.',
      required: false,
    },
  ];
}

export function PublishChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2.5 text-sm">
          {item.done ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          ) : (
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
          )}
          <span>
            <span className={cn(item.done ? 'text-foreground' : 'text-foreground/90')}>{item.label}</span>
            {!item.required && !item.done ? (
              <span className="ml-1.5 rounded bg-white/[0.06] px-1.5 py-px text-[10px] font-medium text-muted-foreground">recommended</span>
            ) : null}
            {!item.done ? <span className="block text-xs text-muted-foreground">{item.hint}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
