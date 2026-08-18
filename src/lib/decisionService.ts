export type DecisionOptionKind = 'primary' | 'secondary' | 'danger';

export interface DecisionOption {
  id: string;
  label: string;
  kind?: DecisionOptionKind;
  requiresValue?: boolean;
}

export interface DecisionDescriptor {
  title: string;
  message: string;
  input?: {
    label?: string;
    defaultValue?: string;
    placeholder?: string;
  };
  options: DecisionOption[];
  dismissible?: boolean;
}

export interface ActiveDecision extends DecisionDescriptor {
  requestId: number;
}

export interface DecisionResult {
  choice: string;
  value?: string;
}

type Listener = () => void;

let active: ActiveDecision | null = null;
let resolver: ((result: DecisionResult | null) => void) | null = null;
let nextRequestId = 1;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach(listener => listener());
}

export function subscribeDecision(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveDecision(): ActiveDecision | null {
  return active;
}

export function requestDecision(descriptor: DecisionDescriptor): Promise<DecisionResult | null> {
  if (active) return Promise.reject(new Error('Another decision is already active'));
  active = { ...descriptor, requestId: nextRequestId++ };
  emit();
  return new Promise(resolve => { resolver = resolve; });
}

export function resolveDecision(choice: string, value?: string): void {
  if (!active || !resolver || !active.options.some(option => option.id === choice)) return;
  const resolve = resolver;
  const normalizedValue = value?.trim();
  active = null;
  resolver = null;
  emit();
  resolve({ choice, value: normalizedValue || undefined });
}

export function cancelDecision(): void {
  if (!active || !resolver) return;
  const resolve = resolver;
  active = null;
  resolver = null;
  emit();
  resolve(null);
}
