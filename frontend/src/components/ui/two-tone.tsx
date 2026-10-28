import * as React from 'react';
import { cn } from '@/lib/utils';

type Level = 'h1' | 'h2' | 'h3';

/** The signature heading: `lead` in ink, `trail` in the second tone. Once per screen at most. */
export function TwoTone({
  as: Tag = 'h2',
  lead,
  trail,
  className,
  breakLine = false,
}: {
  as?: Level;
  lead: React.ReactNode;
  trail?: React.ReactNode;
  className?: string;
  /** put the trail on its own line */
  breakLine?: boolean;
}) {
  return (
    <Tag className={cn('text-balance', className)}>
      {lead}
      {trail ? (
        <>
          {breakLine ? <br /> : ' '}
          <span className="text-subtle">{trail}</span>
        </>
      ) : null}
    </Tag>
  );
}
