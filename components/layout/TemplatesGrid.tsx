"use client";

import { useSessionsStore, BUILT_IN_TEMPLATES } from "@/lib/store/sessions";
import type { SessionTemplate } from "@/lib/store/sessions";
import { cn } from "@/lib/utils";

function TemplateCard({ template }: { template: SessionTemplate }) {
  const createSessionFromTemplate = useSessionsStore(
    (s) => s.createSessionFromTemplate
  );

  return (
    <button
      onClick={() => createSessionFromTemplate(template.id)}
      className={cn(
        "glass-card glass-card-hover text-left p-4 flex flex-col gap-1.5 cursor-pointer",
        "transition-all duration-200 hover:scale-[1.02]"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{template.icon}</span>
        <span className="text-sm font-medium text-text-primary">
          {template.name}
        </span>
      </div>
      <p className="text-xs text-text-muted leading-relaxed">
        {template.description}
      </p>
    </button>
  );
}

export function TemplatesGrid() {
  const userTemplates = useSessionsStore((s) => s.templates);
  const allTemplates = [...BUILT_IN_TEMPLATES, ...userTemplates];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-6 max-w-lg mx-auto">
      {allTemplates.map((t) => (
        <TemplateCard key={t.id} template={t} />
      ))}
    </div>
  );
}
