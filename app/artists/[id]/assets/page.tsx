import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { getArtist } from "@/lib/artists/queries";
import { listAssets } from "@/lib/assets/queries";
import { AssetUpload } from "@/components/forms/asset-upload";
import { AssetGrid } from "@/components/artists/asset-grid";

export default async function AssetsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  const assets = await listAssets(id);
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">{artist.name} — assets</h1>
        <AssetUpload artistId={id} />
        <AssetGrid assets={assets} />
      </main>
    </>
  );
}
