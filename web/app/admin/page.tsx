"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { persistActiveProjectToProfile } from "../lib/activeProject";
import { fetchApi, API_BASE } from "../lib/api";
import { projectKeyFromDisplayName } from "../lib/projectKey";
import { localAgent, getLocalProjectPath, setLocalProjectPath, isLocalAgentContext } from "../lib/localAgentClient";
import { useAuth } from "../contexts/AuthContext";
import {
  createVacationEmployee,
  deleteVacationEmployee,
  fetchVacationEmployees,
  updateVacationEmployee,
} from "../vacations/vacationClient";
import type { VacationEmployee } from "../vacations/types";

type SourceItem = {
  id: string;
  title: string;
  created_at: string;
  agent_id?: string | null;
  agent_ids?: string[] | null;
  scope?: "generic" | "project";
  project_key?: string | null;
  source_path?: string | null;
};

type ProjectItem = {
  project_key: string;
  display_name: string;
  project_path: string;
  created_at: string;
  updated_at: string;
};

type ExportPdfResponse = {
  ok: boolean;
  filename: string;
  path: string;
  download_url?: string;
};

type ToolPathsResponse = {
  PROJECT_PATH?: string;
  DOC_OUTPUT_DIR?: string;
  IMAGES_OUTPUT_DIR?: string;
};

const AGENTS = [
  { id: "creative_director", name: "Creative Director" },
  { id: "art_director", name: "Art Director" },
  { id: "technical_director", name: "Technical Director" },
  { id: "producer", name: "Producer" },
];

/** Shown when the agent on :8765 is down or NEXT_PUBLIC_LOCAL_AGENT_URL points at the API (:8000). */
const LOCAL_AGENT_UNREACHABLE_MSG =
  "Local agent not reachable. Run it on 127.0.0.1:8765 and set NEXT_PUBLIC_LOCAL_AGENT_URL to that (not the API). Restart the Next dev server after .env changes.";

export default function AdminPage() {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [agentIds, setAgentIds] = useState<string[]>(
    AGENTS[0]?.id ? [AGENTS[0].id] : [],
  );
  const [scope, setScope] = useState<"generic" | "project">("generic");
  const [projectKey, setProjectKey] = useState("");
  const [activeProjectKey, setActiveProjectKey] = useState("");
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [newProject, setNewProject] = useState({
    display_name: "",
    project_path: "",
  });
  const [editProjectKey, setEditProjectKey] = useState<string | null>(null);
  const [editProject, setEditProject] = useState({
    display_name: "",
    project_path: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{
    state: "idle" | "success" | "error";
    message?: string;
    filename?: string;
    downloadUrl?: string;
  }>({ state: "idle" });
  const [pathsStatus, setPathsStatus] = useState<{
    state: "idle" | "success" | "error";
    message?: string;
    data?: ToolPathsResponse;
  }>({ state: "idle" });
  const [debugPrompts, setDebugPrompts] = useState(false);
  const [imageDefaults, setImageDefaults] = useState({
    num_images: 2,
    quality: "medium" as "high" | "medium" | "low",
    location: "local" as "local" | "cloud",
  });
  const [imageDefaultsStatus, setImageDefaultsStatus] = useState<string | null>(null);
  const [uiTheme, setUiTheme] = useState<"original" | "ocean" | "forest">("ocean");
  const [uiThemeStatus, setUiThemeStatus] = useState<string | null>(null);
  const [ragTestStatus, setRagTestStatus] = useState<{
    state: "idle" | "success" | "error";
    message?: string;
    currentProject?: string;
    currentAgent?: string;
    currentProjectSources?: SourceItem[];
    otherSources?: SourceItem[];
  }>({ state: "idle" });
  const [activeTab, setActiveTab] = useState<
    "projects" | "rag" | "settings" | "tests" | "users" | "employees"
  >("projects");
  const { authUser, session } = useAuth();
  const [users, setUsers] = useState<{
    id: string;
    email?: string | null;
    created_at?: string;
    role?: string;
    provider?: string;
    images_today?: number;
    images_total?: number;
  }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<VacationEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [employeesStatus, setEmployeesStatus] = useState<string | null>(null);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeeTitle, setNewEmployeeTitle] = useState("");
  const [newEmployeeStartDate, setNewEmployeeStartDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [newEmployeeUserEmail, setNewEmployeeUserEmail] = useState("");
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editEmployeeName, setEditEmployeeName] = useState("");
  const [editEmployeeTitle, setEditEmployeeTitle] = useState("");
  const [editEmployeeStartDate, setEditEmployeeStartDate] = useState("");
  const [editEmployeeUserEmail, setEditEmployeeUserEmail] = useState("");
  const adminTopRef = useRef<HTMLDivElement | null>(null);

  const loadSources = async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      const response = await fetchApi("/rag/sources");
      if (!response.ok) {
        throw new Error(`Load failed: ${response.status}`);
      }
      const data = (await response.json()) as SourceItem[];
      setSources(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjects = async () => {
    setIsProjectsLoading(true);
    setProjectStatus(null);
    try {
      const response = await fetchApi("/projects");
      if (!response.ok) {
        throw new Error(`Load failed: ${response.status}`);
      }
      const data = (await response.json()) as ProjectItem[];
      setProjects(data);
      /** API stores paths in api/.local_data/project_paths.json; keep browser cache aligned when the server has a path. */
      for (const project of data) {
        const serverPath = project.project_path?.trim();
        if (serverPath) {
          setLocalProjectPath(project.project_key, serverPath);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setProjectStatus(`Error: ${message}`);
    } finally {
      setIsProjectsLoading(false);
      setProjectsLoaded(true);
    }
  };

  const loadEmployees = async () => {
    setEmployeesLoading(true);
    setEmployeesError(null);
    try {
      const data = await fetchVacationEmployees();
      setEmployees(data);
    } catch (err) {
      setEmployeesError(err instanceof Error ? err.message : "Failed to load employees.");
    } finally {
      setEmployeesLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const response = await fetchApi("/users");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        id: string;
        email?: string | null;
        created_at?: string;
        role?: string;
        provider?: string;
        images_today?: number;
        images_total?: number;
      }[];
      setUsers(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setUsersError(message);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadImageDefaults = async () => {
    setImageDefaultsStatus(null);
    try {
      const response = await fetchApi("/settings/image_defaults");
      if (!response.ok) {
        throw new Error(`Load failed: ${response.status}`);
      }
      const data = (await response.json()) as {
        num_images?: number;
        quality?: "high" | "medium" | "low";
        location?: "local" | "cloud";
      };
      setImageDefaults((prev) => {
        const next = {
          ...prev,
          ...data,
        };
        // Ensure location always stays within the \"local\" | \"cloud\" union
        if (next.location !== "local" && next.location !== "cloud") {
          next.location = prev.location;
        }
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setImageDefaultsStatus(`Error: ${message}`);
    }
  };

  const loadUiTheme = async () => {
    setUiThemeStatus(null);
    try {
      const response = await fetchApi("/settings/ui_theme");
      if (!response.ok) {
        throw new Error(`Load failed: ${response.status}`);
      }
      const data = (await response.json()) as { theme?: "original" | "ocean" | "forest" };
      if (data.theme === "original" || data.theme === "ocean" || data.theme === "forest") {
        setUiTheme(data.theme);
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", data.theme);
        }
        window.localStorage.setItem("uiTheme", data.theme);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setUiThemeStatus(`Error: ${message}`);
    }
  };

  useEffect(() => {
    if (!session) return;
    const stored = window.localStorage.getItem("activeProjectKey");
    if (stored) {
      setActiveProjectKey(stored);
    }
    const debugStored = window.localStorage.getItem("debugPrompts");
    if (debugStored === "true") {
      setDebugPrompts(true);
    }
    void loadSources();
    void loadProjects();
    void loadImageDefaults();
    void loadUiTheme();
  }, [session]);

  useEffect(() => {
    const syncFromStorage = () => {
      const stored = window.localStorage.getItem("activeProjectKey") || "";
      setActiveProjectKey(stored);
    };
    window.addEventListener("activeProjectChanged", syncFromStorage);
    return () => window.removeEventListener("activeProjectChanged", syncFromStorage);
  }, []);

  useEffect(() => {
    if (!projectsLoaded) return;
    if (projects.length === 0) {
      if (activeProjectKey) {
        setActiveProjectKey("");
        window.localStorage.removeItem("activeProjectKey");
        void persistActiveProjectToProfile(null);
      }
      if (scope === "project") {
        setScope("generic");
      }
      return;
    }
    const exists = projects.some((project) => project.project_key === activeProjectKey);
    if (activeProjectKey && !exists) {
      setActiveProjectKey("");
      window.localStorage.removeItem("activeProjectKey");
      void persistActiveProjectToProfile(null);
    }
  }, [projects, activeProjectKey, scope, projectsLoaded]);

  useEffect(() => {
    if (scope === "project") {
      setProjectKey((prev) => prev || activeProjectKey || "");
    } else {
      setProjectKey("");
    }
  }, [scope, activeProjectKey, projects]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus("Error: Please select a PDF, DOCX, or XLSX file.");
      return;
    }
    if (!file.name.toLowerCase().match(/\.(pdf|docx|xlsx)$/)) {
      setStatus("Error: Only PDF, DOCX, or XLSX files are supported.");
      return;
    }
    if (scope === "project" && !projectKey.trim()) {
      setStatus("Error: Project key is required for project scope.");
      return;
    }

    setIsUploading(true);
    setStatus("Uploading...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("scope", scope);
      if (title.trim()) {
        formData.append("title", title.trim());
      }
      if (sourcePath.trim()) {
        formData.append("source_path", sourcePath.trim());
      }
      if (scope === "project" && projectKey.trim()) {
        formData.append("project_key", projectKey.trim());
      }
      if (agentIds.length > 0) {
        agentIds.forEach((agentId) => formData.append("agent_ids", agentId));
      }

      const response = await fetchApi("/rag/upload_pdf", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Upload failed: ${response.status}`);
      }

      setStatus("Upload successful.");
      setTitle("");
      setSourcePath("");
      setScope("generic");
      setProjectKey("");
      if (fileRef.current) {
        fileRef.current.value = "";
      }
      await loadSources();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error: ${message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRefresh = async (item: SourceItem) => {
    if (!item.source_path) return;
    setStatus("Updating source...");
    try {
      const response = await fetchApi(`/rag/sources/${item.id}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const text = await response.text();
      if (!response.ok) {
        let msg = text || `Update failed: ${response.status}`;
        try {
          const j = JSON.parse(text) as { detail?: string };
          if (j.detail) msg = j.detail;
        } catch {
          // use msg as-is
        }
        throw new Error(msg);
      }
      setStatus("Source updated.");
      await loadSources();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error: ${message}`);
    }
  };

  const pickProjectFolder = useCallback(async (target: "new" | "edit") => {
    if (!isLocalAgentContext()) {
      setProjectStatus(
        "The folder picker runs on your computer through the local agent. Open this app from http://localhost:3000 (or your NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS host). You can still type the path manually.",
      );
      return;
    }
    const ok = await localAgent.health();
    if (!ok) {
      setProjectStatus(LOCAL_AGENT_UNREACHABLE_MSG);
      return;
    }
    setProjectStatus("Choose a folder in the dialog on your computer…");
    try {
      const result = await localAgent.pickDirectory();
      if (result.cancelled) {
        setProjectStatus(null);
        return;
      }
      if (result.path) {
        await localAgent.approveProjectRoot(result.path);
        if (target === "new") {
          setNewProject((prev) => ({ ...prev, project_path: result.path! }));
        } else {
          setEditProject((prev) => ({ ...prev, project_path: result.path! }));
        }
        setProjectStatus("Project folder selected.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Folder picker failed";
      setProjectStatus(message);
    }
  }, []);

  const handleProjectSave = async () => {
    setProjectStatus(null);
    const displayName = newProject.display_name.trim();
    if (!displayName) {
      setProjectStatus("Error: project name is required.");
      return;
    }
    const projectKeyInput = projectKeyFromDisplayName(displayName);
    if (projects.some((project) => project.project_key === projectKeyInput)) {
      setProjectStatus(
        `Error: a project with key "${projectKeyInput}" already exists. Change the name slightly.`,
      );
      return;
    }
    try {
      const localPath = newProject.project_path.trim();
      if (localPath) {
        if (isLocalAgentContext()) {
          const ok = await localAgent.health();
          if (!ok) {
            setProjectStatus(LOCAL_AGENT_UNREACHABLE_MSG);
            return;
          }
          await localAgent.approveProjectRoot(localPath);
        }
        setLocalProjectPath(projectKeyInput, localPath);
      }
      const response = await fetchApi("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_key: projectKeyInput,
          display_name: displayName,
          ...(localPath ? { project_path: localPath } : {}),
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Create failed: ${response.status}`);
      }
      setNewProject({ display_name: "", project_path: "" });
      await loadProjects();
      if (!localPath) {
        setProjectStatus("Project saved. Set a local path for local agent features.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setProjectStatus(`Error: ${message}`);
    }
  };

  const handleProjectEdit = (project: ProjectItem) => {
    setEditProjectKey(project.project_key);
    setEditProject({
      display_name: project.display_name,
      project_path:
        project.project_path?.trim() || getLocalProjectPath(project.project_key) || "",
    });
  };

  const handleProjectUpdate = async () => {
    if (!editProjectKey) return;
    setProjectStatus(null);
    if (!editProject.display_name.trim()) {
      setProjectStatus("Error: display_name is required.");
      return;
    }
    try {
      const localPath = editProject.project_path.trim();
      if (localPath) {
        if (isLocalAgentContext()) {
          const ok = await localAgent.health();
          if (!ok) {
            setProjectStatus(LOCAL_AGENT_UNREACHABLE_MSG);
            return;
          }
          await localAgent.approveProjectRoot(localPath);
        }
        setLocalProjectPath(editProjectKey, localPath);
      }
      const response = await fetchApi(`/projects/${editProjectKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: editProject.display_name.trim(),
          ...(localPath ? { project_path: localPath } : {}),
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Update failed: ${response.status}`);
      }
      setEditProjectKey(null);
      await loadProjects();
      if (!localPath) {
        setProjectStatus("Project updated. Set a local path for local agent features.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setProjectStatus(`Error: ${message}`);
    }
  };

  const handleProjectDelete = async (project: ProjectItem) => {
    const confirmed = window.confirm(`Delete project "${project.display_name}"?`);
    if (!confirmed) return;
    setProjectStatus(null);
    try {
      const response = await fetchApi(`/projects/${project.project_key}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const text = await response.text();
        if (response.status === 409) {
          setProjectStatus("Error: project has sources; delete sources first.");
          return;
        }
        throw new Error(text || `Delete failed: ${response.status}`);
      }
      await loadProjects();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setProjectStatus(`Error: ${message}`);
    }
  };

  const handleActiveProjectChange = (value: string) => {
    setActiveProjectKey(value);
    if (value) {
      window.localStorage.setItem("activeProjectKey", value);
      const name = projects.find((project) => project.project_key === value)?.display_name || value;
      window.localStorage.setItem("activeProjectName", name);
    } else {
      window.localStorage.removeItem("activeProjectKey");
      window.localStorage.removeItem("activeProjectName");
    }
    window.dispatchEvent(new Event("activeProjectChanged"));
    void persistActiveProjectToProfile(value.trim() || null);
    if (scope === "project") {
      setProjectKey(value);
    }
  };

  const handleDelete = async (item: SourceItem) => {
    const confirmed = window.confirm(`Delete "${item.title}"? This cannot be undone.`);
    if (!confirmed) return;

    setStatus("Deleting...");
    try {
      const response = await fetchApi(`/rag/sources/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Delete failed: ${response.status}`);
      }
      setStatus("Deleted.");
      await loadSources();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error: ${message}`);
    }
  };

  const runPdfExportTest = async () => {
    setIsTesting(true);
    setTestStatus({ state: "idle" });
    try {
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "");
      const payload = {
        title: "PDF Export Test",
        content: "Hello from the PDF export test.",
        filename: `pdf_export_test_${timestamp}.pdf`,
        project_key: activeProjectKey || undefined,
      };

      const response = await fetchApi("/tools/export_pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
      }

      let data: ExportPdfResponse;
      try {
        data = (await response.json()) as ExportPdfResponse;
      } catch {
        throw new Error("Failed to parse server response.");
      }

      const filename = data.filename;
      const downloadUrl =
        data.download_url && data.download_url.startsWith("http")
          ? data.download_url
          : data.download_url
            ? `${API_BASE}${data.download_url.startsWith("/") ? "" : "/"}${data.download_url}`
            : `${API_BASE}/downloads/${filename}`;

      setTestStatus({
        state: "success",
        message: "PDF export test succeeded.",
        filename,
        downloadUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setTestStatus({ state: "error", message });
    } finally {
      setIsTesting(false);
    }
  };

  const runPathsTest = async () => {
    setPathsStatus({ state: "idle" });
    try {
      const query = activeProjectKey ? `?project_key=${activeProjectKey}` : "";
      const response = await fetchApi(`/tools/paths${query}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
      }
      const data = (await response.json()) as ToolPathsResponse;
      setPathsStatus({ state: "success", data });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setPathsStatus({ state: "error", message });
    }
  };

  const toggleDebugPrompts = (checked: boolean) => {
    setDebugPrompts(checked);
    window.localStorage.setItem("debugPrompts", checked ? "true" : "false");
  };

  const runRagSourcesTest = async () => {
    setRagTestStatus({ state: "idle" });
    const selectedAgent = agentIds[0] || AGENTS[0]?.id || "";
    const currentProject = activeProjectKey || "";
    if (!selectedAgent) {
      setRagTestStatus({ state: "error", message: "No agent selected." });
      return;
    }
    try {
      const response = await fetchApi("/rag/sources");
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Load failed: ${response.status}`);
      }
      const data = (await response.json()) as SourceItem[];
      const matchesAgent = (item: SourceItem) =>
        (item.agent_ids && item.agent_ids.includes(selectedAgent)) ||
        item.agent_id === selectedAgent;

      const currentProjectSources = data.filter(
        (item) =>
          matchesAgent(item) &&
          item.scope === "project" &&
          !!currentProject &&
          item.project_key === currentProject,
      );
      const otherSources = data.filter((item) => {
        if (!matchesAgent(item)) return false;
        if (item.scope === "project" && currentProject) {
          return item.project_key !== currentProject;
        }
        return item.scope !== "project";
      });

      setRagTestStatus({
        state: "success",
        currentProject,
        currentAgent: selectedAgent,
        currentProjectSources,
        otherSources,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setRagTestStatus({ state: "error", message });
    }
  };

  const saveImageDefaults = async () => {
    setImageDefaultsStatus("Saving...");
    try {
      const response = await fetchApi("/settings/image_defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          num_images: imageDefaults.num_images,
          quality: imageDefaults.quality,
          location: imageDefaults.location,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Save failed: ${response.status}`);
      }
      const data = (await response.json()) as {
        num_images?: number;
        quality?: "high" | "medium" | "low";
        location?: "local" | "cloud";
      };
      setImageDefaults((prev) => ({
        ...prev,
        ...data,
      }));
      setImageDefaultsStatus("Saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setImageDefaultsStatus(`Error: ${message}`);
    }
  };

  const saveUiTheme = async () => {
    setUiThemeStatus(null);
    try {
      const response = await fetchApi("/settings/ui_theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: uiTheme }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Save failed: ${response.status}`);
      }
      const data = (await response.json()) as { theme?: "original" | "ocean" | "forest" };
      if (data.theme === "original" || data.theme === "ocean" || data.theme === "forest") {
        setUiTheme(data.theme);
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", data.theme);
        }
        window.localStorage.setItem("uiTheme", data.theme);
      }
      setUiThemeStatus("Theme saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setUiThemeStatus(`Error: ${message}`);
    }
  };

  useEffect(() => {
    if (activeTab !== "users" && activeTab !== "employees") {
      return;
    }
    requestAnimationFrame(() => {
      adminTopRef.current?.scrollIntoView({ block: "start" });
    });
  }, [activeTab]);

  return (
    <main>
      <div ref={adminTopRef} className="admin-shell">
        <div className="admin-header">
          <div className="admin-header-left">
            <div className="admin-title">Admin</div>
          </div>
          <div className="admin-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "projects"}
              className={activeTab === "projects" ? "admin-tab active" : "admin-tab"}
              onClick={() => setActiveTab("projects")}
            >
              Projects
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "rag"}
              className={activeTab === "rag" ? "admin-tab active" : "admin-tab"}
              onClick={() => setActiveTab("rag")}
            >
              RAG
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "settings"}
              className={activeTab === "settings" ? "admin-tab active" : "admin-tab"}
              onClick={() => setActiveTab("settings")}
            >
              Settings
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "tests"}
              className={activeTab === "tests" ? "admin-tab active" : "admin-tab"}
              onClick={() => setActiveTab("tests")}
            >
              Tests
            </button>
            {authUser?.is_admin && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "users"}
                className={activeTab === "users" ? "admin-tab active" : "admin-tab"}
                onClick={() => {
                  setActiveTab("users");
                  loadUsers();
                }}
              >
                Users
              </button>
            )}
            {authUser?.is_admin && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "employees"}
                className={activeTab === "employees" ? "admin-tab active" : "admin-tab"}
                onClick={() => {
                  setActiveTab("employees");
                  void loadEmployees();
                }}
              >
                Employees
              </button>
            )}
          </div>
        </div>

        {activeTab === "projects" && (
        <>
        {projectStatus && <div className="admin-status">{projectStatus}</div>}

        <div className="admin-card">
          <div className="admin-card-title">Active project</div>
          <p style={{ margin: "0 0 1rem", fontSize: 14, color: "var(--muted, #94a3b8)" }}>
            Choose which project the app uses for pipelines, Image Gen, and local paths.
          </p>
          <div className="admin-project-active">
            <label>
              Active Project
              <select
                value={activeProjectKey}
                onChange={(e) => handleActiveProjectChange(e.target.value)}
                disabled={projects.length === 0}
              >
                <option value="">None</option>
                {projects.map((project) => (
                  <option key={project.project_key} value={project.project_key}>
                    {project.display_name}
                  </option>
                ))}
              </select>
            </label>
            {activeProjectKey && (
              <span className="admin-active-badge">
                Active: {projects.find((p) => p.project_key === activeProjectKey)?.display_name}
              </span>
            )}
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Registered projects</div>
          {isProjectsLoading ? (
            <div className="admin-empty">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="admin-empty">No projects yet.</div>
          ) : (
            <div className="admin-project-table">
              {projects.map((project) => {
                const isEditing = editProjectKey === project.project_key;
                const serverPath = project.project_path?.trim() || "";
                const browserOnlyPath = getLocalProjectPath(project.project_key)?.trim() || "";
                const displayPath = serverPath || browserOnlyPath;
                const pathOnlyInBrowser = !serverPath && !!browserOnlyPath;
                return (
                  <div className="admin-project-row" key={project.project_key}>
                    <div className="admin-project-main">
                      <div className="admin-project-title">{project.display_name}</div>
                      <div className="admin-project-meta">
                        <span className="admin-project-key">{project.project_key}</span> ·{" "}
                        {displayPath ? displayPath : "Local path not set"}
                        {pathOnlyInBrowser && (
                          <>
                            {" · "}
                            <span className="admin-path-missing" title="Open Edit → Save so the API server stores this path (needed for chat tools and server-side exports).">
                              Browser only — save to sync to server
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="admin-project-edit">
                        <label className="admin-field">
                          <span>Project name</span>
                          <input
                            type="text"
                            value={editProject.display_name}
                            onChange={(e) =>
                              setEditProject((prev) => ({ ...prev, display_name: e.target.value }))
                            }
                          />
                        </label>
                        <label className="admin-field admin-field-path">
                          <span>Project root path</span>
                          <div className="admin-path-input">
                            <input
                              type="text"
                              value={editProject.project_path}
                              onChange={(e) =>
                                setEditProject((prev) => ({
                                  ...prev,
                                  project_path: e.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="admin-link"
                              onClick={() => void pickProjectFolder("edit")}
                            >
                              Pick folder…
                            </button>
                          </div>
                        </label>
                        <button onClick={() => void handleProjectUpdate()}>Save</button>
                        <button
                          className="admin-link"
                          onClick={() => setEditProjectKey(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="admin-project-actions">
                        <button onClick={() => handleProjectEdit(project)}>Edit</button>
                        <button
                          className="admin-delete"
                          onClick={() => void handleProjectDelete(project)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {authUser?.is_admin && (
          <div className="admin-card">
            <div className="admin-card-title">Create new project</div>
            <p style={{ margin: "0 0 1rem", fontSize: 14, color: "var(--muted, #94a3b8)" }}>
              Add a display name and the project root path on the machine running the API (for RAG, Image Gen, and local agent).
            </p>
            <div className="admin-project-form">
              <label className="admin-field">
                <span>Project name</span>
                <input
                  type="text"
                  placeholder="Display name"
                  value={newProject.display_name}
                  onChange={(e) => setNewProject((prev) => ({ ...prev, display_name: e.target.value }))}
                />
              </label>
              {newProject.display_name.trim() !== "" && (
                <div className="admin-field-hint" style={{ marginTop: -4, marginBottom: 4, fontSize: 13, color: "var(--muted, #94a3b8)" }}>
                  Project key: <code>{projectKeyFromDisplayName(newProject.display_name)}</code>
                </div>
              )}
              <label className="admin-field admin-field-path">
                <span>Project root path</span>
                <div className="admin-path-input">
                  <input
                    type="text"
                    placeholder="Project path"
                    value={newProject.project_path}
                    onChange={(e) =>
                      setNewProject((prev) => ({ ...prev, project_path: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="admin-link"
                    onClick={() => void pickProjectFolder("new")}
                  >
                    Pick folder…
                  </button>
                </div>
              </label>
              <button onClick={() => void handleProjectSave()} disabled={isProjectsLoading}>
                Add Project
              </button>
            </div>
          </div>
        )}
        </>
        )}

        {activeTab === "rag" && (
        <>
        <div className="admin-card">
          <div className="admin-card-title">Upload PDF / DOCX / XLSX</div>
          <div className="admin-form">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && !title.trim()) {
                  setTitle(file.name);
                }
                if (file) {
                  const project = projects.find((p) => p.project_key === projectKey);
                  const basePath = scope === "project" && project?.project_path?.trim();
                  if (basePath) {
                    const sep = basePath.endsWith("/") || basePath.endsWith("\\") ? "" : "/";
                    setSourcePath(`${basePath}${sep}${file.name}`);
                  } else if (!sourcePath.trim()) {
                    setSourcePath("");
                  }
                }
              }}
            />
            <input
              type="text"
              placeholder="Optional title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as "generic" | "project")}
            >
              <option value="generic">Generic</option>
              <option value="project" disabled={projects.length === 0}>
                Project
              </option>
            </select>
            <select
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              disabled={scope !== "project" || projects.length === 0}
            >
              <option value="">Select project</option>
              {projects.map((project) => (
                <option key={project.project_key} value={project.project_key}>
                  {project.display_name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Full path on server for Update (e.g. C:\Projects\doc.pdf)"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              title="Store the full filesystem path so Update can re-index this file. Required for Update button."
            />
            <div className="admin-agent-select">
              {AGENTS.map((agent) => (
                <label key={agent.id} className="admin-agent-option">
                  <input
                    type="checkbox"
                    value={agent.id}
                    checked={agentIds.includes(agent.id)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAgentIds((prev) =>
                        checked ? [...prev, agent.id] : prev.filter((id) => id !== agent.id),
                      );
                    }}
                  />
                  {agent.name}
                </label>
              ))}
            </div>
            <button onClick={() => void handleUpload()} disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload"}
            </button>
          </div>
          {scope === "project" && projects.length === 0 && (
            <div className="admin-status">Add a project first to upload in project scope.</div>
          )}
          {status && <div className="admin-status">{status}</div>}
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Sources</div>
          {isLoading ? (
            <div className="admin-empty">Loading sources...</div>
          ) : sources.length === 0 ? (
            <div className="admin-empty">No sources yet.</div>
          ) : (
            <div className="admin-list">
              {(() => {
                const genericSources = sources.filter((item) => item.scope !== "project");
                const projectGroups = sources.reduce<Record<string, SourceItem[]>>(
                  (acc, item) => {
                    if (item.scope === "project") {
                      const key = item.project_key || "unspecified";
                      acc[key] = acc[key] ? [...acc[key], item] : [item];
                    }
                    return acc;
                  },
                  {},
                );

                return (
                  <>
                    {genericSources.length > 0 && (
                      <div className="admin-group">
                        <div className="admin-group-title">Generic</div>
                        {genericSources.map((item) => (
                          <div className="admin-row" key={item.id}>
                            <div className="admin-row-main">
                              <div className="admin-row-title">
                                {item.title}
                                <span className="scope-badge generic">Generic</span>
                              </div>
                              <div className="admin-row-meta">
                                {new Date(item.created_at).toLocaleString()} ·{" "}
                                {item.id.slice(0, 8)}
                                {item.agent_ids && item.agent_ids.length > 0
                                  ? ` · ${item.agent_ids.join(", ")}`
                                  : item.agent_id
                                    ? ` · ${item.agent_id}`
                                    : ""}
                              </div>
                              <div className="admin-row-path">
                                {item.source_path ? (
                                  <span className="admin-source-path" title={item.source_path}>
                                    {item.source_path}
                                  </span>
                                ) : (
                                  <span className="admin-path-missing">Path not set</span>
                                )}
                              </div>
                            </div>
                            <div className="admin-row-actions">
                              <button
                                className="admin-link"
                                onClick={() => void handleRefresh(item)}
                                disabled={!item.source_path}
                                title={
                                  item.source_path
                                    ? "Refresh from source_path"
                                    : "Add source_path to enable update"
                                }
                              >
                                Update
                              </button>
                              <button className="admin-delete" onClick={() => void handleDelete(item)}>
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {Object.keys(projectGroups).map((project) => (
                      <div className="admin-group" key={project}>
                        <div className="admin-group-title">
                          Project · <span className="admin-project-key">{project}</span>
                        </div>
                        {projectGroups[project].map((item) => (
                          <div className="admin-row" key={item.id}>
                            <div className="admin-row-main">
                              <div className="admin-row-title">
                                {item.title}
                                <span className="scope-badge project">Project</span>
                              </div>
                              <div className="admin-row-meta">
                                {new Date(item.created_at).toLocaleString()} ·{" "}
                                {item.id.slice(0, 8)}
                                {item.agent_ids && item.agent_ids.length > 0
                                  ? ` · ${item.agent_ids.join(", ")}`
                                  : item.agent_id
                                    ? ` · ${item.agent_id}`
                                    : ""}
                              </div>
                              <div className="admin-row-path">
                                {item.source_path ? (
                                  <span className="admin-source-path" title={item.source_path}>
                                    {item.source_path}
                                  </span>
                                ) : (
                                  <span className="admin-path-missing">Path not set</span>
                                )}
                              </div>
                            </div>
                            <div className="admin-row-actions">
                              <button
                                className="admin-link"
                                onClick={() => void handleRefresh(item)}
                                disabled={!item.source_path}
                                title={
                                  item.source_path
                                    ? "Refresh from source_path"
                                    : "Add source_path to enable update"
                                }
                              >
                                Update
                              </button>
                              <button className="admin-delete" onClick={() => void handleDelete(item)}>
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          )}
        </div>
        </>
        )}

        {activeTab === "tests" && (
          <div className="admin-card admin-test-card">
            <div className="admin-card-title">Tests</div>
            <div className="admin-test-row">
              <button onClick={() => void runPdfExportTest()} disabled={isTesting}>
                {isTesting ? "Running..." : "Run PDF Export Test"}
              </button>
              <button onClick={() => void runPathsTest()}>Show Paths</button>
              <button onClick={() => void runRagSourcesTest()}>Run RAG Sources Test</button>
            </div>
            <label className="admin-test-toggle">
              <input
                type="checkbox"
                checked={debugPrompts}
                onChange={(e) => toggleDebugPrompts(e.target.checked)}
              />
              Debug Prompts
            </label>
            {testStatus.state === "success" && (
              <div className="admin-test-status success">
                <div>{testStatus.message}</div>
                <div className="admin-test-meta">
                  File: {testStatus.filename}
                  {testStatus.downloadUrl && (
                    <>
                      {" · "}
                      <a className="admin-test-link" href={testStatus.downloadUrl}>
                        Download
                      </a>
                      {" · "}
                      <a
                        className="admin-test-link"
                        href={testStatus.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open PDF
                      </a>
                    </>
                  )}
                </div>
              </div>
            )}
            {testStatus.state === "error" && (
              <div className="admin-test-status error">Error: {testStatus.message}</div>
            )}
            {pathsStatus.state === "success" && (
              <div className="admin-test-status">
                <div className="admin-test-meta">
                  PROJECT_PATH: {pathsStatus.data?.PROJECT_PATH || "-"}
                </div>
                <div className="admin-test-meta">
                  DOC_OUTPUT_DIR: {pathsStatus.data?.DOC_OUTPUT_DIR || "-"}
                </div>
                <div className="admin-test-meta">
                  IMAGES_OUTPUT_DIR: {pathsStatus.data?.IMAGES_OUTPUT_DIR || "-"}
                </div>
              </div>
            )}
            {pathsStatus.state === "error" && (
              <div className="admin-test-status error">Error: {pathsStatus.message}</div>
            )}
            {ragTestStatus.state === "success" && (
              <div className="admin-test-status">
                <div className="admin-test-meta">
                  Agent: {ragTestStatus.currentAgent || "-"}
                </div>
                <div className="admin-test-meta">
                  Project: {ragTestStatus.currentProject || "(none)"}
                </div>
                <div className="admin-test-meta">
                  Current project docs:{" "}
                  {ragTestStatus.currentProjectSources?.length ?? 0}
                </div>
                {(ragTestStatus.currentProjectSources ?? []).map((item) => (
                  <div key={item.id} className="admin-test-meta">
                    - {item.title}
                  </div>
                ))}
                <div className="admin-test-meta">
                  Other docs for agent: {ragTestStatus.otherSources?.length ?? 0}
                </div>
                {(ragTestStatus.otherSources ?? []).map((item) => (
                  <div key={item.id} className="admin-test-meta">
                    - {item.title}
                  </div>
                ))}
              </div>
            )}
            {ragTestStatus.state === "error" && (
              <div className="admin-test-status error">Error: {ragTestStatus.message}</div>
            )}
          </div>
        )}

        {activeTab === "employees" && authUser?.is_admin && (
          <div className="admin-card admin-test-card">
            <div className="admin-card-title">Employees</div>
            <p style={{ margin: "0 0 1rem", fontSize: 14, color: "var(--muted, #94a3b8)" }}>
              People shown on the Vacations calendar. Set user email to link a login account to a row
              so non-admins can edit their own vacations.
            </p>
            {employeesStatus ? <div className="admin-status">{employeesStatus}</div> : null}
            {employeesError ? <div className="admin-test-status error">{employeesError}</div> : null}
            <div className="admin-test-grid" style={{ marginBottom: "1rem" }}>
              <label className="admin-field">
                <span>Name</span>
                <input
                  type="text"
                  value={newEmployeeName}
                  onChange={(e) => setNewEmployeeName(e.target.value)}
                  placeholder="Full name"
                />
              </label>
              <label className="admin-field">
                <span>Title</span>
                <input
                  type="text"
                  value={newEmployeeTitle}
                  onChange={(e) => setNewEmployeeTitle(e.target.value)}
                  placeholder="Job title"
                />
              </label>
              <label className="admin-field">
                <span>Start date</span>
                <input
                  type="date"
                  value={newEmployeeStartDate}
                  onChange={(e) => setNewEmployeeStartDate(e.target.value)}
                />
              </label>
              <label className="admin-field">
                <span>User email</span>
                <input
                  type="email"
                  value={newEmployeeUserEmail}
                  onChange={(e) => setNewEmployeeUserEmail(e.target.value)}
                  placeholder="login@company.com (optional)"
                />
              </label>
            </div>
            <button
              type="button"
              className="admin-btn"
              disabled={employeesLoading || !newEmployeeName.trim()}
              onClick={() => {
                void (async () => {
                  setEmployeesStatus(null);
                  try {
                    await createVacationEmployee(
                      newEmployeeName.trim(),
                      newEmployeeTitle.trim(),
                      newEmployeeStartDate,
                      newEmployeeUserEmail.trim() || undefined,
                    );
                    setNewEmployeeName("");
                    setNewEmployeeTitle("");
                    setNewEmployeeUserEmail("");
                    setEmployeesStatus("Employee added.");
                    await loadEmployees();
                  } catch (err) {
                    setEmployeesStatus(
                      err instanceof Error ? err.message : "Failed to add employee.",
                    );
                  }
                })();
              }}
            >
              Add employee
            </button>
            {employeesLoading && <div className="admin-test-status">Loading employees…</div>}
            {!employeesLoading && !employeesError && (
              <div className="admin-users-table-wrap" style={{ overflowX: "auto", marginTop: "1rem" }}>
                <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Name</th>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Title</th>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Start date</th>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>User email</th>
                      <th style={{ textAlign: "right", padding: "0.5rem" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee) => (
                      <tr key={employee.id}>
                        {editingEmployeeId === employee.id ? (
                          <>
                            <td style={{ padding: "0.5rem" }}>
                              <input
                                type="text"
                                value={editEmployeeName}
                                onChange={(e) => setEditEmployeeName(e.target.value)}
                              />
                            </td>
                            <td style={{ padding: "0.5rem" }}>
                              <input
                                type="text"
                                value={editEmployeeTitle}
                                onChange={(e) => setEditEmployeeTitle(e.target.value)}
                              />
                            </td>
                            <td style={{ padding: "0.5rem" }}>
                              <input
                                type="date"
                                value={editEmployeeStartDate}
                                onChange={(e) => setEditEmployeeStartDate(e.target.value)}
                              />
                            </td>
                            <td style={{ padding: "0.5rem" }}>
                              <input
                                type="email"
                                value={editEmployeeUserEmail}
                                onChange={(e) => setEditEmployeeUserEmail(e.target.value)}
                                placeholder="login@company.com"
                              />
                            </td>
                            <td style={{ padding: "0.5rem", textAlign: "right" }}>
                              <button
                                type="button"
                                className="admin-btn"
                                onClick={() => {
                                  void (async () => {
                                    setEmployeesStatus(null);
                                    try {
                                      await updateVacationEmployee(employee.id, {
                                        name: editEmployeeName.trim(),
                                        title: editEmployeeTitle.trim(),
                                        start_date: editEmployeeStartDate,
                                        user_email: editEmployeeUserEmail.trim() || null,
                                      });
                                      setEditingEmployeeId(null);
                                      setEmployeesStatus("Employee updated.");
                                      await loadEmployees();
                                    } catch (err) {
                                      setEmployeesStatus(
                                        err instanceof Error ? err.message : "Failed to update employee.",
                                      );
                                    }
                                  })();
                                }}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="admin-btn"
                                style={{ marginLeft: 8 }}
                                onClick={() => setEditingEmployeeId(null)}
                              >
                                Cancel
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: "0.5rem" }}>{employee.name}</td>
                            <td style={{ padding: "0.5rem" }}>{employee.title || "—"}</td>
                            <td style={{ padding: "0.5rem" }}>{employee.start_date}</td>
                            <td style={{ padding: "0.5rem" }}>{employee.user_email || "—"}</td>
                            <td style={{ padding: "0.5rem", textAlign: "right" }}>
                              <button
                                type="button"
                                className="admin-btn"
                                onClick={() => {
                                  setEditingEmployeeId(employee.id);
                                  setEditEmployeeName(employee.name);
                                  setEditEmployeeTitle(employee.title);
                                  setEditEmployeeStartDate(employee.start_date);
                                  setEditEmployeeUserEmail(employee.user_email ?? "");
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="admin-btn"
                                style={{ marginLeft: 8 }}
                                onClick={() => {
                                  if (!window.confirm(`Remove ${employee.name}?`)) {
                                    return;
                                  }
                                  void (async () => {
                                    setEmployeesStatus(null);
                                    try {
                                      await deleteVacationEmployee(employee.id);
                                      setEmployeesStatus("Employee removed.");
                                      await loadEmployees();
                                    } catch (err) {
                                      setEmployeesStatus(
                                        err instanceof Error ? err.message : "Failed to remove employee.",
                                      );
                                    }
                                  })();
                                }}
                              >
                                Remove
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "users" && (
          <div className="admin-card admin-test-card">
            <div className="admin-card-title">Users</div>
            {usersError && <div className="admin-test-status error">{usersError}</div>}
            {usersLoading && <div className="admin-test-status">Loading users…</div>}
            {!usersLoading && !usersError && (
              <div className="admin-users-table-wrap" style={{ overflowX: "auto" }}>
                <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Email</th>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Provider</th>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>ID</th>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Created</th>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Role</th>
                      <th style={{ textAlign: "right", padding: "0.5rem" }}>Images today</th>
                      <th style={{ textAlign: "right", padding: "0.5rem" }}>Images total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td style={{ padding: "0.5rem" }}>{u.email || "—"}</td>
                        <td style={{ padding: "0.5rem" }}>{u.provider || "—"}</td>
                        <td style={{ padding: "0.5rem", fontSize: "0.85em" }}>{u.id}</td>
                        <td style={{ padding: "0.5rem" }}>{u.created_at ? new Date(u.created_at).toLocaleString() : "—"}</td>
                        <td style={{ padding: "0.5rem" }}>{u.role || "—"}</td>
                        <td style={{ padding: "0.5rem", textAlign: "right" }}>{u.images_today ?? 0}</td>
                        <td style={{ padding: "0.5rem", textAlign: "right" }}>{u.images_total ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="admin-card admin-test-card">
            <div className="admin-card-title">Settings</div>
            <div className="admin-test-block">
              <div className="admin-test-title">UI Theme</div>
              <div className="admin-test-grid">
                <label className="admin-field">
                  <span>Color preset</span>
                  <select
                    value={uiTheme}
                    onChange={(e) => setUiTheme(e.target.value as "original" | "ocean" | "forest")}
                  >
                    <option value="original">Original</option>
                    <option value="ocean">Ocean</option>
                    <option value="forest">Forest</option>
                  </select>
                </label>
                <button type="button" onClick={() => void saveUiTheme()}>
                  Save Theme
                </button>
              </div>
              {uiThemeStatus && <div className="admin-status">{uiThemeStatus}</div>}
            </div>
            <div className="admin-test-block">
              <div className="admin-test-title">Image Defaults</div>
              <p style={{ margin: "0 0 10px", color: "var(--muted, #94a3b8)", fontSize: 13 }}>
                Used by Image Gen when generating, editing, or importing images.
              </p>
              <div className="admin-test-grid">
                <label className="admin-field">
                  <span>Variations</span>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={imageDefaults.num_images}
                    onChange={(e) =>
                      setImageDefaults((prev) => ({
                        ...prev,
                        num_images: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="admin-field">
                  <span>Quality</span>
                  <select
                    value={imageDefaults.quality}
                    onChange={(e) =>
                      setImageDefaults((prev) => ({
                        ...prev,
                        quality: e.target.value as "high" | "medium" | "low",
                      }))
                    }
                  >
                    <option value="high">High (1024)</option>
                    <option value="medium">Medium (512)</option>
                    <option value="low">Low (256)</option>
                  </select>
                </label>
                <label className="admin-field">
                  <span>Default Storage for Images</span>
                  <select
                    value={imageDefaults.location}
                    onChange={(e) =>
                      setImageDefaults((prev) => ({
                        ...prev,
                        location: e.target.value === "cloud" ? "cloud" : "local",
                      }))
                    }
                  >
                    <option value="local">Local (API server disk)</option>
                    <option value="cloud">Cloud (Supabase)</option>
                  </select>
                </label>
                <button onClick={() => void saveImageDefaults()}>Save Defaults</button>
              </div>
              {imageDefaultsStatus && <div className="admin-status">{imageDefaultsStatus}</div>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
