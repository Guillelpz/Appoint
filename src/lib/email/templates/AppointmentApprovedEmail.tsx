import { Heading, Text, Button, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface AppointmentApprovedEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
  manageUrl: string;
}

export function AppointmentApprovedEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  serviceName,
  employeeName,
  startLabel,
  manageUrl,
}: AppointmentApprovedEmailProps) {
  return (
    <EmailLayout
      previewText={`¡Tu cita está confirmada en ${businessName}!`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>¡Tu cita está confirmada!</Heading>
      <Text>Hola {customerName},</Text>
      <Text>
        Buenas noticias: {businessName} ha confirmado tu cita de <strong>{serviceName}</strong> con {employeeName}, el{' '}
        {startLabel}.
      </Text>
      <Button
        href={manageUrl}
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
        Ver o cancelar mi cita
      </Button>
      <Hr />
      <Text style={{ fontSize: 12, color: '#6b7280' }}>Te esperamos. Si necesitas cambiar algo, usa el enlace de arriba.</Text>
    </EmailLayout>
  );
}
