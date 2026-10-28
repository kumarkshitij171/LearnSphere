'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { Plus } from 'lucide-react';

/** Numbered because the list is an index readers refer back to ("see question 3"). */
export function Faq({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <Accordion.Root type="single" collapsible className="divide-y divide-border border-y border-border">
      {items.map((item, i) => (
        <Accordion.Item key={item.question} value={String(i)}>
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-start gap-5 py-5 text-left outline-none focus-visible:bg-surface">
              <span className="w-6 shrink-0 pt-0.5 font-mono text-[13px] text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
              <span className="flex-1 text-[17px] font-medium tracking-[-0.01em]">{item.question}</span>
              <Plus className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-45" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden">
            <p className="max-w-prose pb-5 pl-11 pr-8 text-[15px] leading-relaxed text-body">{item.answer}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
