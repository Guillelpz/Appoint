import { describe, it, expect } from 'vitest';
import { createInitialWizardState, wizardReducer } from './wizard-state';

describe('createInitialWizardState', () => {
  it('empieza en el paso EMPLOYEE con el servicio indicado', () => {
    const state = createInitialWizardState('servicio-1');
    expect(state.step).toBe('EMPLOYEE');
    expect(state.serviceId).toBe('servicio-1');
    expect(state.employeeId).toBeNull();
    expect(state.slotStart).toBeNull();
  });
});

describe('wizardReducer', () => {
  it('SELECT_EMPLOYEE avanza a DATETIME y guarda el empleado', () => {
    const state = createInitialWizardState('servicio-1');
    const next = wizardReducer(state, { type: 'SELECT_EMPLOYEE', employeeId: 'empleado-1' });
    expect(next.step).toBe('DATETIME');
    expect(next.employeeId).toBe('empleado-1');
  });

  it('SELECT_EMPLOYEE con null guarda "cualquiera"', () => {
    const state = createInitialWizardState('servicio-1');
    const next = wizardReducer(state, { type: 'SELECT_EMPLOYEE', employeeId: null });
    expect(next.employeeId).toBeNull();
    expect(next.step).toBe('DATETIME');
  });

  it('SELECT_SLOT avanza a CUSTOMER_DATA y guarda la hora', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'DATETIME' as const, employeeId: 'empleado-1' };
    const start = new Date('2026-07-14T08:00:00.000Z');
    const next = wizardReducer(state, { type: 'SELECT_SLOT', start });
    expect(next.step).toBe('CUSTOMER_DATA');
    expect(next.slotStart).toEqual(start);
  });

  it('BACK desde DATETIME vuelve a EMPLOYEE y limpia el hueco', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'DATETIME' as const, employeeId: 'empleado-1' };
    const next = wizardReducer(state, { type: 'BACK' });
    expect(next.step).toBe('EMPLOYEE');
    expect(next.slotStart).toBeNull();
  });

  it('BACK desde CUSTOMER_DATA vuelve a DATETIME', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'CUSTOMER_DATA' as const };
    const next = wizardReducer(state, { type: 'BACK' });
    expect(next.step).toBe('DATETIME');
  });

  it('BACK desde ERROR vuelve a DATETIME y limpia el error', () => {
    const state = {
      ...createInitialWizardState('servicio-1'),
      step: 'ERROR' as const,
      errorMessage: 'algo falló',
      alternativeSlots: [new Date()],
    };
    const next = wizardReducer(state, { type: 'BACK' });
    expect(next.step).toBe('DATETIME');
    expect(next.errorMessage).toBeNull();
    expect(next.alternativeSlots).toEqual([]);
  });

  it('SUBMIT_CUSTOMER_DATA guarda los datos y pasa a SUBMITTING', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'CUSTOMER_DATA' as const };
    const next = wizardReducer(state, {
      type: 'SUBMIT_CUSTOMER_DATA',
      name: 'Ana',
      phone: '+34600000000',
      email: 'ana@example.com',
    });
    expect(next.step).toBe('SUBMITTING');
    expect(next.customerName).toBe('Ana');
    expect(next.customerPhone).toBe('+34600000000');
    expect(next.customerEmail).toBe('ana@example.com');
  });

  it('SUBMISSION_SUCCEEDED pasa a SUCCESS con el flag de aprobación pendiente', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'SUBMITTING' as const };
    const next = wizardReducer(state, { type: 'SUBMISSION_SUCCEEDED', pendingApproval: true });
    expect(next.step).toBe('SUCCESS');
    expect(next.pendingApproval).toBe(true);
  });

  it('SUBMISSION_FAILED pasa a ERROR con mensaje y alternativas', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'SUBMITTING' as const };
    const altStart = new Date('2026-07-14T09:00:00.000Z');
    const next = wizardReducer(state, {
      type: 'SUBMISSION_FAILED',
      message: 'Ese hueco ya no está libre',
      alternativeSlots: [altStart],
    });
    expect(next.step).toBe('ERROR');
    expect(next.errorMessage).toBe('Ese hueco ya no está libre');
    expect(next.alternativeSlots).toEqual([altStart]);
  });

  it('RESET vuelve al estado inicial con un nuevo servicio', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'SUCCESS' as const, pendingApproval: true };
    const next = wizardReducer(state, { type: 'RESET', serviceId: 'servicio-2' });
    expect(next).toEqual(createInitialWizardState('servicio-2'));
  });
});
