-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "invitationCompletedAt" TIMESTAMP(3);

-- Backfill: los dueños dados de alta ANTES de esta migración (incluido el
-- dueño demo del seed, creado directamente con createUser({email_confirm:
-- true}) sin pasar por /panel/invitacion) no tienen forma de disparar la
-- señal nueva por sí mismos. Se marcan como completados usando su
-- "createdAt" como aproximación razonable (no hay un dato mejor
-- disponible): así dejan de mostrar el botón "Reenviar invitación" en
-- /admin/negocios. Las memberships OWNER creadas a partir de ahora por
-- createPlatformBusiness nacen con invitationCompletedAt = NULL (pendiente),
-- que es el comportamiento por defecto de una columna nullable sin DEFAULT.
UPDATE "Membership" SET "invitationCompletedAt" = "createdAt" WHERE "role" = 'OWNER';
