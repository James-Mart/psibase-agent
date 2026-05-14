import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReviewHistoryPanel } from "@/features/review-history/components/review-history-panel";
import { WorkerBuildTab } from "./worker-build-tab";
import { WorkerChainTab } from "./worker-chain-tab";
import { WorkerDiffTab } from "./worker-diff-tab";
import { WorkerNoteTab } from "./worker-note-tab";

interface Props {
  name: string;
}

export function WorkerToolsTabs({ name }: Props) {
  return (
    <Tabs defaultValue="note" className="flex flex-1 min-h-0 flex-col">
      <TabsList className="self-start">
        <TabsTrigger value="build">Build</TabsTrigger>
        <TabsTrigger value="chain">Chain</TabsTrigger>
        <TabsTrigger value="commit-review">Commit Review</TabsTrigger>
        <TabsTrigger value="diff">Diff</TabsTrigger>
        <TabsTrigger value="note">Note</TabsTrigger>
      </TabsList>
      <TabsContent value="build" className="flex-1 min-h-0 overflow-auto">
        <WorkerBuildTab name={name} />
      </TabsContent>
      <TabsContent value="chain" className="flex-1 min-h-0 overflow-auto">
        <WorkerChainTab name={name} />
      </TabsContent>
      <TabsContent value="commit-review" className="flex-1 min-h-0 overflow-auto">
        <ReviewHistoryPanel name={name} />
      </TabsContent>
      <TabsContent value="diff" className="flex-1 min-h-0 overflow-auto">
        <WorkerDiffTab name={name} />
      </TabsContent>
      <TabsContent value="note" className="flex-1 min-h-0 overflow-auto">
        <WorkerNoteTab name={name} />
      </TabsContent>
    </Tabs>
  );
}
