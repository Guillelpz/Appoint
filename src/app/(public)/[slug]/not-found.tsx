export default function NegocioNoEncontrado() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF6F0] px-6 text-center text-[#2B211B]">
      <h1 className="text-2xl font-semibold">Vaya, no encontramos este negocio</h1>
      <p className="max-w-md text-[#6B5D53]">
        Puede que el enlace esté mal escrito o que este negocio ya no esté disponible. Contacta con el negocio para
        obtener el enlace correcto.
      </p>
    </main>
  );
}
