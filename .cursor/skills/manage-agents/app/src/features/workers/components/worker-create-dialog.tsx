import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CreateWorkerError } from "@/lib/api/errors";
import { type BranchCheckResult, checkBranch, fetchOriginRefs } from "@/lib/api/git";
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

  const [branchCheck, setBranchCheck] = useState<BranchCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const fetchPromiseRef = useRef<Promise<void> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkIdRef = useRef(0);

  useEffect(() => {
    if (open) {
      fetchPromiseRef.current = fetchOriginRefs().catch(() => {});
    } else {
      setBranchCheck(null);
      setChecking(false);
      fetchPromiseRef.current = null;
    }
  }, [open]);

  const debouncedCheck = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || !branchPattern.test(value)) {
      setBranchCheck(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const id = ++checkIdRef.current;
    debounceRef.current = setTimeout(async () => {
      if (fetchPromiseRef.current) await fetchPromiseRef.current;
      try {
        const result = await checkBranch(value);
        if (checkIdRef.current === id) {
          setBranchCheck(result);
          setChecking(false);
        }
      } catch {
        if (checkIdRef.current === id) {
          setBranchCheck(null);
          setChecking(false);
        }
      }
    }, 300);
  }, []);

  const branchDetected = branchCheck?.localExists || branchCheck?.remoteRef;
  const detectedRef = branchCheck?.localExists
    ? form.getValues("branch")
    : branchCheck?.remoteRef ?? null;

  const onSubmit = (values: FormValues) => {
    const id = crypto.randomUUID();
    addPlaceholder({ id, branch: values.branch, phase: "creating" });
    closeCreateDialog();
    form.reset({ branch: "", sourceBranch: "" });
    setBranchCheck(null);

    createWorker.mutate(
      {
        branch: values.branch,
        sourceBranch: values.sourceBranch || undefined,
        existingBranch: branchCheck?.localExists || undefined,
        remoteOnly: (!branchCheck?.localExists && !!branchCheck?.remoteRef) || undefined,
      },
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
                      onChange={(e) => {
                        field.onChange(e);
                        debouncedCheck(e.target.value);
                      }}
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
                  <FormLabel>Source branch{branchDetected ? "" : " (optional)"}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={DEFAULT_SOURCE_BRANCH}
                      {...field}
                      disabled={!!branchDetected}
                      value={branchDetected ? (detectedRef ?? "") : field.value}
                    />
                  </FormControl>
                  {branchDetected && (
                    <FormDescription>
                      {branchCheck?.localExists
                        ? "Existing local branch — worktree will check it out directly."
                        : `Remote branch — worktree will track ${branchCheck?.remoteRef}.`}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={checking}>
                {checking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
