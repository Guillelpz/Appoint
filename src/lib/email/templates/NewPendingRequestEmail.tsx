import { Heading, Text, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface NewPendingRequestEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  serviceName: string;
  employeeName: string;
  startLabel: string;
}

export function NewPendingRequestEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  customerPhone,
  customerEmail,
  serviceName,
  employeeName,
  startLabel,
}: NewPendingRequestEmailProps) {
  return (
    <EmailLayout
      previewText="Nueva solicitud de cita pendiente de aprobación"
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Nueva solicitud de cita</Heading>
      <Text>Tenéis una nueva solicitud pendiente de aprobación:</Text>
      <Text>
        <strong>Servicio:</strong> {serviceName}
        <br />
        <strong>Profesional:</strong> {employeeName}
        <br />
        <strong>Fecha:</strong> {startLabel}
      </Text>
      <Hr />
      <Text>
        <strong>Cliente:</strong> {customerName}
        <br />
        <strong>Teléfono:</strong> {customerPhone ?? 'No indicado'}
        <br />
        <strong>Email:</strong> {customerEmail ?? 'No indicado'}
      </Text>
      <Text style={{ fontSize: 12, color: '#6b7280' }}>
        El cliente debe confirmar su email antes de que la solicitud pueda aprobarse.
      </Text>
    </EmailLayout>
  );
}
