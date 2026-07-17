import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

describe('EmailLayout', () => {
  it('incluye el nombre del negocio como texto cuando no hay logo', async () => {
    const html = await render(
      <EmailLayout previewText="Vista previa" businessName="Salón Aura" accentColor="#B25539" logoUrl={null}>
        <Text>Contenido</Text>
      </EmailLayout>
    );

    expect(html).toContain('Salón Aura');
    expect(html).toContain('Contenido');
    expect(html).toContain('name="color-scheme" content="light"');
    expect(html).toContain('name="supported-color-schemes" content="light"');
  });

  it('renderiza sin lanzar cuando se indica un logoUrl', async () => {
    const html = await render(
      <EmailLayout
        previewText="Vista previa"
        businessName="Salón Aura"
        accentColor="#B25539"
        logoUrl="https://example.com/logo.png"
      >
        <Text>Contenido</Text>
      </EmailLayout>
    );

    expect(html).toContain('Contenido');
  });
});
