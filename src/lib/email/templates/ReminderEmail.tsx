import { Heading, Text, Button, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface ReminderEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
  cancelUrl: string;
}

export function ReminderEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  serviceName,
  employeeName,
  startLabel,
  cancelUrl,
}: ReminderEmailProps) {
  return (
    <EmailLayout
      previewText={`Recordatorio: tu cita en ${businessName} es mañana`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Recordatorio de tu cita</Heading>
      <Text>Hola {customerName},</Text>
      <Text>
        Te recordamos tu cita de <strong>{serviceName}</strong> con {employeeName} en {businessName}, el {startLabel}.
      </Text>
      <Button
        href={cancelUrl}
        style={{
          backgroundColor: '#ffffff',
          color: accentColor,
          border: `1px solid ${accentColor}`,
          padding: '12px 24px',
          borderRadius: 8,
          textDecoration: 'none',
          fontWeight: 'bold',
          display: 'block',
          textAlign: 'center',
          margin: '24px 0',
        }}
      >
        Cancelar cita
      </Button>
      <Hr />
      <Text style={{ fontSize: 12, color: '#6b7280' }}>
        Si ya no puedes asistir, cancela cuanto antes para liberar el hueco.
      </Text>
    </EmailLayout>
  );
}
