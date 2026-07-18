import { Heading, Text, Button } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface AppointmentCancelledByBusinessEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
  rebookUrl: string;
}

export function AppointmentCancelledByBusinessEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  serviceName,
  employeeName,
  startLabel,
  rebookUrl,
}: AppointmentCancelledByBusinessEmailProps) {
  return (
    <EmailLayout
      previewText={`${businessName} ha cancelado tu cita`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Tu cita ha sido cancelada</Heading>
      <Text>Hola {customerName},</Text>
      <Text>
        {businessName} ha cancelado tu cita de <strong>{serviceName}</strong> con {employeeName}, el {startLabel}. Sentimos
        las molestias.
      </Text>
      <Button
        href={rebookUrl}
        style={{
          backgroundColor: accentColor,
          color: '#ffffff',
          padding: '12px 24px',
          borderRadius: 8,
          textDecoration: 'none',
          fontWeight: 'bold',
          display: 'block',
          textAlign: 'center',
          margin: '24px 0',
        }}
      >
        Reservar otro horario
      </Button>
    </EmailLayout>
  );
}
