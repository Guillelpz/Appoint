import type { ReactNode } from 'react';
import { Html, Head, Preview, Body, Container, Section, Text, Img } from '@react-email/components';

export interface EmailLayoutProps {
  previewText: string;
  businessName: string;
  accentColor: string;
  logoUrl?: string | null;
  children: ReactNode;
}

export function EmailLayout({ previewText, businessName, accentColor, logoUrl, children }: EmailLayoutProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{previewText}</Preview>
      <Body
        style={{
          backgroundColor: '#f4f4f5',
          fontFamily: "Georgia, 'Times New Roman', serif",
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container style={{ backgroundColor: '#ffffff', borderRadius: 8, padding: 32, maxWidth: 480 }}>
          <Section style={{ textAlign: 'center', marginBottom: 24 }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={businessName} width={120} style={{ margin: '0 auto' }} />
            ) : (
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: accentColor, margin: 0 }}>{businessName}</Text>
            )}
          </Section>
          {children}
        </Container>
      </Body>
    </Html>
  );
}
