import { Heading, Text, Button, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface OwnerInvitationEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  invitationUrl: string;
}

export function OwnerInvitationEmail({ businessName, accentColor, logoUrl, invitationUrl }: OwnerInvitationEmailProps) {
  return (
    <EmailLayout
      previewText={`Te han dado de alta como dueño de ${businessName} en Appoint`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>¡Bienvenido a Appoint!</Heading>
      <Text>
        Se ha dado de alta <strong>{businessName}</strong> en Appoint y se te ha asignado como dueño. Para empezar a
        gestionar tu agenda, crea tu contraseña de acceso al panel:
      </Text>
      <Button
        href={invitationUrl}
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
        Crear mi contraseña
      </Button>
      <Hr />
      <Text style={{ fontSize: 12, color: '#6b7280' }}>
        Si no esperabas este email, puedes ignorarlo: el enlace caduca y no da acceso a nada por sí solo.
      </Text>
    </EmailLayout>
  );
}
