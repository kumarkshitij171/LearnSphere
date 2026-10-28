import {
  LayoutDashboard, BookOpen, Bookmark, ClipboardList, Compass, Award, Receipt, HelpCircle, Settings,
  ShieldCheck, SlidersHorizontal, GraduationCap, Users, PlayCircle, Bell, Sparkles, MonitorPlay, History,
  Keyboard, Wallet, Mail, ListChecks, Upload, Gauge, Circle,
} from 'lucide-react';
import type { NavIconName } from './types';

// The allow-list from the schema. Config names an icon; it never names a component.
const ICONS: Record<NavIconName, typeof Circle> = {
  LayoutDashboard, BookOpen, Bookmark, ClipboardList, Compass, Award, Receipt, HelpCircle, Settings,
  ShieldCheck, SlidersHorizontal, GraduationCap, Users, PlayCircle, Bell, Sparkles, MonitorPlay, History,
  Keyboard, Wallet, Mail, ListChecks, Upload, Gauge,
};

export function navIcon(name: string): typeof Circle {
  return (ICONS as Record<string, typeof Circle>)[name] ?? Circle;
}
