'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  hasError?: boolean;
  /** Fired when all digits are filled. */
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
}

/**
 * Segmented numeric OTP input with auto-advance, backspace navigation,
 * arrow-key movement and full paste support.
 */
export function OtpInput({
  value,
  onChange,
  length = 4,
  disabled = false,
  hasError = false,
  onComplete,
  autoFocus = true,
}: OtpInputProps) {
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([]);

  React.useEffect(() => {
    if (autoFocus) inputsRef.current[0]?.focus();
  }, [autoFocus]);

  const focusIndex = (i: number) => {
    const el = inputsRef.current[i];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const setDigit = (index: number, digit: string) => {
    const next = value.split('');
    next[index] = digit;
    const joined = next.join('').slice(0, length);
    onChange(joined);
    if (joined.length === length && !joined.includes('') && onComplete) {
      onComplete(joined);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      setDigit(index, '');
      return;
    }
    // Take the last entered character (handles overtype).
    const digit = raw[raw.length - 1];
    setDigit(index, digit);
    if (index < length - 1) focusIndex(index + 1);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[index]) {
        setDigit(index, '');
      } else if (index > 0) {
        focusIndex(index - 1);
        setDigit(index - 1, '');
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusIndex(index - 1);
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      focusIndex(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    const nextIndex = Math.min(pasted.length, length - 1);
    focusIndex(nextIndex);
    if (pasted.length === length && onComplete) onComplete(pasted);
  };

  return (
    <div className="flex justify-between gap-3" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onFocus={(e) => e.target.select()}
          aria-label={`Digit ${i + 1}`}
          className={cn(
            'h-14 w-full rounded-xl border bg-surface text-center font-mono text-2xl font-medium tabular-nums text-foreground caret-foreground transition-colors',
            'focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/10',
            hasError
              ? 'border-danger/60 focus:border-danger'
              : 'border-transparent focus:border-foreground/30',
            value[i] && !hasError && 'border-foreground/15 bg-background',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        />
      ))}
    </div>
  );
}
