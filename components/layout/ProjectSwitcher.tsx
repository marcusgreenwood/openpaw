"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useSessionsStore } from "@/lib/store/sessions";

const PROJECT_ICONS = ["📁", "🚀", "🔧", "🎨", "📦", "🌐", "🔬", "📊", "🎮", "🤖"];

export function ProjectSwitcher() {
  const {
    projects,
    activeProjectId,
    setActiveProject,
    addProject,
    deleteProject,
  } = useSessionsStore();

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [newIcon, setNewIcon] = useState("📁");
  const ref = useRef<HTMLDivElement>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreate = () => {
    if (!newName.trim() || !newPath.trim()) return;
    const id = addProject({
      name: newName.trim(),
      workspacePath: newPath.trim(),
      icon: newIcon,
    });
    setActiveProject(id);
    setNewName("");
    setNewPath("");
    setNewIcon("📁");
    setCreating(false);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer",
          "bg-white/5 border border-white/8 hover:bg-white/8 hover:border-white/12",
          open && "bg-white/8 border-white/12"
        )}
      >
        <span>{activeProject?.icon ?? "📁"}</span>
        <span className="text-text-secondary hidden sm:inline max-w-[120px] truncate">
          {activeProject?.name ?? "Default"}
        </span>
        <svg
          className={cn(
            "w-3 h-3 text-text-muted transition-transform",
            open && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-bg-overlay border border-white/10 rounded-xl p-2 z-50 shadow-xl shadow-black/30">
          {/* Default project */}
          <button
            onClick={() => {
              setActiveProject(null);
              setOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
              activeProjectId === null
                ? "bg-accent-cyan/10 text-accent-cyan"
                : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
            )}
          >
            <span>📁</span>
            <div className="flex-1 text-left min-w-0">
              <span className="font-medium block">Default</span>
              <span className="text-[10px] text-text-muted block truncate">
                workspace/
              </span>
            </div>
            {activeProjectId === null && (
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          {projects.length > 0 && (
            <div className="h-px bg-white/8 my-1" />
          )}

          {/* Project list */}
          {projects.map((project) => (
            <div
              key={project.id}
              className={cn(
                "group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                project.id === activeProjectId
                  ? "bg-accent-cyan/10 text-accent-cyan"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              )}
              onClick={() => {
                setActiveProject(project.id);
                setOpen(false);
              }}
            >
              <span>{project.icon}</span>
              <div className="flex-1 text-left min-w-0">
                <span className="font-medium block">{project.name}</span>
                <span className="text-[10px] text-text-muted block truncate">
                  {project.workspacePath}
                </span>
              </div>
              {project.id === activeProjectId ? (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteProject(project.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-opacity cursor-pointer text-xs shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          <div className="h-px bg-white/8 my-1" />

          {/* New project form */}
          {creating ? (
            <div className="p-2 space-y-2">
              <div className="flex gap-2">
                <div className="flex gap-1 flex-wrap">
                  {PROJECT_ICONS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setNewIcon(icon)}
                      className={cn(
                        "w-7 h-7 flex items-center justify-center rounded-md text-sm cursor-pointer transition-colors",
                        newIcon === icon
                          ? "bg-accent-cyan/20 ring-1 ring-accent-cyan/40"
                          : "hover:bg-white/5"
                      )}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Project name"
                className="w-full h-8 px-3 rounded-lg text-xs bg-white/5 border border-white/8 text-text-primary outline-none placeholder:text-text-muted"
                autoFocus
              />
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/absolute/path/to/project"
                className="w-full h-8 px-3 rounded-lg text-xs font-mono bg-white/5 border border-white/8 text-text-primary outline-none placeholder:text-text-muted"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                    setNewPath("");
                  }}
                  className="flex-1 h-7 text-xs rounded-md text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newPath.trim()}
                  className="flex-1 h-7 text-xs rounded-md bg-accent-cyan/20 text-accent-cyan hover:bg-accent-cyan/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-muted hover:text-text-secondary hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span>+</span>
              <span>New Project</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
