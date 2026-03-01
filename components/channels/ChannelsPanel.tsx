"use client";

import { useState, useEffect, useCallback } from "react";
import { ChannelCard } from "./ChannelCard";

interface FieldStatus {
  set: boolean;
  source: "env" | "stored" | "none";
  masked: string;
}

interface ChannelDef {
  name: string;
  label: string;
  group: "chatsdk" | "custom";
  fieldLabels: Record<string, string>;
  icon: React.ReactNode;
}

interface ChannelData {
  enabled: boolean;
  webhookUrl: string;
  activeSessions: number;
  fields: Record<string, FieldStatus>;
}

interface ChannelsResponse {
  channels: {
    telegram: ChannelData;
    slack: ChannelData;
    whatsapp: ChannelData;
  };
}

/* ------------------------------------------------------------------ */
/*  Chat SDK Platforms — handled by the unified Chat SDK bot instance  */
/* ------------------------------------------------------------------ */

const CHAT_SDK_CHANNELS: ChannelDef[] = [
  {
    name: "slack",
    label: "Slack",
    group: "chatsdk" as const,
    fieldLabels: {
      token: "Bot Token",
      secret: "Signing Secret",
    },
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.163 0a2.528 2.528 0 012.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.163 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 01-2.52-2.523 2.527 2.527 0 012.52-2.52h6.315A2.528 2.528 0 0124 15.163a2.528 2.528 0 01-2.522 2.523h-6.315z" />
      </svg>
    ),
  },
  {
    name: "discord",
    label: "Discord",
    group: "chatsdk" as const,
    fieldLabels: {
      token: "Bot Token",
      secret: "Public Key",
    },
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  },
  {
    name: "gchat",
    label: "Google Chat",
    group: "chatsdk" as const,
    fieldLabels: {
      token: "Service Account Key",
      secret: "Project ID",
    },
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm5.82 16.32H6.18a.36.36 0 01-.36-.36V8.04a.36.36 0 01.36-.36h11.64a.36.36 0 01.36.36v7.92a.36.36 0 01-.36.36z" />
      </svg>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Custom Integrations — separate webhook handlers                    */
/* ------------------------------------------------------------------ */

const CUSTOM_CHANNELS: ChannelDef[] = [
  {
    name: "telegram",
    label: "Telegram",
    group: "custom" as const,
    fieldLabels: {
      token: "Bot Token",
      secret: "Webhook Secret",
    },
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
      </svg>
    ),
  },
  {
    name: "whatsapp",
    label: "WhatsApp",
    group: "custom" as const,
    fieldLabels: {
      token: "Access Token",
      secret: "Verify Token",
      phoneNumberId: "Phone Number ID",
    },
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
];

export function ChannelsPanel() {
  const [data, setData] = useState<ChannelsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch channels:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleSave = async (channel: string, config: Record<string, string>) => {
    await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, config }),
    });
    await fetchChannels();
  };

  const handleClear = async (channel: string) => {
    await fetch("/api/channels", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    });
    await fetchChannels();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center text-text-muted text-xs">
        Failed to load channels.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
      {/* Chat SDK Platforms */}
      <p className="text-[10px] uppercase tracking-wider text-text-muted px-1 mb-1">
        Chat SDK Platforms
      </p>
      {CHAT_SDK_CHANNELS.map((def) => {
        const ch = data.channels[def.name as keyof typeof data.channels];
        if (!ch) return null;
        return (
          <ChannelCard
            key={def.name}
            name={def.name}
            label={def.label}
            icon={def.icon}
            enabled={ch.enabled}
            webhookUrl={ch.webhookUrl}
            activeSessions={ch.activeSessions}
            fields={ch.fields}
            fieldLabels={def.fieldLabels}
            onSave={(config) => handleSave(def.name, config)}
            onClear={() => handleClear(def.name)}
          />
        );
      })}

      {/* Custom Integrations */}
      <p className="text-[10px] uppercase tracking-wider text-text-muted px-1 mb-1 mt-3">
        Custom Integrations
      </p>
      {CUSTOM_CHANNELS.map((def) => {
        const ch = data.channels[def.name as keyof typeof data.channels];
        if (!ch) return null;
        return (
          <ChannelCard
            key={def.name}
            name={def.name}
            label={def.label}
            icon={def.icon}
            enabled={ch.enabled}
            webhookUrl={ch.webhookUrl}
            activeSessions={ch.activeSessions}
            fields={ch.fields}
            fieldLabels={def.fieldLabels}
            onSave={(config) => handleSave(def.name, config)}
            onClear={() => handleClear(def.name)}
          />
        );
      })}
    </div>
  );
}
