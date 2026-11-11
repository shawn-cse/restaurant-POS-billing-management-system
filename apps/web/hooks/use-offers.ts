"use client";

import type {
  EvaluateOfferDto,
  OfferDto,
  OfferEvaluationResult,
  OfferTypeDto,
  OfferUpdateDto,
} from "@nodedr-restaurant/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Offer {
  id: string;
  branchId: string;
  name: string;
  description: string | null;
  type: OfferTypeDto;
  value: number | string;
  minOrderAmount: number | string;
  maxDiscount: number | string | null;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useOffers(
  branchId: string | null,
  options?: { activeOnly?: boolean; search?: string },
) {
  const params = new URLSearchParams();
  if (branchId) params.set("branchId", branchId);
  if (options?.activeOnly) params.set("activeOnly", "true");
  if (options?.search) params.set("search", options.search);

  return useQuery({
    queryKey: ["offers", branchId, options?.activeOnly, options?.search],
    queryFn: () => api.get<Offer[]>(`/offers?${params.toString()}`),
    enabled: !!branchId,
  });
}

export function useAvailableOffers(branchId: string | null, subtotal: number) {
  return useQuery({
    queryKey: ["offers", "available", branchId, subtotal],
    queryFn: () =>
      api.get<OfferEvaluationResult[]>(
        `/offers/available?branchId=${branchId}&subtotal=${encodeURIComponent(subtotal)}`,
      ),
    enabled: !!branchId && subtotal > 0,
  });
}

export function useCreateOffer(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: OfferDto) => api.post<Offer>(`/offers?branchId=${branchId}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["offers", branchId] });
    },
  });
}

export function useUpdateOffer(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: OfferUpdateDto }) =>
      api.patch<Offer>(`/offers/${id}?branchId=${branchId}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["offers", branchId] });
    },
  });
}

export function useToggleOfferActive(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<Offer>(`/offers/${id}/active?branchId=${branchId}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["offers", branchId] });
    },
  });
}

export function useDeleteOffer(branchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean; deactivated?: boolean }>(`/offers/${id}?branchId=${branchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["offers", branchId] });
    },
  });
}

export function useEvaluateOffer(branchId: string | null) {
  return useMutation({
    mutationFn: (dto: EvaluateOfferDto) =>
      api.post<OfferEvaluationResult>(`/offers/calculate?branchId=${branchId}`, dto),
  });
}
