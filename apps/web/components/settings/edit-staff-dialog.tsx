"use client";

import { useState } from "react";
import { Edit2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useBranch } from "@/hooks/use-branch";
import { useDepartments, useStaffRoles, useUpdateStaff, type StaffMember } from "@/hooks/use-staff";
import { ApiError } from "@/lib/api";

interface EditStaffDialogProps {
  member: StaffMember;
  disabled?: boolean;
}

export function EditStaffDialog({ member, disabled = false }: EditStaffDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(member.roleId);
  const [departmentId, setDepartmentId] = useState(member.departmentId ?? "");
  const [isActive, setIsActive] = useState(member.isActive);
  const { branches } = useBranch();
  const [branchIds, setBranchIds] = useState<string[]>(
    member.branches.map((b) => b.branch.id)
  );

  const { data: roles } = useStaffRoles();
  const { data: departments } = useDepartments();
  const updateStaff = useUpdateStaff();

  const toggleBranch = (id: string) => {
    setBranchIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  };

  const onOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setName(member.name);
      setEmail(member.email ?? "");
      setPhone(member.phone ?? "");
      setPassword("");
      setRoleId(member.roleId);
      setDepartmentId(member.departmentId ?? "");
      setIsActive(member.isActive);
      setBranchIds(member.branches.map((b) => b.branch.id));
    }
    setOpen(nextOpen);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleId) {
      toast.error("Choose a role");
      return;
    }
    if (branchIds.length === 0) {
      toast.error("Select at least one branch");
      return;
    }
    if (password && password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    updateStaff.mutate(
      {
        id: member.id,
        dto: {
          name,
          email: email || undefined,
          phone: phone || undefined,
          roleId,
          departmentId: departmentId || null,
          branchIds,
          isActive,
          password: password || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(`${name} updated successfully`);
          setOpen(false);
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Could not update staff account"),
      }
    );
  };

  if (disabled) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Edit staff details"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit Staff Account</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="e-name">Staff Name</Label>
            <Input
              id="e-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="e-email">Username / Email</Label>
              <Input
                id="e-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="e-phone">Contact Number</Label>
              <Input
                id="e-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="e-password">Reset Password (leave empty to keep current)</Label>
            <PasswordInput
              id="e-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              placeholder="Optional: min. 8 characters"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Role</Label>
            <Select value={roleId} onValueChange={(v) => setRoleId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roles?.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {departments && departments.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Department (optional)</Label>
              <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="No department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No department</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>Branches</Label>
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={branchIds.includes(b.id)}
                    onCheckedChange={() => toggleBranch(b.id)}
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex flex-col gap-0.5">
              <Label className="text-sm font-medium">Account Status</Label>
              <span className="text-xs text-muted-foreground">
                Disabled staff cannot sign in or perform actions
              </span>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              aria-label="Staff account active status"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateStaff.isPending}>
              {updateStaff.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
