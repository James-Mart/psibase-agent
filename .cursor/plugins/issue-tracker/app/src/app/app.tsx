import { Route, Routes } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TreePage } from "@/features/issues/components/tree-page";
import { IssueDetailPage } from "@/features/issues/components/issue-detail-page";
import { NewIssueDialog } from "@/features/issues/components/new-issue-dialog";
import { DeleteIssueDialog } from "@/features/issues/components/delete-issue-dialog";
import { ProjectSidebar } from "@/features/issues/components/project-sidebar";
import { ProjectDialog } from "@/features/issues/components/project-dialog";
import { useIssueEvents } from "@/features/issues/hooks/use-issue-events";

export function App() {
  useIssueEvents();
  return (
    <SidebarProvider>
      <ProjectSidebar />
      <SidebarInset>
        <Routes>
          <Route path="/" element={<TreePage />} />
          <Route path="/issues/:id" element={<IssueDetailPage />} />
        </Routes>
      </SidebarInset>
      <NewIssueDialog />
      <DeleteIssueDialog />
      <ProjectDialog />
    </SidebarProvider>
  );
}
