import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/lib/utils/use-copy-to-clipboard";

interface Props {
  path: string;
}

export function WorkerCopyPathButton({ path }: Props) {
  const { copiedKey, copy } = useCopyToClipboard();
  const copied = copiedKey === path;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={copied ? "Copied!" : "Copy path"}
      aria-label="Copy path"
      onClick={(e) => {
        e.stopPropagation();
        void copy(path);
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
