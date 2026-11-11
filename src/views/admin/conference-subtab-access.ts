import {
  canDelegateAnnualConferenceCapability,
  type AnnualConferenceCapability,
} from '@/lib/annual-conference-capabilities';
import type { AdminRole } from '@/types/supabase';

export function subtabAccessState(
  capabilities: readonly AnnualConferenceCapability[],
  effective: readonly AnnualConferenceCapability[],
  inherited: readonly AnnualConferenceCapability[],
) {
  const enabled = capabilities.filter((capability) => effective.includes(capability));
  const checked = enabled.length > 0;
  const limited = checked && enabled.length < capabilities.length;
  const includesRoleDefaults = enabled.some((capability) => inherited.includes(capability));
  const includesEditionAccess = enabled.some((capability) => !inherited.includes(capability));

  return {
    checked,
    limited,
    label: limited ? 'Limited access' : checked ? 'On' : 'Off',
    provenance: includesRoleDefaults && includesEditionAccess ? 'Includes role defaults and edition access'
      : includesRoleDefaults ? 'Includes role defaults'
      : includesEditionAccess ? 'Edition access' : '',
  };
}

export function subtabAccessChanges(
  capabilities: readonly AnnualConferenceCapability[],
  role: AdminRole,
  enabled: boolean,
) {
  return [...new Set(capabilities)]
    .filter((capability) => canDelegateAnnualConferenceCapability(capability, role))
    .map((capability) => ({ capability, enabled }));
}
