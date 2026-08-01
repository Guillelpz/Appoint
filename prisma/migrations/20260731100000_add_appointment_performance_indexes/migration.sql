-- CreateIndex
CREATE INDEX "Appointment_businessId_start_idx" ON "Appointment"("businessId", "start");

-- CreateIndex
CREATE INDEX "Appointment_businessId_customerPhone_idx" ON "Appointment"("businessId", "customerPhone");

-- CreateIndex
CREATE INDEX "Appointment_businessId_customerEmail_idx" ON "Appointment"("businessId", "customerEmail");

-- CreateIndex
CREATE INDEX "Appointment_status_start_idx" ON "Appointment"("status", "start");

-- DropIndex
-- Redundante desde que existe "Appointment_businessId_start_idx": Postgres
-- resuelve por el prefijo del compuesto cualquier consulta que filtre solo
-- por businessId. Mantenerlo solo encarecia cada escritura de la tabla de
-- mas inserciones de la app.
DROP INDEX "Appointment_businessId_idx";
