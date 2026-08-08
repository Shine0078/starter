export const CONSENT_STORE = 'CONSENT_STORE';

export type ConsentKind = 'analytics' | 'product_updates' | 'terms' | 'privacy_notice';
export type ConsentSource =
  | 'registration'
  | 'user_settings'
  | 'admin_migration';

export interface ConsentEvent {
  id: string;
  userId: string;
  kind: ConsentKind;
  granted: boolean;
  policyVersion: string;
  source: ConsentSource;
  createdAt: Date;
}

export interface ConsentStore {
  list(userId: string): Promise<ConsentEvent[]>;
  record(userId: string, event: ConsentEvent): Promise<ConsentEvent>;
}
