import { Tracer } from "@/components/landing/tracer";
import { Features } from "@/components/landing/features";
import { DocsPreview } from "@/components/landing/docs-preview";
import { Hero } from "@/components/layout/hero";
import { Contributors } from "@/components/landing/contributors";

export default function HomePage() {
  return (
    <div className="mx-8 flex min-h-screen flex-col items-center justify-center py-16">
      <Hero />
      <Tracer />
      <Features />
      <Contributors />
    </div>
  );
}
