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
    <Tabs defaultValue="note" className="flex flex-col">
      <TabsList className="self-start">
        <TabsTrigger value="note">Note</TabsTrigger>
        <TabsTrigger value="diff">Diff</TabsTrigger>
        <TabsTrigger value="build">Build</TabsTrigger>
        <TabsTrigger value="chain">Chain</TabsTrigger>
        <TabsTrigger value="commit-review">Commit Review</TabsTrigger>
      </TabsList>
      <TabsContent value="note">
        <WorkerNoteTab name={name} />
      </TabsContent>
      <TabsContent value="diff">
        <WorkerDiffTab name={name} />
      </TabsContent>
      <TabsContent value="build">
        <WorkerBuildTab name={name} />
      </TabsContent>
      <TabsContent value="chain">
        <WorkerChainTab name={name} />
      </TabsContent>
      <TabsContent value="commit-review">
        <ReviewHistoryPanel name={name} />
      </TabsContent>
    </Tabs>
  );
}
