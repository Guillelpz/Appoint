import { Heading, Text, Button } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface AppointmentRejectedEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  serviceName: string;
  startLabel: string;
  rebookUrl: string;
}

export function AppointmentRejectedEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  serviceName,
  startLabel,
  rebookUrl,
}: AppointmentRejectedEmailProps) {
  return (
    <EmailLayout
      previewText={`${businessName} no puede atender tu solicitud de cita`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>No hemos podido confirmar tu cita</Heading>
      <Text>Hola {customerName},</Text>
      <Text>
        {businessName} no puede atender tu solicitud de <strong>{serviceName}</strong> para el {startLabel}.
      </Text>
      <Text>Puedes elegir otro horario disponible cuando quieras:</Text>
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
