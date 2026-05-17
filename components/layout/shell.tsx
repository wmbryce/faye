import { Nav } from "./nav";
import { cn } from "@/lib/utils";

export function Shell({
  email,
  children,
  className,
}: {
  email: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <Nav email={email} />
      <main className={cn("max-w-6xl mx-auto px-6 lg:px-8 py-10", className)}>
        {children}
      </main>
    </>
  );
}
