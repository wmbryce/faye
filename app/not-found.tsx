import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="max-w-md mx-auto px-6 py-12">
      <Card>
        <CardContent className="p-6 space-y-3">
          <h1 className="text-xl font-semibold">Not found</h1>
          <p className="text-sm text-muted-foreground">
            The page or resource you requested doesn&apos;t exist (or you don&apos;t have access to it).
          </p>
          <Link href="/">
            <Button size="sm">Go home</Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
