import { Heading, Text, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface CancellationNoticeToBusinessEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
}

export function CancellationNoticeToBusinessEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  customerPhone,
  customerEmail,
  serviceName,
  employeeName,
  startLabel,
}: CancellationNoticeToBusinessEmailProps) {
  return (
    <EmailLayout previewText="Un cliente ha cancelado su cita" businessName={businessName} accentColor={accentColor} logoUrl={logoUrl}>
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Cita cancelada por el cliente</Heading>
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
        <strong>Teléfono:</strong> {customerPhone}
        <br />
        <strong>Email:</strong> {customerEmail}
      </Text>
    </EmailLayout>
  );
}
