import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
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
    <Shell email={user.email}>
      <PageHeader
        eyebrow={artist.name}
        title="Assets"
        description="Upload once per artist. Faye rotates these across daily ad variants. Images + short video only."
      />
      <div className="mt-8">
        <AssetUpload artistId={id} />
        <AssetGrid assets={assets} />
      </div>
    </Shell>
  );
}
