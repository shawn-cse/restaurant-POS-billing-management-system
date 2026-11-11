"use client";

import type {
  BulkTableCreateDto,
  TableDto,
  TableLayoutUpdateDto,
  TableStatusDto,
  TableUpdateDto,
} from "@nodedr-restaurant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface RestaurantTable {
  id: string;
  floorId: string;
  number: string;
  name: string | null;
  capacity: number;
  status: TableStatusDto;
  statusSince: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  shape: "square" | "round" | "rect";
  isActive?: boolean;
  qrToken: string | null;
  assignedWaiter: { id: string; name: string } | null;
  orders?: {
    id: string;
    orderNumber: string;
    type: string;
    status: string;
    guestCount: number | null;
    guestName: string | null;
    totalAmount: string;
    createdAt: string;
    createdBy?: { id: string; name: string };
  }[];
}

export interface Floor {
  id: string;
  name: string;
  sortOrder: number;
  tables: RestaurantTable[];
}

export function useFloors(branchId: string | null) {
  return useQuery({
    queryKey: ["floors", branchId],
    queryFn: () => api.get<Floor[]>(`/tables/floors?branchId=${branchId}`),
    enabled: !!branchId,
    refetchInterval: 10_000,
  });
}

export function useCreateFloor(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post(`/tables/floors?branchId=${branchId}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useUpdateFloor(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/tables/floors/${id}?branchId=${branchId}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useCreateTable(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: TableDto) => api.post(`/tables?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useBulkCreateTables(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: BulkTableCreateDto) => api.post(`/tables/bulk?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useUpdateTable(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: TableUpdateDto }) =>
      api.patch(`/tables/${id}?branchId=${branchId}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useUpdateTableLayout(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: TableLayoutUpdateDto[]) =>
      api.patch(`/tables/layout?branchId=${branchId}`, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useDeleteTable(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tables/${id}?branchId=${branchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useUpdateTableStatus(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      assignedWaiterId,
      override,
      reason,
    }: {
      id: string;
      status: TableStatusDto;
      assignedWaiterId?: string;
      override?: boolean;
      reason?: string;
    }) =>
      api.patch(`/tables/${id}/status?branchId=${branchId}`, {
        status,
        assignedWaiterId,
        override,
        reason,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useReleaseTable(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      force,
      reason,
    }: {
      id: string;
      force?: boolean;
      reason?: string;
    }) =>
      api.post(`/tables/${id}/release?branchId=${branchId}`, { force, reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}

export function useRotateQrToken(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<RestaurantTable>(`/tables/${id}/qr-token?branchId=${branchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["floors", branchId] }),
  });
}
