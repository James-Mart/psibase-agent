import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkerBuildTab } from "./worker-build-tab";
import { WorkerChainTab } from "./worker-chain-tab";

interface Props {
  name: string;
}

export function WorkerToolsTabs({ name }: Props) {
  return (
    <Tabs defaultValue="build">
      <TabsList>
        <TabsTrigger value="build">Build</TabsTrigger>
        <TabsTrigger value="chain">Chain</TabsTrigger>
      </TabsList>
      <TabsContent value="build">
        <WorkerBuildTab name={name} />
      </TabsContent>
      <TabsContent value="chain">
        <WorkerChainTab name={name} />
      </TabsContent>
    </Tabs>
  );
}
