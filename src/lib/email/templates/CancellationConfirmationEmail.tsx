import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface CancellationConfirmationEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
}

export function CancellationConfirmationEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  serviceName,
  employeeName,
  startLabel,
}: CancellationConfirmationEmailProps) {
  return (
    <EmailLayout
      previewText={`Tu cita en ${businessName} ha sido cancelada`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Cita cancelada</Heading>
      <Text>Hola {customerName},</Text>
      <Text>
        Tu cita de <strong>{serviceName}</strong> con {employeeName} en {businessName}, el {startLabel}, ha sido
        cancelada correctamente.
      </Text>
      <Text>Si quieres reservar otra cita, visita de nuevo la página del negocio.</Text>
    </EmailLayout>
  );
}
