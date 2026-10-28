'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { coursesApi, getApiErrorMessage, type CourseDetail } from '@/lib/api';
import { CourseCover } from '@/components/course-cover';
import { PriceField, priceFromNumber, priceProblem, priceToNumber, type PriceValue } from './price-field';
import { ThumbnailField } from './thumbnail-field';


export function EditCourseDialog({
  course,
  open,
  onOpenChange,
  onSaved,
}: {
  course: CourseDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<unknown> | void;
}) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [price, setPrice] = useState<PriceValue>(priceFromNumber(course.price));
  const [thumbnail, setThumbnail] = useState(course.thumbnail ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setThumbnail(course.thumbnail ?? null);
    setTitle(course.title);
    setDescription(course.description);
    setPrice(priceFromNumber(course.price));
    setError(null);
  }, [open, course]);

  const titleProblem = title.trim().length < 3 ? 'At least 3 characters.' : null;
  const descriptionProblem = description.trim().length < 10 ? 'At least 10 characters — tell students what they will learn.' : null;
  const invalid = Boolean(titleProblem || descriptionProblem || priceProblem(price));
  const priceChanged = priceToNumber(price) !== course.price;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await coursesApi.update(course.id, {
        title: title.trim(),
        description: description.trim(),
        price: priceToNumber(price),
      });
      await onSaved();
      toast.success('Course details saved');
      onOpenChange(false);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not save the course.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Course details</DialogTitle>
          <DialogDescription>What students see in the catalogue and on the course page.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <ThumbnailField
            target={{ kind: 'course', id: course.id }}
            current={thumbnail}
            automaticLabel="A frame from your first ready lesson"
            onChange={(key) => {
              setThumbnail(key);
              void onSaved();
            }}
            preview={
              <CourseCover
                id={course.id}
                title={title || course.title}
                thumbnail={thumbnail}
                coverVideoId={course.videos.find((v) => v.status === 'READY')?.id ?? null}
                className="aspect-video w-full"
              />
            }
          />
          <label className="block space-y-2">
            <span className="text-sm font-medium">Title</span>
            <Input value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
            {title && titleProblem ? <span className="text-xs text-danger">{titleProblem}</span> : null}
          </label>
          <label className="block space-y-2">
            <span className="flex items-center justify-between text-sm font-medium">
              Description <span className="text-xs font-normal tabular-nums text-muted-foreground">{description.length}/5000</span>
            </span>
            <Textarea
              value={description}
              maxLength={5000}
              rows={5}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
            {description && descriptionProblem ? <span className="text-xs text-danger">{descriptionProblem}</span> : null}
          </label>
          <PriceField value={price} onChange={setPrice} currency={course.currency} disabled={saving} />
          {course.isPublished && priceChanged ? (
            <p className="rounded-[10px] bg-warning/10 px-3 py-2 text-xs text-warning">
              This course is live. New buyers will pay the new price; students who already bought it keep their access.
            </p>
          ) : null}
          {error ? <p className="rounded-[10px] bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || invalid} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
