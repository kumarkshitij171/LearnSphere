'use client';

import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ControlButton } from './control-button';

interface VolumeControlProps {
  volume: number;
  muted: boolean;
  onVolume: (v: number) => void;
  onToggleMute: () => void;
  /** touch devices use the hardware buttons; only mute is shown */
  compact?: boolean;
}

export function VolumeControl({ volume, muted, onVolume, onToggleMute, compact }: VolumeControlProps) {
  const level = muted ? 0 : volume;
  const Icon = level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;
  return (
    <div className="group/vol flex items-center">
      <ControlButton label={muted || level === 0 ? 'Unmute' : 'Mute'} shortcut="m" onClick={onToggleMute}>
        <Icon className="h-[22px] w-[22px]" />
      </ControlButton>
      {compact ? null : (
        <div
          className={cn(
            'w-0 overflow-hidden opacity-0 transition-all duration-200 ease-out',
            'group-hover/vol:mr-3 group-hover/vol:w-20 group-hover/vol:opacity-100',
            'group-focus-within/vol:mr-3 group-focus-within/vol:w-20 group-focus-within/vol:opacity-100'
          )}
        >
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={level}
            aria-label="Volume"
            aria-valuetext={`${Math.round(level * 100)}%`}
            onChange={(e) => onVolume(Number(e.target.value))}
            onKeyDown={(e) => e.stopPropagation()}
            className="player-range block h-5 w-20 cursor-pointer"
            style={{ ['--fill' as string]: `${level * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
