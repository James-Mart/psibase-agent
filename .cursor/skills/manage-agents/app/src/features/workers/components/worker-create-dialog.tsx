import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CreateWorkerError } from "@/lib/api/errors";
import { DEFAULT_SOURCE_BRANCH } from "@/lib/api/types";
import { useCreateWorker } from "../api/mutations";
import { useWorkerUiStore } from "../store/use-worker-ui-store";

const branchPattern = /^[a-zA-Z0-9._/-]+$/;
const optionalBranchPattern = /^[a-zA-Z0-9._/-]*$/;

const formSchema = z.object({
  branch: z
    .string()
    .min(1, "Branch name is required")
    .regex(branchPattern, "Invalid branch name"),
  sourceBranch: z
    .string()
    .regex(optionalBranchPattern, "Invalid source branch"),
});

type FormValues = z.infer<typeof formSchema>;

export function WorkerCreateDialog() {
  const open = useWorkerUiStore((s) => s.showCreateDialog);
  const closeCreateDialog = useWorkerUiStore((s) => s.closeCreateDialog);
  const addPlaceholder = useWorkerUiStore((s) => s.addPlaceholder);
  const removePlaceholder = useWorkerUiStore((s) => s.removePlaceholder);
  const failPlaceholder = useWorkerUiStore((s) => s.failPlaceholder);
  const createWorker = useCreateWorker();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { branch: "", sourceBranch: "" },
  });

  const onSubmit = (values: FormValues) => {
    const id = crypto.randomUUID();
    addPlaceholder({ id, branch: values.branch, phase: "creating" });
    closeCreateDialog();
    form.reset({ branch: "", sourceBranch: "" });

    createWorker.mutate(
      { branch: values.branch, sourceBranch: values.sourceBranch },
      {
        onSuccess: () => removePlaceholder(id),
        onError: (err) => {
          const message = err instanceof Error ? err.message : String(err);
          const extra =
            err instanceof CreateWorkerError
              ? [err.stderr, err.output].filter(Boolean).join("\n\n")
              : undefined;
          failPlaceholder(id, { message, extra: extra || undefined });
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeCreateDialog();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Worker</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="branch"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Branch name</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      placeholder="my-feature-branch"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sourceBranch"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source branch (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder={DEFAULT_SOURCE_BRANCH} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
