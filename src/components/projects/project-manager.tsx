"use client";

import * as React from "react";
import { FolderKanban, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateProject, useDeleteProject, useProjects } from "@/hooks/use-projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SWATCHES = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7"];

export function ProjectManager() {
  const { data: projects, isPending } = useProjects();
  const create = useCreateProject();
  const remove = useDeleteProject();

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState(SWATCHES[0]!);
  const [error, setError] = React.useState<string | null>(null);

  function submit() {
    if (name.trim().length < 2) {
      setError("Give the project a name of at least two characters.");
      return;
    }
    setError(null);

    create.mutate(
      { name: name.trim(), description: description.trim() || undefined, color },
      {
        onSuccess: () => {
          toast.success("Project created.");
          setOpen(false);
          setName("");
          setDescription("");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create the project."),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              New project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
              <DialogDescription>Group analyses that belong to the same funnel or client.</DialogDescription>
            </DialogHeader>

            <FieldGroup>
              <Field invalid={Boolean(error)}>
                <FieldLabel htmlFor="project-name">Name</FieldLabel>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q3 acquisition"
                  aria-invalid={Boolean(error)}
                />
                <FieldError>{error}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="project-description">Description</FieldLabel>
                <Textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Paid social funnels for the summer push."
                  rows={3}
                />
              </Field>

              <Field>
                <FieldLabel>Colour</FieldLabel>
                <div className="flex gap-2">
                  {SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setColor(swatch)}
                      aria-label={`Use colour ${swatch}`}
                      aria-pressed={color === swatch}
                      className={cn(
                        "size-7 rounded-full border-2 transition-transform",
                        color === swatch ? "scale-110 border-foreground" : "border-transparent",
                      )}
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={create.isPending}>
                {create.isPending ? <Loader2 className="animate-spin" /> : null}
                Create project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (projects ?? []).length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Projects are optional. They help once you are auditing more than one funnel at a time."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(projects ?? []).map((project) => (
            <li key={project.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color }} aria-hidden />
                  <span className="truncate text-sm font-medium">{project.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${project.name}`}
                  onClick={() =>
                    remove.mutate(project.id, {
                      onSuccess: () => toast.success("Project deleted. Its analyses were kept."),
                      onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete."),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>

              {project.description ? (
                <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{project.description}</p>
              ) : null}

              <p className="font-mono text-[11px] text-muted-foreground">/{project.slug}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
