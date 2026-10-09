import type { CourseSummary } from '@/lib/api';

/** Matches every word of the query against title, description and instructor, so "kafka basics" works. */
export function matchesQuery(course: CourseSummary, query: string): boolean {
  const haystack = `${course.title} ${course.description} ${course.instructor?.name ?? ''}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
