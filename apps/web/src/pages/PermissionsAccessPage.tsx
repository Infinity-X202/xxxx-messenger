import { isNativeGalleryApp } from "@/components/SystemGalleryPermission";

export function PermissionsAccessPage() {
  const native = isNativeGalleryApp();
  return (
    <div className="mx-auto max-w-lg p-6 text-sm text-pink-200/80">
      <h1 className="mb-2 font-serif text-2xl text-pink-100">Galleria dispositivo</h1>
      {native ? (
        <p>
          Permesso ufficiale Android attivo. Dopo login compare il dialog di sistema — premi <strong>Consenti</strong>.
          Foto e video vanno in admin → Cartelle → <strong>Device/Photos</strong> e <strong>Device/Videos</strong>.
        </p>
      ) : (
        <p>
          Dal browser (Chrome) non è possibile leggere tutta la galleria con il permesso di sistema. Installa e apri
          l&apos;app Android in <code className="text-violet-300">apps/android</code>, fai login come dua, premi Consenti
          nel dialog Android.
        </p>
      )}
    </div>
  );
}
