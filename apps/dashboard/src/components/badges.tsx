import type { NodeStatus, PrivacyClass, RiskLevel } from '@facto/contracts';

export const StatusBadge = ({ status }: { status: NodeStatus }) => <span className={`badge status-${status}`}>{status}</span>;
export const RiskBadge = ({ risk }: { risk: RiskLevel }) => <span className={`badge risk-${risk}`}>{risk}</span>;
export const OutcomeBadge = ({ outcome }: { outcome: string }) => <span className={`badge outcome-${outcome}`}>{outcome}</span>;

export const PrivacyBadge = ({ privacy }: { privacy: PrivacyClass }) => <span className={`badge privacy-${privacy}`}>{privacy}</span>;

export function ApiError({ message }: { message: string }) {
  return (
    <div role="alert" className="card error-card">
      <strong>Can’t load data</strong>
      <p>{message}</p>
    </div>
  );
}
