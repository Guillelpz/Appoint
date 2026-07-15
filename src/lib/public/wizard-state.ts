export type WizardStep = 'EMPLOYEE' | 'DATETIME' | 'CUSTOMER_DATA' | 'SUBMITTING' | 'SUCCESS' | 'ERROR';

export interface WizardState {
  step: WizardStep;
  serviceId: string;
  employeeId: string | null;
  slotStart: Date | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  errorMessage: string | null;
  alternativeSlots: Date[];
  pendingApproval: boolean;
}

export type WizardAction =
  | { type: 'SELECT_EMPLOYEE'; employeeId: string | null }
  | { type: 'SELECT_SLOT'; start: Date }
  | { type: 'BACK' }
  | { type: 'SUBMIT_CUSTOMER_DATA'; name: string; phone: string; email: string }
  | { type: 'SUBMISSION_SUCCEEDED'; pendingApproval: boolean }
  | { type: 'SUBMISSION_FAILED'; message: string; alternativeSlots?: Date[] }
  | { type: 'RESET'; serviceId: string };

export function createInitialWizardState(serviceId: string): WizardState {
  return {
    step: 'EMPLOYEE',
    serviceId,
    employeeId: null,
    slotStart: null,
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    errorMessage: null,
    alternativeSlots: [],
    pendingApproval: false,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SELECT_EMPLOYEE':
      return { ...state, employeeId: action.employeeId, step: 'DATETIME' };
    case 'SELECT_SLOT':
      return { ...state, slotStart: action.start, step: 'CUSTOMER_DATA' };
    case 'BACK':
      if (state.step === 'DATETIME') {
        return { ...state, step: 'EMPLOYEE', slotStart: null };
      }
      if (state.step === 'CUSTOMER_DATA') {
        return { ...state, step: 'DATETIME' };
      }
      if (state.step === 'ERROR') {
        return { ...state, step: 'DATETIME', errorMessage: null, alternativeSlots: [] };
      }
      return state;
    case 'SUBMIT_CUSTOMER_DATA':
      return {
        ...state,
        customerName: action.name,
        customerPhone: action.phone,
        customerEmail: action.email,
        step: 'SUBMITTING',
      };
    case 'SUBMISSION_SUCCEEDED':
      return { ...state, step: 'SUCCESS', pendingApproval: action.pendingApproval };
    case 'SUBMISSION_FAILED':
      return { ...state, step: 'ERROR', errorMessage: action.message, alternativeSlots: action.alternativeSlots ?? [] };
    case 'RESET':
      return createInitialWizardState(action.serviceId);
    default:
      return state;
  }
}
