import { useOrg } from '../rbac/useOrg'
import { guarded } from '../ui/navGuard'

export function OrgSwitcher() {
  const { orgs, orgId, setOrgId } = useOrg()
  return (
    <div className="rnr-select">
      <select aria-label="Organisation" className="rnr-input" value={orgId ?? ''}
        onChange={(e) => (e.target.value === '__new' ? (location.hash = '#/new-org') : guarded(() => setOrgId(e.target.value)))}>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        <option value="__new">Create organisation…</option>
      </select>
    </div>
  )
}
