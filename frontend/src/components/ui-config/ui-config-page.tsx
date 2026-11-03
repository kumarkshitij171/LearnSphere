'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, FileJson, History, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import type { CurrentUser } from '@/lib/api';
import { ConfigTab } from './config-tab';
import { HistoryTab, parseCompare, type CompareMode } from './history-tab';
import { RestoreDialog } from './restore-dialog';
import { ReviewSheet } from './review-sheet';
import { relativeTime } from './time';
import { pretty, useUiConfigDraft } from './use-ui-config-draft';

const PATH = '/admin/ui-config';

/**
 * /admin/ui-config: Configuration (see and change the config, then review the diff and publish)
 * and Version history (what each version changed, compared with live or the draft). The tab and
 * the selected version live in the URL, so a link opens the same view.
 */
export function UiConfigPage({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get('tab') === 'history' ? 'history' : 'config';
  const selected = Number(params.get('v')) || null;
  const compare = parseCompare(params.get('compare'));
  const draft = useUiConfigDraft();
  const confirm = useConfirm();
  const [reviewing, setReviewing] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);

  const navigate = (next: { tab?: 'config' | 'history'; v?: number | null; compare?: CompareMode }) => {
    const query = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    if (nextTab === 'history') {
      query.set('tab', 'history');
      const v = next.v === undefined ? selected : next.v;
      if (v) query.set('v', String(v));
      const mode = next.compare ?? (next.v === undefined ? compare : 'prev');
      if (mode !== 'prev') query.set('compare', mode);
    }
    const qs = query.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  };

  if (draft.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-body">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the UI configuration…
      </div>
    );
  }

  if (draft.loadError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon={<AlertTriangle />}
          title="The UI configuration did not load"
          description={draft.loadError}
          action={<Button onClick={() => draft.reload()}>Try again</Button>}
        />
      </div>
    );
  }

  const live = draft.published;
  const versionCount = draft.history?.total ?? 0;

  const discard = async () => {
    const ok = await confirm({
      title: 'Discard your draft?',
      description: 'Your unpublished changes are deleted. What is live does not change.',
      confirmLabel: 'Discard draft',
      tone: 'danger',
      action: draft.discard,
    });
    if (ok) toast.success('Draft discarded. What is live has not changed.');
  };

  const copyToDraft = async (version: number) => {
    if (draft.edited) {
      const ok = await confirm({
        title: `Replace your draft with v${version}?`,
        description: 'Your unpublished changes are replaced by this version. Nothing is published until you review and publish.',
        confirmLabel: 'Replace draft',
      });
      if (!ok) return;
    }
    try {
      draft.replaceDraft(pretty(await draft.versionDoc(version)));
      navigate({ tab: 'config' });
      toast.success(`v${version} is now your draft. Edit it, then review and publish.`);
    } catch {
      toast.error(`Could not load v${version}.`);
    }
  };

  const restore = async (version: number, message: string) => {
    const created = await draft.restore(version, message);
    navigate({ tab: 'history', v: created });
    toast.success(`Restored v${version} as v${created}. Users see it within about a minute.`);
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 pb-16 pt-8 sm:px-6 lg:px-9">
      <PageHeader
        eyebrow={
          <span>
            <Link href="/admin" className="text-body transition-colors hover:text-foreground">
              Admin
            </Link>{' '}
            / UI configuration
          </span>
        }
        title="UI configuration"
        description="Navigation, copy, theme and feature switches for every user. Your edits are kept as a draft. Nothing changes for users until you publish."
        actions={
          <>
            {live ? (
              <span className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-3.5 text-[13px] text-body">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
                <span className="font-medium text-foreground">Live</span>v{live.version} · {relativeTime(live.createdAt)} by {live.createdBy?.name ?? 'System'}
              </span>
            ) : null}
            {tab === 'config' ? (
              <>
                <Button variant="ghost" disabled={!draft.hasDraft && !draft.edited} onClick={() => void discard()}>
                  Discard draft
                </Button>
                <Button disabled={!!draft.blockedReason} title={draft.blockedReason ?? undefined} onClick={() => setReviewing(true)}>
                  Review changes
                  {draft.changes.length ? (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-highlight px-1.5 text-[11.5px] font-semibold text-highlight-foreground">
                      {draft.changes.length}
                    </span>
                  ) : null}
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <Tabs value={tab} onValueChange={(value) => navigate({ tab: value === 'history' ? 'history' : 'config' })}>
        <TabsList>
          <TabsTrigger value="config">
            <FileJson className="h-3.5 w-3.5" /> Configuration
            {draft.edited ? <Badge tone="info">Draft</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5" /> Version history
            <Badge>{versionCount}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="pt-5">
          <ConfigTab draft={draft} role={user.role} />
        </TabsContent>
        <TabsContent value="history" className="pt-5">
          <HistoryTab
            draft={draft}
            selected={selected}
            compare={compare}
            onSelect={(v) => navigate({ tab: 'history', v })}
            onCompare={(mode) => navigate({ tab: 'history', compare: mode })}
            onCopyToDraft={(v) => void copyToDraft(v)}
            onRestore={setRestoring}
          />
        </TabsContent>
      </Tabs>

      <ReviewSheet
        open={reviewing}
        onOpenChange={setReviewing}
        draft={draft}
        onPublished={(version) => toast.success(`Published v${version}. Users see it within about a minute.`)}
      />
      <RestoreDialog version={restoring} liveVersion={live?.version ?? 0} onClose={() => setRestoring(null)} onRestore={restore} />
    </div>
  );
}
