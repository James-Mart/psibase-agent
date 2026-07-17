import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FolderKanban, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useIssuesQuery } from "../api/queries";
import { useIssueUiStore } from "../store/use-issue-ui-store";
import { listProjects } from "../lib/build-tree";
import { issuePath, projectPath } from "../lib/links";

export function ProjectSidebar() {
  const navigate = useNavigate();
  const { projectId: selectedProjectId } = useParams();
  const { data } = useIssuesQuery();
  const openProjectDialog = useIssueUiStore((s) => s.openProjectDialog);
  const requestDelete = useIssueUiStore((s) => s.requestDelete);

  const projects = useMemo(
    () => listProjects(data?.issues ?? []),
    [data?.issues],
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <FolderKanban className="h-5 w-5 shrink-0 text-primary" />
          <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
            Issue Tracker
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupAction
            title="New project"
            onClick={() => openProjectDialog()}
          >
            <Plus />
            <span className="sr-only">New project</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                  No projects yet.
                </p>
              ) : (
                projects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      isActive={project.id === selectedProjectId}
                      tooltip={project.title}
                      onClick={() => navigate(projectPath(project.id))}
                    >
                      <FolderKanban />
                      <span>{project.title}</span>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover>
                          <MoreHorizontal />
                          <span className="sr-only">Project actions</span>
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start">
                        <DropdownMenuItem
                          onClick={() =>
                            navigate(issuePath(project.id, project.id))
                          }
                        >
                          <FolderKanban className="h-4 w-4" />
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            openProjectDialog({
                              id: project.id,
                              title: project.title,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => requestDelete(project.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
