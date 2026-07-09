import { Route, Routes } from "react-router-dom";
import { TreePage } from "@/features/issues/components/tree-page";
import { IssueDetailPage } from "@/features/issues/components/issue-detail-page";
import { NewIssueDialog } from "@/features/issues/components/new-issue-dialog";
import { DeleteIssueDialog } from "@/features/issues/components/delete-issue-dialog";

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<TreePage />} />
        <Route path="/issues/:id" element={<IssueDetailPage />} />
      </Routes>
      <NewIssueDialog />
      <DeleteIssueDialog />
    </>
  );
}
