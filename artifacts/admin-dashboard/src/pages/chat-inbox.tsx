import React, { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminSocket } from "@/hooks/useAdminSocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Send, RefreshCw, User, Car, ShieldCheck, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  trip_id: number;
  trip_status: string;
  trip_origin: string;
  trip_destination: string;
  trip_departure_time: string | null;
  user_name: string | null;
  user_email: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  last_message: string;
  last_sender_type: "passenger" | "driver" | "admin" | "system";
  last_message_at: string;
  unread_count: number;
  total_messages: number;
}

interface Message {
  id: number;
  tripId: number;
  senderId: number | null;
  senderType: "passenger" | "driver" | "admin" | "system";
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface ChatStats {
  totalMessages: number;
  unreadMessages: number;
  tripConversations: number;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function SenderBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; className: string }> = {
    passenger: { label: "Passenger", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
    driver:    { label: "Driver",    className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    admin:     { label: "Admin",     className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
    system:    { label: "System",    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  };
  const { label, className } = map[type] ?? map.system!;
  return <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${className}`}>{label}</span>;
}

function SenderIcon({ type }: { type: string }) {
  if (type === "driver")    return <Car className="h-3.5 w-3.5 text-green-600" />;
  if (type === "admin")     return <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />;
  if (type === "passenger") return <User className="h-3.5 w-3.5 text-blue-600" />;
  return <MessageSquare className="h-3.5 w-3.5 text-slate-400" />;
}

// ─── Message thread ───────────────────────────────────────────────────────────

function MessageThread({
  tripId,
  onClose,
}: {
  tripId: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const threadQuery = useQuery({
    queryKey: ["chat-thread", tripId],
    queryFn: () => adminFetch<{ tripId: number; tripStatus: string; messages: Message[]; total: number }>(
      `/admin/chat/trip/${tripId}`
    ),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadQuery.data?.messages.length]);

  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      adminFetch<Message>(`/admin/chat/trip/${tripId}`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: ["chat-thread", tripId] });
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-stats"] });
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const messages = threadQuery.data?.messages ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Trip #{tripId}</span>
          {threadQuery.data?.tripStatus && (
            <Badge variant="outline" className="text-xs capitalize">
              {threadQuery.data.tripStatus}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["chat-thread", tripId] })}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            ✕
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-2">
        {threadQuery.isLoading ? (
          <div className="space-y-3 py-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {messages.map((msg) => {
              const isAdmin = msg.senderType === "admin";
              return (
                <div
                  key={msg.id}
                  className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                      isAdmin
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : msg.senderType === "passenger"
                        ? "bg-blue-50 dark:bg-blue-950 border rounded-bl-sm"
                        : msg.senderType === "driver"
                        ? "bg-green-50 dark:bg-green-950 border rounded-bl-sm"
                        : "bg-muted rounded-bl-sm"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <SenderIcon type={msg.senderType} />
                      <SenderBadge type={msg.senderType} />
                    </div>
                    <p className="text-sm leading-relaxed">{msg.message}</p>
                    <p className={`text-[10px] mt-1 ${isAdmin ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {format(new Date(msg.createdAt), "HH:mm, MMM d")}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply input */}
      <div className="border-t px-4 py-3">
        <div className="flex gap-2">
          <Input
            placeholder="Type a message as admin…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            disabled={sendMutation.isPending}
            className="flex-1 text-sm"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">Enter to send · Admin messages are visible to all parties</p>
      </div>
    </div>
  );
}

// ─── Conversation list ────────────────────────────────────────────────────────

function ConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading,
}: {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm font-medium">No conversations yet</p>
        <p className="text-xs mt-1">Trip messages will appear here</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {conversations.map((conv) => {
        const isSelected = conv.trip_id === selectedId;
        const hasUnread = conv.unread_count > 0;
        return (
          <button
            key={conv.trip_id}
            onClick={() => onSelect(conv.trip_id)}
            className={`w-full text-start px-4 py-3.5 transition-colors hover:bg-muted/50 ${
              isSelected ? "bg-primary/5 border-s-2 border-primary" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-sm">Trip #{conv.trip_id}</span>
                  <Badge variant="outline" className="text-[10px] capitalize px-1 py-0 h-4">
                    {conv.trip_status}
                  </Badge>
                  {hasUnread && (
                    <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary">
                      {conv.unread_count} new
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {conv.user_name ?? "Unknown passenger"}
                  {conv.driver_name ? ` · ${conv.driver_name}` : ""}
                </p>
                <p className="text-xs text-foreground/80 mt-1 truncate">
                  <span className="text-muted-foreground">
                    {conv.last_sender_type === "admin" ? "You" : conv.last_sender_type}:{" "}
                  </span>
                  {conv.last_message}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                </span>
                <span className="text-[10px] text-muted-foreground">{conv.total_messages} msg</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChatInbox() {
  const queryClient = useQueryClient();
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const { token } = useAuth();
  const { connected, socketRef } = useAdminSocket(token);

  // Stats
  const statsQuery = useQuery({
    queryKey: ["chat-stats"],
    queryFn: () => adminFetch<ChatStats>("/admin/chat/stats"),
    refetchInterval: 30_000,
  });

  // Conversations list
  const convsQuery = useQuery({
    queryKey: ["chat-conversations"],
    queryFn: () => adminFetch<{ data: Conversation[]; total: number; page: number; limit: number }>(
      "/admin/chat?limit=50"
    ),
    refetchInterval: 30_000,
  });

  // Socket: listen for new messages to refresh conversations + thread
  const handleNewMessage = useCallback((payload: { tripId?: number }) => {
    void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    void queryClient.invalidateQueries({ queryKey: ["chat-stats"] });
    if (payload.tripId && payload.tripId === selectedTripId) {
      void queryClient.invalidateQueries({ queryKey: ["chat-thread", payload.tripId] });
    }
  }, [queryClient, selectedTripId]);

  useEffect(() => {
    if (!connected) return;
    const socket = socketRef.current;
    if (!socket) return;

    socket.on("admin:new-chat-message", handleNewMessage);
    socket.on("trip:chat-message",       handleNewMessage);

    return () => {
      socket.off("admin:new-chat-message", handleNewMessage);
      socket.off("trip:chat-message",       handleNewMessage);
    };
  }, [connected, handleNewMessage, socketRef]);

  const stats     = statsQuery.data;
  const convs     = convsQuery.data?.data ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-5 border-b">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              Chat Inbox
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Trip conversations between passengers and drivers
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 mt-4">
          {statsQuery.isLoading ? (
            [...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-24" />)
          ) : (
            <>
              <div className="text-center">
                <p className="text-xl font-bold">{stats?.totalMessages ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total Messages</p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div className="text-center">
                <p className="text-xl font-bold text-primary">{stats?.unreadMessages ?? 0}</p>
                <p className="text-xs text-muted-foreground">Unread</p>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div className="text-center">
                <p className="text-xl font-bold">{stats?.tripConversations ?? 0}</p>
                <p className="text-xs text-muted-foreground">Conversations</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: conversation list */}
        <div className="w-80 border-e flex flex-col overflow-hidden shrink-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Conversations ({convs.length})
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
                void queryClient.invalidateQueries({ queryKey: ["chat-stats"] });
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <ConversationList
              conversations={convs}
              selectedId={selectedTripId}
              onSelect={(id) => setSelectedTripId(id)}
              isLoading={convsQuery.isLoading}
            />
          </ScrollArea>
        </div>

        {/* Right: thread or empty state */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedTripId ? (
            <MessageThread
              key={selectedTripId}
              tripId={selectedTripId}
              onClose={() => setSelectedTripId(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-base font-medium">Select a conversation</p>
              <p className="text-sm mt-1">Choose a trip from the left to view messages</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
