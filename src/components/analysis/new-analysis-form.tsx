"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, Plus, Sparkles, Trash2, Type, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCreateAnalysis } from "@/hooks/use-create-analysis";
import { useProjects } from "@/hooks/use-projects";
import { useUpload, type UploadedScreenshot } from "@/hooks/use-upload";
import { useUsage } from "@/hooks/use-usage";
import { cn } from "@/lib/utils";
import type { CreateAnalysisPayload } from "@/types/api";

const MAX_ADS = 10;
const MAX_SCREENSHOTS = 6;
const AD_TEXT_MAX = 5000;
const NO_PROJECT = "__none__";

type TextAd = { kind: "text"; id: string; text: string; label: string };
type ImageAd = { kind: "image"; id: string; label: string; upload: UploadedScreenshot };
type AdDraft = TextAd | ImageAd;

const newId = () => Math.random().toString(36).slice(2, 10);

export function NewAnalysisForm() {
  const router = useRouter();
  const { data: projects } = useProjects();
  const { data: usage } = useUsage();
  const { upload, uploading, release } = useUpload();
  const create = useCreateAnalysis();

  const [url, setUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>(NO_PROJECT);
  const [ads, setAds] = React.useState<AdDraft[]>([{ kind: "text", id: newId(), text: "", label: "" }]);
  const [errors, setErrors] = React.useState<{ url?: string; ads?: string }>({});
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const adsPerAnalysis = usage?.plan.limits.adsPerAnalysis ?? MAX_ADS;
  const screenshotCount = ads.filter((a) => a.kind === "image").length;

  /**
   * Only ads with content count against the plan limit.
   *
   * The form opens with one blank text ad, and that blank was being counted.
   * On the Free plan, which allows two ads, it meant a single screenshot filled
   * the quota and disabled both buttons — the upload control appeared broken
   * when it was actually just full of nothing.
   */
  const filledAds = ads.filter((ad) => (ad.kind === "image" ? true : ad.text.trim().length > 0)).length;
  const adCapacity = Math.min(adsPerAnalysis, MAX_ADS);
  const atAdLimit = filledAds >= adCapacity;

  function addTextAd() {
    if (atAdLimit) return;
    setAds((prev) => [...prev, { kind: "text", id: newId(), text: "", label: "" }]);
  }

  function removeAd(id: string) {
    setAds((prev) => {
      const going = prev.find((ad) => ad.id === id);
      if (going?.kind === "image") release(going.upload.previewUrl);
      return prev.filter((ad) => ad.id !== id);
    });
  }

  function patchAd(id: string, patch: Partial<TextAd> & Partial<ImageAd>) {
    setAds((prev) => prev.map((ad) => (ad.id === id ? ({ ...ad, ...patch } as AdDraft) : ad)));
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const room = adCapacity - filledAds;
    const screenshotRoom = MAX_SCREENSHOTS - screenshotCount;
    const allowed = list.slice(0, Math.max(0, Math.min(room, screenshotRoom)));

    if (allowed.length < list.length) {
      toast.warning(`Only ${allowed.length} of ${list.length} images fit within your limits.`);
    }

    for (const file of allowed) {
      try {
        const uploaded = await upload(file);
        setAds((prev) => [...prev, { kind: "image", id: newId(), label: "", upload: uploaded }]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed.");
      }
    }
  }

  function validate(): CreateAnalysisPayload | null {
    const next: typeof errors = {};

    if (url.trim().length < 4) next.url = "Enter the landing page URL the ads point at.";

    const payloadAds: CreateAnalysisPayload["ads"] = [];
    for (const ad of ads) {
      if (ad.kind === "text") {
        const text = ad.text.trim();
        if (text.length === 0) continue;
        if (text.length < 10) {
          next.ads = "Each pasted ad needs at least a headline and a line of body copy.";
          continue;
        }
        payloadAds.push({ type: "text", text, ...(ad.label.trim() ? { label: ad.label.trim() } : {}) });
      } else {
        payloadAds.push({
          type: "image",
          storagePath: ad.upload.storagePath,
          mimeType: ad.upload.mimeType,
          fileSize: ad.upload.fileSize,
          ...(ad.label.trim() ? { label: ad.label.trim() } : {}),
        });
      }
    }

    if (payloadAds.length === 0) next.ads ??= "Add at least one ad — paste the copy or upload a screenshot.";

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      url: url.trim(),
      ads: payloadAds,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(projectId !== NO_PROJECT ? { projectId } : {}),
    };
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = validate();
    if (!payload) return;

    create.mutate(payload, {
      onSuccess: (data) => router.push(`/analyses/${data.id}`),
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not start the analysis."),
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">The landing page</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field invalid={Boolean(errors.url)}>
              <FieldLabel htmlFor="url">Landing page URL</FieldLabel>
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="acme.com/pricing"
                inputMode="url"
                aria-invalid={Boolean(errors.url)}
                className="font-mono"
              />
              <FieldDescription>
                The page the ads click through to. It has to be publicly reachable — pages behind a login cannot be read.
              </FieldDescription>
              <FieldError>{errors.url}</FieldError>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="title">Name this analysis</FieldLabel>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Q3 free trial push"
                  maxLength={120}
                />
                <FieldDescription>Optional. We name it after the page if you leave it blank.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="project">Project</FieldLabel>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger id="project">
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={NO_PROJECT}>No project</SelectItem>
                      {(projects ?? []).map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>Optional. Groups related funnels together.</FieldDescription>
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-base">The ads</CardTitle>
            <p className="text-sm text-muted-foreground">
              Paste the copy or drop screenshots. More than one ad unlocks angle clustering.
            </p>
          </div>
          <Badge variant="secondary" className="font-mono">
            {filledAds}/{adCapacity}
          </Badge>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {ads.map((ad, index) => (
            <div key={ad.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className="label-mono">Ad {String(index + 1).padStart(2, "0")}</span>
                  <Badge variant="outline" className="gap-1">
                    {ad.kind === "text" ? <Type className="size-3" /> : <ImagePlus className="size-3" />}
                    {ad.kind === "text" ? "Pasted copy" : "Screenshot"}
                  </Badge>
                </span>
                {ads.length > 1 ? (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeAd(ad.id)} aria-label={`Remove ad ${index + 1}`}>
                    <Trash2 />
                  </Button>
                ) : null}
              </div>

              {ad.kind === "text" ? (
                <Textarea
                  value={ad.text}
                  onChange={(e) => patchAd(ad.id, { text: e.target.value })}
                  placeholder={"Headline\nPrimary text\nCTA button label"}
                  maxLength={AD_TEXT_MAX}
                  rows={5}
                  aria-label={`Ad ${index + 1} copy`}
                />
              ) : (
                <div className="flex items-center gap-3">
                  {/* A plain img, deliberately. next/image parses `src` and
                      throws on a blob: URL — `unoptimized` skips the loader but
                      not the validation — so the upload would succeed and then
                      rendering its preview would crash the form. There is also
                      nothing for the optimiser to do with an in-memory blob. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ad.upload.previewUrl}
                    alt={`Preview of ${ad.upload.fileName}`}
                    width={96}
                    height={96}
                    className="size-24 rounded-md border border-border object-cover"
                  />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-mono text-xs">{ad.upload.fileName}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {(ad.upload.fileSize / 1024).toFixed(0)} KB · text is read on the server
                    </span>
                  </div>
                </div>
              )}

              <Input
                value={ad.label}
                onChange={(e) => patchAd(ad.id, { label: e.target.value })}
                placeholder="Label (optional) — e.g. Meta / retargeting"
                maxLength={80}
                className="h-8 text-xs"
                aria-label={`Ad ${index + 1} label`}
              />
            </div>
          ))}

          <FieldError>{errors.ads}</FieldError>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <Upload className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Drop ad screenshots here, or add another ad below.
              <br />
              <span className="font-mono text-xs">
                PNG, JPEG, WebP or GIF · up to {MAX_SCREENSHOTS} images · 10 MB each
              </span>
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || atAdLimit || screenshotCount >= MAX_SCREENSHOTS}
              >
                {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                Upload screenshots
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addTextAd} disabled={atAdLimit}>
                <Plus />
                Paste another ad
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground">
          {usage ? (
            <>
              <span className="font-mono">{usage.usage.analysesRemaining}</span> of{" "}
              <span className="font-mono">{usage.usage.analysesLimit}</span> analyses left this month.
            </>
          ) : null}
        </p>

        <Button type="submit" size="lg" disabled={create.isPending || uploading}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {create.isPending ? "Starting…" : "Analyse fit"}
        </Button>
      </div>
    </form>
  );
}
