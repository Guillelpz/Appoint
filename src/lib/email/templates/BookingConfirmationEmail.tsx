import { Heading, Text, Button, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface BookingConfirmationEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
  confirmUrl: string;
}

export function BookingConfirmationEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  serviceName,
  employeeName,
  startLabel,
  confirmUrl,
}: BookingConfirmationEmailProps) {
  return (
    <EmailLayout
      previewText={`Confirma tu cita en ${businessName}`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Confirma tu cita</Heading>
      <Text>Hola {customerName},</Text>
      <Text>
        Hemos recibido tu solicitud de cita para <strong>{serviceName}</strong> con {employeeName} en {businessName},
        el {startLabel}.
      </Text>
      <Text>Confirma tu email para asegurar tu hueco. Tienes 30 minutos desde la reserva antes de que se libere.</Text>
      <Button
        href={confirmUrl}
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
        Confirmar cita
      </Button>
      <Hr />
      <Text style={{ fontSize: 12, color: '#6b7280' }}>Si no has solicitado esta cita, puedes ignorar este email.</Text>
    </EmailLayout>
  );
}
