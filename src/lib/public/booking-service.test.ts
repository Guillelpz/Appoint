import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { bookAppointmentBySlug } from './booking-service';
import { INVALID_INPUT_MESSAGE } from './error-messages';
import { FakeEmailSender } from '../../test/fake-email-sender';

const NOW = new Date('2026-07-13T08:00:00.000Z');
const VALID_START = new Date('2026-07-14T08:00:00.000Z');

describe('bookAppointmentBySlug', () => {
  it('crea la cita y devuelve los tokens cuando todo es correcto', async () => {
    const seed = await seedDemoBusiness(prisma);
    const emailSender = new FakeEmailSender();

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente servicio',
      customerPhone: '+34699000001',
      customerEmail: 'servicio@example.com',
      ipAddress: '198.51.100.60',
      now: NOW,
      emailSender,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmToken).toBeTruthy();
      expect(result.cancelToken).toBeTruthy();
      expect(result.pendingApproval).toBe(false);
    }
  });

  it('marca pendingApproval en true si el negocio tiene manualApproval activado', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.business.update({ where: { id: seed.business.id }, data: { manualApproval: true } });
    const emailSender = new FakeEmailSender();

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente aprobación',
      customerPhone: '+34699000002',
      customerEmail: 'aprobacion@example.com',
      ipAddress: '198.51.100.61',
      now: NOW,
      emailSender,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pendingApproval).toBe(true);
    }
  });

  it('envía el email de confirmación al cliente cuando la reserva no requiere aprobación manual', async () => {
    const seed = await seedDemoBusiness(prisma);
    const emailSender = new FakeEmailSender();

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente email',
      customerPhone: '+34699000020',
      customerEmail: 'email-confirmacion@example.com',
      ipAddress: '198.51.100.70',
      now: NOW,
      emailSender,
    });

    expect(result.ok).toBe(true);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('email-confirmacion@example.com');
    expect(emailSender.sent[0].subject).toContain('Salón Aura');
  });

  it('envía la solicitud pendiente al cliente y el aviso al negocio cuando manualApproval está activo', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.business.update({ where: { id: seed.business.id }, data: { manualApproval: true } });
    const emailSender = new FakeEmailSender();

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente aprobación email',
      customerPhone: '+34699000021',
      customerEmail: 'email-aprobacion@example.com',
      ipAddress: '198.51.100.71',
      now: NOW,
      emailSender,
    });

    expect(result.ok).toBe(true);
    expect(emailSender.sent).toHaveLength(2);
    expect(emailSender.sent.map((m) => m.to).sort()).toEqual(
      ['email-aprobacion@example.com', 'hola@salonaura.example'].sort()
    );
  });

  it('no envía ningún email si la reserva falla', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.blacklistEntry.create({
      data: { businessId: seed.business.id, email: 'vetado-email@example.com', reason: 'No presentado' },
    });
    const emailSender = new FakeEmailSender();

    await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Vetado email',
      customerPhone: '+34699000022',
      customerEmail: 'vetado-email@example.com',
      ipAddress: '198.51.100.72',
      now: NOW,
      emailSender,
    });

    expect(emailSender.sent).toHaveLength(0);
  });

  it('la reserva sigue teniendo éxito aunque el envío de email falle', async () => {
    const seed = await seedDemoBusiness(prisma);
    const failingSender = { send: async () => { throw new Error('fallo de red simulado'); } };

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente resiliente',
      customerPhone: '+34699000023',
      customerEmail: 'resiliente@example.com',
      ipAddress: '198.51.100.73',
      now: NOW,
      emailSender: failingSender,
    });

    expect(result.ok).toBe(true);
  });

  it('devuelve mensaje amable y sin alternativas para BLACKLISTED', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.blacklistEntry.create({
      data: { businessId: seed.business.id, email: 'vetado-servicio@example.com', reason: 'No presentado' },
    });
    const emailSender = new FakeEmailSender();

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Vetado',
      customerPhone: '+34699000003',
      customerEmail: 'vetado-servicio@example.com',
      ipAddress: '198.51.100.62',
      now: NOW,
      emailSender,
    });

    expect(result).toEqual({
      ok: false,
      message: 'No podemos completar tu reserva en este negocio. Si crees que es un error, contacta directamente con ellos.',
      alternativeSlots: [],
    });
  });

  it('devuelve huecos alternativos ese mismo día cuando el hueco se acaba de ocupar (SLOT_TAKEN)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const raceStart = new Date('2026-07-14T14:00:00.000Z'); // 16:00 local, bloque de Carlos

    const attempt = (phone: string, email: string) =>
      bookAppointmentBySlug(prisma, {
        slug: 'salon-aura',
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.carlos.id,
        start: raceStart,
        customerName: 'Cliente carrera servicio',
        customerPhone: phone,
        customerEmail: email,
        ipAddress: '198.51.100.63',
        now: NOW,
        emailSender: new FakeEmailSender(),
      });

    const [resultA, resultB] = await Promise.all([
      attempt('+34699000004', 'carrera-servicio-a@example.com'),
      attempt('+34699000005', 'carrera-servicio-b@example.com'),
    ]);

    const results = [resultA, resultB];
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    // El hueco solo puede acabar ocupado por una de las dos peticiones (la
    // otra siempre pierde: al menos una comprobación previa de disponibilidad
    // se ejecuta antes de que cualquiera confirme, así que siempre hay un
    // ganador y un perdedor).
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    const loser = failed[0];
    if (!loser.ok) {
      // La petición perdedora puede recibir dos motivos igual de legítimos
      // según el entrelazado real de E/S entre las dos conexiones
      // concurrentes (no es determinista y no se puede forzar desde el test):
      // - SLOT_TAKEN: ambas superan la comprobación previa de disponibilidad
      //   antes de que cualquiera confirme, y la red de seguridad del índice
      //   único (employeeId, start) en createAppointment detecta el choque en
      //   el INSERT. bookAppointmentBySlug calcula entonces huecos
      //   alternativos ese mismo día.
      // - EMPLOYEE_UNAVAILABLE: la petición perdedora se retrasa lo bastante
      //   como para que su propia comprobación previa de disponibilidad
      //   (fuera de la transacción) se ejecute después de que la otra ya
      //   haya confirmado la cita, así que ve el hueco como ya ocupado antes
      //   de intentar el INSERT. No lleva huecos alternativos: solo se
      //   calculan para SLOT_TAKEN (ver booking-service.ts).
      if (loser.message === 'Vaya, ese hueco se acaba de ocupar. Te proponemos otras horas disponibles:') {
        expect(loser.alternativeSlots.length).toBeGreaterThan(0);
      } else {
        expect(loser.message).toBe('Ese profesional ya no tiene disponible este hueco. Elige otro horario o profesional.');
        expect(loser.alternativeSlots).toEqual([]);
      }
    }
  });

  it('devuelve el mensaje de BUSINESS_NOT_FOUND si el slug no existe', async () => {
    const seed = await seedDemoBusiness(prisma);
    const emailSender = new FakeEmailSender();

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'no-existe',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Sin negocio',
      customerPhone: '+34699000006',
      customerEmail: 'sinnegocio-servicio@example.com',
      ipAddress: '198.51.100.64',
      now: NOW,
      emailSender,
    });

    expect(result).toEqual({
      ok: false,
      message: 'No encontramos este negocio. Puede que el enlace ya no esté disponible.',
      alternativeSlots: [],
    });
  });

  it('rechaza un email malformado sin crear ningún cliente nuevo', async () => {
    const seed = await seedDemoBusiness(prisma);
    const customersBefore = await prisma.customer.count({ where: { businessId: seed.business.id } });
    const emailSender = new FakeEmailSender();

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente inválido',
      customerPhone: '+34699000007',
      customerEmail: 'no-es-un-email',
      ipAddress: '198.51.100.65',
      now: NOW,
      emailSender,
    });

    expect(result).toEqual({
      ok: false,
      message: INVALID_INPUT_MESSAGE,
      alternativeSlots: [],
    });

    const customersAfter = await prisma.customer.count({ where: { businessId: seed.business.id } });
    expect(customersAfter).toBe(customersBefore);
  });

  it('normaliza espacios y mayúsculas en los datos del cliente antes de persistir', async () => {
    const seed = await seedDemoBusiness(prisma);
    const emailSender = new FakeEmailSender();

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: '  Cliente Normalizado  ',
      customerPhone: '+34 699 00-00-08',
      customerEmail: 'Normalizado@Example.com',
      ipAddress: '198.51.100.66',
      now: NOW,
      emailSender,
    });

    expect(result.ok).toBe(true);

    const customer = await prisma.customer.findUnique({
      where: { businessId_email: { businessId: seed.business.id, email: 'normalizado@example.com' } },
    });
    expect(customer).not.toBeNull();
    expect(customer?.phone).toBe('+34699000008');
    expect(customer?.email).toBe('normalizado@example.com');
  });
});
