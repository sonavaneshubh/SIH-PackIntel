// Server-side inspector authorization.
//
// This is the single place that answers "is this Inspector ID allowed in?".
//
// CURRENT IMPLEMENTATION
//   PackIntel's own Supabase `profiles` table is the source of truth. The SIH
//   demo ships one pre-authorized record with access_type='demo'. There is no
//   government lookup, and this code makes no such claim.
//
// FUTURE INTEGRATION SEAM
//   When an official government inspector registry/API becomes available,
//   replace the body of `resolveAuthorizedInspector` with a call to it and map
//   the response into `AuthorizedInspector`. Nothing else in the auth flow
//   (OTP issue/verify, session minting, middleware, backend authorization)
//   needs to change, because they all consume this normalized shape.
//
// This module must only run on the server (it is given the service-role
// Supabase client).

import type { SupabaseClient } from '@supabase/supabase-js';
import { looksLikeEmail, normalizeInspectorId } from './identity';

export type InspectorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type InspectorAccessType = 'official' | 'demo';
export type InspectorRole = 'inspector' | 'admin';

export interface AuthorizedInspector {
  profileId: string;
  inspectorId: string | null;
  email: string;
  name: string | null;
  role: InspectorRole;
  status: InspectorStatus;
  accessType: InspectorAccessType;
}

// 'not_recognized' → unknown ID / not an inspector account
// 'inactive'       → known account that is pending, rejected or suspended
// 'unavailable'    → the authorization source could not be reached
export type InspectorLookupFailure = 'not_recognized' | 'inactive' | 'unavailable';

export interface InspectorLookupResult {
  inspector?: AuthorizedInspector;
  failure?: InspectorLookupFailure;
}

export async function resolveAuthorizedInspector(
  admin: SupabaseClient,
  rawIdentifier: string
): Promise<InspectorLookupResult> {
  const raw = (rawIdentifier || '').trim();
  if (!raw) return { failure: 'not_recognized' };

  const asEmail = looksLikeEmail(raw);
  const inspectorId = asEmail ? null : normalizeInspectorId(raw);
  const emailValue = raw.toLowerCase();

  const selection =
    'id, email, full_name, role, verification_status, inspector_employee_id, access_type';

  let data: Record<string, unknown> | null = null;
  let error: unknown = null;
  try {
    const result = asEmail
      ? await admin.from('profiles').select(selection).eq('email', emailValue).maybeSingle()
      : await admin
          .from('profiles')
          .select(selection)
          .eq('inspector_employee_id', inspectorId)
          .maybeSingle();
    data = result.data as Record<string, unknown> | null;
    error = result.error;
  } catch {
    return { failure: 'unavailable' };
  }

  if (error) return { failure: 'unavailable' };
  if (!data) return { failure: 'not_recognized' };

  const role: InspectorRole | null =
    data.role === 'admin' ? 'admin' : data.role === 'inspector' || data.role == null ? 'inspector' : null;
  if (!role) return { failure: 'not_recognized' };

  const status = (String(data.verification_status || 'pending') as InspectorStatus) || 'pending';
  if (status !== 'approved') return { failure: 'inactive' };

  return {
    inspector: {
      profileId: String(data.id),
      inspectorId: (data.inspector_employee_id as string | null) ?? inspectorId,
      email: String(data.email || ''),
      name: (data.full_name as string | null) ?? null,
      role,
      status,
      accessType: data.access_type === 'demo' ? 'demo' : 'official',
    },
  };
}
