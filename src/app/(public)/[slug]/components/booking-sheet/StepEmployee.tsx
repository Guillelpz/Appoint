'use client';

export interface StepEmployeeOption {
  id: string;
  name: string;
  photoUrl: string | null;
  color: string;
}

export interface StepEmployeeProps {
  employees: StepEmployeeOption[];
  onSelect: (employeeId: string | null) => void;
}

export function StepEmployee({ employees, onSelect }: StepEmployeeProps) {
  return (
    <div>
      <p className="mb-3 text-sm text-[var(--color-text-muted)]">¿Con quién quieres tu cita?</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="rounded-[var(--radius-theme)] border border-[var(--color-accent)] p-4 text-left font-medium text-[var(--color-text)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-contrast)]"
        >
          Cualquier profesional
        </button>
        {employees.map((employee) => (
          <button
            key={employee.id}
            type="button"
            onClick={() => onSelect(employee.id)}
            className="rounded-[var(--radius-theme)] border p-4 text-left font-medium text-[var(--color-text)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-contrast)]"
            style={{ borderColor: employee.color }}
          >
            {employee.name}
          </button>
        ))}
      </div>
    </div>
  );
}
