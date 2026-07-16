import { Heading, Text, Button, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface BookingPendingApprovalEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
  confirmUrl: string;
}

export function BookingPendingApprovalEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  serviceName,
  employeeName,
  startLabel,
  confirmUrl,
}: BookingPendingApprovalEmailProps) {
  return (
    <EmailLayout
      previewText={`Confirma tu email — tu solicitud en ${businessName} está pendiente de aprobación`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Confirma tu email</Heading>
      <Text>Hola {customerName},</Text>
      <Text>
        Hemos recibido tu solicitud de cita para <strong>{serviceName}</strong> con {employeeName} en {businessName},
        el {startLabel}.
      </Text>
      <Text>
        Este negocio revisa manualmente cada solicitud. Primero confirma tu email con el botón de abajo (tienes 30
        minutos); después, el negocio deberá aprobar tu cita. Te avisaremos por email en cuanto lo haga.
      </Text>
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
        Confirmar email
      </Button>
      <Hr />
      <Text style={{ fontSize: 12, color: '#6b7280' }}>Si no has solicitado esta cita, puedes ignorar este email.</Text>
    </EmailLayout>
  );
}
