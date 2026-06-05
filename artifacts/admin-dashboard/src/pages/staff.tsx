import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { UsersRound, Plus, Pencil, Trash2, Shield, Check, Key } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiFetch(path: string, token: string | null, options?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  }).then(async (r) => {
    const json = await r.json();
    if (!r.ok) throw new Error(json.error ?? "Request failed");
    return json;
  });
}

const ALL_PERMISSIONS = [
  { key: "view_dashboard", labelKey: "staff.permViewDashboard", labelDefault: "View Dashboard", group: "Dashboard" },
  { key: "view_routes", labelKey: "staff.permViewRoutes", labelDefault: "View Routes", group: "Operations" },
  { key: "edit_routes", labelKey: "staff.permEditRoutes", labelDefault: "Edit Routes", group: "Operations" },
  { key: "view_trips", labelKey: "staff.permViewTrips", labelDefault: "View Trips", group: "Operations" },
  { key: "edit_trips", labelKey: "staff.permEditTrips", labelDefault: "Edit Trips", group: "Operations" },
  { key: "view_drivers", labelKey: "staff.permViewDrivers", labelDefault: "View Drivers", group: "Operations" },
  { key: "edit_drivers", labelKey: "staff.permEditDrivers", labelDefault: "Edit Drivers", group: "Operations" },
  { key: "view_buses", labelKey: "staff.permViewBuses", labelDefault: "View Buses", group: "Operations" },
  { key: "edit_buses", labelKey: "staff.permEditBuses", labelDefault: "Edit Buses", group: "Operations" },
  { key: "view_live_tracking", labelKey: "staff.permLiveTracking", labelDefault: "Live Tracking", group: "Operations" },
  { key: "view_driver_analytics", labelKey: "staff.permDriverAnalytics", labelDefault: "Driver Analytics", group: "Operations" },
  { key: "view_passengers", labelKey: "staff.permViewPassengers", labelDefault: "View Passengers", group: "Customers" },
  { key: "edit_passengers", labelKey: "staff.permEditPassengers", labelDefault: "Edit Passengers", group: "Customers" },
  { key: "view_bookings", labelKey: "staff.permViewBookings", labelDefault: "View Bookings", group: "Customers" },
  { key: "edit_bookings", labelKey: "staff.permEditBookings", labelDefault: "Edit Bookings", group: "Customers" },
  { key: "view_wallet", labelKey: "staff.permViewWallets", labelDefault: "View Wallets", group: "Customers" },
  { key: "edit_wallet", labelKey: "staff.permEditWallets", labelDefault: "Edit Wallets", group: "Customers" },
  { key: "view_promo", labelKey: "staff.permViewPromo", labelDefault: "View Promo Codes", group: "Customers" },
  { key: "edit_promo", labelKey: "staff.permEditPromo", labelDefault: "Edit Promo Codes", group: "Customers" },
  { key: "view_support", labelKey: "staff.permViewSupport", labelDefault: "View Support", group: "Support" },
  { key: "edit_support", labelKey: "staff.permManageSupport", labelDefault: "Manage Support", group: "Support" },
  { key: "view_suggestions", labelKey: "staff.permViewSuggestions", labelDefault: "View Suggestions", group: "Support" },
  { key: "view_verification", labelKey: "staff.permViewVerification", labelDefault: "View Verification", group: "Support" },
  { key: "edit_verification", labelKey: "staff.permManageVerification", labelDefault: "Manage Verification", group: "Support" },
  { key: "view_analytics", labelKey: "staff.permViewAnalytics", labelDefault: "View Analytics", group: "System" },
  { key: "view_staff", labelKey: "staff.permViewStaff", labelDefault: "View Staff", group: "System" },
  { key: "edit_staff", labelKey: "staff.permManageStaff", labelDefault: "Manage Staff", group: "System" },
  { key: "view_notifications", labelKey: "staff.permViewNotifications", labelDefault: "View Notifications", group: "System" },
  { key: "view_settings", labelKey: "staff.permViewSettings", labelDefault: "View Settings", group: "System" },
  { key: "edit_settings", labelKey: "staff.permEditSettings", labelDefault: "Edit Settings", group: "System" },
];

const PERMISSION_GROUPS = Array.from(new Set(ALL_PERMISSIONS.map((p) => p.group)));

export default function Staff() {
  const { token, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { t } = useTranslation();

  const [staffModal, setStaffModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [roleModal, setRoleModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [deleteRoleId, setDeleteRoleId] = useState<number | null>(null);
  const [deleteStaffId, setDeleteStaffId] = useState<number | null>(null);

  const { data: staffData, isLoading: staffLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: () => apiFetch("/api/admin/staff", token),
    enabled: !!token,
  });

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => apiFetch("/api/admin/roles", token),
    enabled: !!token,
  });

  const createStaffMut = useMutation({
    mutationFn: (body: any) => apiFetch("/api/admin/staff", token, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); setStaffModal({ open: false, editing: null }); toast({ title: t("staff.memberCreated", "Staff member created") }); },
    onError: (e: any) => toast({ title: t("common.error", "Error"), description: e.message, variant: "destructive" }),
  });

  const updateStaffMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiFetch(`/api/admin/staff/${id}`, token, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); setStaffModal({ open: false, editing: null }); toast({ title: t("staff.memberUpdated", "Staff member updated") }); },
    onError: (e: any) => toast({ title: t("common.error", "Error"), description: e.message, variant: "destructive" }),
  });

  const createRoleMut = useMutation({
    mutationFn: (body: any) => apiFetch("/api/admin/roles", token, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); setRoleModal({ open: false, editing: null }); toast({ title: t("staff.roleCreated", "Role created") }); },
    onError: (e: any) => toast({ title: t("common.error", "Error"), description: e.message, variant: "destructive" }),
  });

  const updateRoleMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiFetch(`/api/admin/roles/${id}`, token, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); setRoleModal({ open: false, editing: null }); toast({ title: t("staff.roleUpdated", "Role updated") }); },
    onError: (e: any) => toast({ title: t("common.error", "Error"), description: e.message, variant: "destructive" }),
  });

  const deleteRoleMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/roles/${id}`, token, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles", "staff"] }); setDeleteRoleId(null); toast({ title: t("staff.roleDeleted", "Role deleted") }); },
    onError: (e: any) => toast({ title: t("common.error", "Error"), description: e.message, variant: "destructive" }),
  });

  const toggleBlockMut = useMutation({
    mutationFn: ({ id, isBlocked }: { id: number; isBlocked: boolean }) =>
      apiFetch(`/api/admin/staff/${id}`, token, { method: "PATCH", body: JSON.stringify({ isBlocked }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); toast({ title: t("staff.statusUpdated", "Status updated") }); },
    onError: (e: any) => toast({ title: t("common.error", "Error"), description: e.message, variant: "destructive" }),
  });

  const deleteStaffMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/staff/${id}`, token, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); setDeleteStaffId(null); toast({ title: t("staff.memberDeleted", "Staff member deleted") }); },
    onError: (e: any) => toast({ title: t("common.error", "Error"), description: e.message, variant: "destructive" }),
  });

  if (!isSuperAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">{t("staff.accessRestricted", "Access Restricted")}</h2>
        <p className="text-muted-foreground text-sm mt-2">{t("staff.superAdminOnly", "Only super admins can manage staff and permissions.")}</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("staff.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("staff.subtitle")}</p>
      </div>

      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">
            <UsersRound className="h-4 w-4 mr-2" />{t("staff.staffUsers", "Staff Users")}
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Key className="h-4 w-4 mr-2" />{t("staff.rolesPermissions", "Roles & Permissions")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={() => setStaffModal({ open: true, editing: null })}>
              <Plus className="h-4 w-4 mr-2" /> {t("staff.addStaffMember", "Add Staff Member")}
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.email")}</TableHead>
                  <TableHead>{t("users.role")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("staff.joined", "Joined")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffLoading ? (
                  [...Array(4)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : staffData?.data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      {t("staff.noStaff", "No staff members yet.")}
                    </TableCell>
                  </TableRow>
                ) : (
                  staffData?.data?.map((member: any) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
                      <TableCell>
                        {member.staffRole ? (
                          <Badge variant="secondary">{member.staffRole.name}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-primary border-primary/40">{t("staff.superAdmin", "Super Admin")}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.isBlocked ? "destructive" : "outline"}>
                          {member.isBlocked ? t("staff.deactivated", "Deactivated") : t("common.active")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {member.createdAt ? format(new Date(member.createdAt), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setStaffModal({ open: true, editing: member })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <div className="flex items-center gap-1 ml-1" title={member.isBlocked ? t("staff.activate", "Activate") : t("staff.deactivate", "Deactivate")}>
                            <Switch
                              checked={!member.isBlocked}
                              onCheckedChange={(checked) => toggleBlockMut.mutate({ id: member.id, isBlocked: !checked })}
                              className="scale-75"
                            />
                          </div>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteStaffId(member.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={() => setRoleModal({ open: true, editing: null })}>
              <Plus className="h-4 w-4 mr-2" /> {t("staff.createRole", "Create Role")}
            </Button>
          </div>

          <div className="grid gap-4">
            {rolesLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                  <Skeleton className="h-6 w-32 mb-2" />
                  <Skeleton className="h-4 w-64" />
                </div>
              ))
            ) : rolesData?.data?.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                {t("staff.noRoles", "No roles created yet. Create a role to assign to staff members.")}
              </div>
            ) : (
              rolesData?.data?.map((role: any) => (
                <div key={role.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{role.name}</h3>
                        <Badge variant="outline">{role.permissions?.length ?? 0} {t("staff.permissions", "permissions")}</Badge>
                      </div>
                      {role.description && (
                        <p className="text-sm text-muted-foreground mt-1">{role.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {role.permissions?.slice(0, 8).map((p: string) => (
                          <Badge key={p} variant="secondary" className="text-xs">{p.replace(/_/g, " ")}</Badge>
                        ))}
                        {role.permissions?.length > 8 && (
                          <Badge variant="secondary" className="text-xs">+{role.permissions.length - 8} {t("common.more", "more")}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => setRoleModal({ open: true, editing: role })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteRoleId(role.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <StaffModal
        open={staffModal.open}
        editing={staffModal.editing}
        roles={rolesData?.data ?? []}
        onClose={() => setStaffModal({ open: false, editing: null })}
        onSubmit={(data) => {
          if (staffModal.editing) {
            updateStaffMut.mutate({ id: staffModal.editing.id, body: data });
          } else {
            createStaffMut.mutate(data);
          }
        }}
        isPending={createStaffMut.isPending || updateStaffMut.isPending}
      />

      <RoleModal
        open={roleModal.open}
        editing={roleModal.editing}
        onClose={() => setRoleModal({ open: false, editing: null })}
        onSubmit={(data) => {
          if (roleModal.editing) {
            updateRoleMut.mutate({ id: roleModal.editing.id, body: data });
          } else {
            createRoleMut.mutate(data);
          }
        }}
        isPending={createRoleMut.isPending || updateRoleMut.isPending}
      />

      <Dialog open={deleteStaffId !== null} onOpenChange={(o) => !o && setDeleteStaffId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("staff.deleteStaffMember", "Delete Staff Member")}</DialogTitle>
            <DialogDescription>
              {t("staff.deleteStaffDesc", "This will permanently remove this staff member's account. This action cannot be undone.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteStaffId(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteStaffId && deleteStaffMut.mutate(deleteStaffId)} disabled={deleteStaffMut.isPending}>
              {t("staff.deleteStaffMember", "Delete Staff Member")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteRoleId !== null} onOpenChange={(o) => !o && setDeleteRoleId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("staff.deleteRole", "Delete Role")}</DialogTitle>
            <DialogDescription>
              {t("staff.deleteRoleDesc", "This will remove the role and unassign it from all staff members. They will lose access restrictions.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRoleId(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteRoleId && deleteRoleMut.mutate(deleteRoleId)} disabled={deleteRoleMut.isPending}>
              {t("staff.deleteRole", "Delete Role")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StaffModal({
  open, editing, roles, onClose, onSubmit, isPending,
}: {
  open: boolean;
  editing: any | null;
  roles: any[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", staffRoleId: "",
  });

  React.useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? "",
        email: editing.email ?? "",
        phone: editing.phone ?? "",
        password: "",
        staffRoleId: editing.staffRoleId?.toString() ?? "none",
      });
    } else {
      setForm({ name: "", email: "", phone: "", password: "", staffRoleId: "none" });
    }
  }, [editing, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      staffRoleId: form.staffRoleId && form.staffRoleId !== "none" ? parseInt(form.staffRoleId) : null,
    };
    if (form.password) data.password = form.password;
    if (!editing) data.password = form.password;
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editing ? t("staff.editStaffMember", "Edit Staff Member") : t("staff.addStaffMember", "Add Staff Member")}</DialogTitle>
          <DialogDescription>
            {editing ? t("staff.editStaffDesc", "Update the staff member's details and role assignment.") : t("staff.addStaffDesc", "Create a new admin staff account with role-based access.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("staff.fullName", "Full Name")}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.phone")}</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.email")}</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="space-y-1.5">
            <Label>{editing ? t("staff.newPasswordOptional", "New Password (leave blank to keep current)") : t("auth.password")}</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required={!editing}
              minLength={8}
              placeholder={t("staff.minChars", "Min 8 characters")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("users.role")}</Label>
            <Select value={form.staffRoleId} onValueChange={(v) => setForm((f) => ({ ...f, staffRoleId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder={t("staff.selectRole", "Select a role...")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("staff.superAdminFull", "Super Admin (Full Access)")}</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("common.saving", "Saving...") : editing ? t("common.saveChanges") : t("staff.createStaffMember", "Create Staff Member")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleModal({
  open, editing, onClose, onSubmit, isPending,
}: {
  open: boolean;
  editing: any | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (editing) {
      setName(editing.name ?? "");
      setDescription(editing.description ?? "");
      setSelectedPerms(new Set(editing.permissions ?? []));
    } else {
      setName("");
      setDescription("");
      setSelectedPerms(new Set());
    }
  }, [editing, open]);

  const togglePerm = (key: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (group: string) => {
    const groupPerms = ALL_PERMISSIONS.filter((p) => p.group === group).map((p) => p.key);
    const allSelected = groupPerms.every((k) => selectedPerms.has(k));
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (allSelected) groupPerms.forEach((k) => next.delete(k));
      else groupPerms.forEach((k) => next.add(k));
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, description, permissions: Array.from(selectedPerms) });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t("staff.editRole", "Edit Role") : t("staff.createRole", "Create Role")}</DialogTitle>
          <DialogDescription>{t("staff.roleDesc", "Define the role name and select which sections this role can access.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("staff.roleName", "Role Name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder={t("staff.roleNamePlaceholder", "e.g. Operations Manager")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("staff.descriptionOptional", "Description (optional)")}</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("staff.briefDescription", "Brief description")} />
            </div>
          </div>

          <div className="space-y-3">
            <Label>{t("staff.permissions", "Permissions")}</Label>
            <div className="border border-border rounded-lg divide-y divide-border">
              {PERMISSION_GROUPS.map((group) => {
                const groupPerms = ALL_PERMISSIONS.filter((p) => p.group === group);
                const allSelected = groupPerms.every((p) => selectedPerms.has(p.key));
                const someSelected = groupPerms.some((p) => selectedPerms.has(p.key));
                return (
                  <div key={group} className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</span>
                      <button
                        type="button"
                        onClick={() => toggleGroup(group)}
                        className="text-xs text-primary hover:underline"
                      >
                        {allSelected ? t("staff.deselectAll", "Deselect all") : t("staff.selectAll", "Select all")}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {groupPerms.map((perm) => {
                        const active = selectedPerms.has(perm.key);
                        return (
                          <button
                            key={perm.key}
                            type="button"
                            onClick={() => togglePerm(perm.key)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                            }`}
                          >
                            {active && <Check className="h-3 w-3" />}
                            {t(perm.labelKey, perm.labelDefault)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{selectedPerms.size} {t("staff.of", "of")} {ALL_PERMISSIONS.length} {t("staff.permissionsSelected", "permissions selected")}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("common.saving", "Saving...") : editing ? t("staff.saveRole", "Save Role") : t("staff.createRole", "Create Role")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
